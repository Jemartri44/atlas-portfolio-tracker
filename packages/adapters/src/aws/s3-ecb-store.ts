// `reference/ecb/` in the bucket (feature 016, E2; ADR-0029, third amendment,
// point 2; plan §7.1): the same layout as the folder of the console —
// `manifest.json`, the file in force byte for byte (`eurofxref-hist.csv` or
// `api-exr.csv`), `previous/` and `rejected/` — written by **the ECB job
// only** (one writer per object) and **without `rename` and without a lock**:
// each object with its own conditional write, in this order, so that every
// state in between is safe and known:
//
//   1. `previous/<file in force>` ← the bytes in force        a reader sees the old history
//   2. `<new file>` ← the download                            same name: the file no longer
//                                                             matches the old manifest, and
//                                                             `active()` refuses it; another
//                                                             name: an orphan nobody reads
//   3. `manifest.json` ← the new manifest                     the new history
//
// Every object the three steps write is read **at the start, together with
// the manifest**, and each write is conditioned on **that** read (review of
// PR #106, B1): a run that wrote any of them after this one verified the
// history makes this one stop, so two runs that verified the same history
// never leave one's file under the other's manifest. A write whose condition
// fails — another run, or the administration — is `EcbStoreConflict`, and the
// run stops without retrying (§8.1 P11).
//
// `recover()`, called before each update, undoes a cut between 2 and 3 when
// `previous/` holds exactly what the manifest records (`ecbRecovery`). What it
// cannot undo is **damaged**, and the ECB job then rebuilds the history whole
// from the official ZIP with `rebuild()` (a new generation, conditional too),
// so the cloud never stays stopped on a damaged history. The one mix the
// conditions cannot rule out without a lock — two runs of different sources
// writing each other's file name at once — ends damaged, and is rebuilt.

import { createHash } from "node:crypto";
import type {
  DownloadedHistory,
  EcbHistoryStore,
  StoredHistory,
  StoredHistoryMeta,
} from "@atlas/domain/ecb";
import { activeHistoryOf, type EcbRecovery, ecbRecovery } from "@atlas/domain/jobs";
import { EcbHistoryDamaged, type EcbManifest, fileOfSource } from "../ecb/history-store.js";
import type { ObjectStore, StoredObject } from "./object-store.js";

const DIR = "reference/ecb/";
const MANIFEST = `${DIR}manifest.json`;

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Strict UTF-8, or nothing: bytes that are not text are not a manifest. */
const textOf = (bytes: Uint8Array): string => {
  try {
    return utf8.decode(bytes);
  } catch {
    return "";
  }
};

/** A conditional write of `reference/ecb/` that did not happen: another run wrote first. */
export class EcbStoreConflict extends Error {
  override readonly name = "EcbStoreConflict";
  constructor() {
    super("reference/ecb/ changed while it was being written");
  }
}

export type EcbRecovered = "none" | "undone" | "damaged";

export class S3EcbHistoryStore implements EcbHistoryStore {
  constructor(private readonly objects: ObjectStore) {}

  /** Writes `body` at `key` over what was read there (`stored`), or creates it. */
  private async put(
    key: string,
    body: Uint8Array,
    stored: StoredObject | undefined,
  ): Promise<void> {
    const done =
      stored === undefined
        ? (await this.objects.putIfNoneMatch(key, body)) === "created"
        : (await this.objects.putIfMatch(key, body, stored.etag)) === "written";
    if (!done) {
      throw new EcbStoreConflict();
    }
  }

  private async manifest(): Promise<{ manifest: EcbManifest; stored: StoredObject } | undefined> {
    const stored = await this.objects.get(MANIFEST);
    if (stored === undefined) {
      return undefined;
    }
    const text = textOf(stored.body);
    if (activeHistoryOf(text) === undefined) {
      throw new EcbHistoryDamaged("manifest.json");
    }
    return { manifest: JSON.parse(text) as EcbManifest, stored };
  }

  async active(): Promise<StoredHistory | undefined> {
    const read = await this.manifest();
    if (read === undefined) {
      return undefined;
    }
    const file = await this.objects.get(`${DIR}${read.manifest.active.file}`);
    if (file === undefined || sha256(file.body) !== read.manifest.active.sha256) {
      throw new EcbHistoryDamaged(read.manifest.active.file);
    }
    return { meta: read.manifest.active, text: textOf(file.body) };
  }

  /** What `recover()` sees: the manifest, the file it names, `previous/`, and what to do. */
  private async diagnose(): Promise<{
    decision: EcbRecovery;
    manifest: StoredObject | undefined;
    current?: StoredObject;
    previous?: StoredObject;
  }> {
    const manifest = await this.objects.get(MANIFEST);
    const active = manifest === undefined ? undefined : activeHistoryOf(textOf(manifest.body));
    if (manifest !== undefined && active === undefined) {
      return { decision: { kind: "damaged" }, manifest };
    }
    const current =
      active === undefined ? undefined : await this.objects.get(`${DIR}${active.file}`);
    const previous =
      active === undefined ? undefined : await this.objects.get(`${DIR}previous/${active.file}`);
    const decision = ecbRecovery({
      active,
      fileSha256: current === undefined ? undefined : sha256(current.body),
      previousSha256: previous === undefined ? undefined : sha256(previous.body),
    });
    return {
      decision,
      manifest,
      ...(current === undefined ? {} : { current }),
      ...(previous === undefined ? {} : { previous }),
    };
  }

  /** Undoes an activation cut before its manifest, or says the history damaged (plan §7.1). */
  async recover(): Promise<EcbRecovered> {
    const { decision, current, previous } = await this.diagnose();
    if (decision.kind !== "undo") {
      return decision.kind;
    }
    await this.put(`${DIR}${decision.file}`, (previous as StoredObject).body, current);
    return "undone";
  }

  /**
   * Rewrites a **damaged** history in force from a new download (review of
   * PR #106, B1 (b)): a new generation — the file, then a manifest that names
   * it alone, with no `previous` from the damaged one and the rejected
   * downloads it still names — each written on the object read here. Refused
   * when the history is not damaged (another run repaired it first), and a
   * write in between is `EcbStoreConflict`. What was there stays in the older
   * versions of the bucket.
   */
  async rebuild(next: DownloadedHistory): Promise<StoredHistoryMeta> {
    const state = await this.diagnose();
    if (state.decision.kind !== "damaged") {
      throw new EcbStoreConflict();
    }
    const file = fileOfSource(next.source);
    const target = await this.objects.get(`${DIR}${file}`);
    const text = state.manifest === undefined ? "" : textOf(state.manifest.body);
    const rejected =
      activeHistoryOf(text) === undefined ? [] : (JSON.parse(text) as EcbManifest).rejected;
    const meta = this.metaOf(next, file);
    await this.put(`${DIR}${file}`, next.bytes, target);
    const rebuilt: EcbManifest = { active: meta, rejected };
    await this.put(
      MANIFEST,
      new TextEncoder().encode(`${JSON.stringify(rebuilt, null, 2)}\n`),
      state.manifest,
    );
    return meta;
  }

  private metaOf(next: DownloadedHistory, file: string): StoredHistoryMeta {
    return {
      file,
      source: next.source,
      url: next.url,
      fetched_at: next.fetched_at,
      sha256: sha256(next.bytes),
    };
  }

  async activate(next: DownloadedHistory): Promise<StoredHistoryMeta> {
    // Every object this activation will write is read **first, together with
    // the manifest**, and each write is conditioned on **that** read, never on
    // a read made just before the write (review of PR #106, B1): another run
    // that wrote any of them in between makes this one stop, whatever it wrote.
    const read = await this.manifest();
    const file = fileOfSource(next.source);
    let current: StoredObject | undefined;
    let backup: { key: string; stored: StoredObject | undefined } | undefined;
    if (read !== undefined) {
      current = await this.objects.get(`${DIR}${read.manifest.active.file}`);
      if (current === undefined || sha256(current.body) !== read.manifest.active.sha256) {
        throw new EcbHistoryDamaged(read.manifest.active.file);
      }
      const key = `${DIR}previous/${read.manifest.active.file}`;
      backup = { key, stored: await this.objects.get(key) };
    }
    // The object of step 2: the file in force itself when the source is the
    // same (verified above against the manifest), or the one of the other source.
    const target =
      read !== undefined && read.manifest.active.file === file
        ? current
        : await this.objects.get(`${DIR}${file}`);
    // 1. The history in force becomes the backup before anything replaces it.
    if (backup !== undefined) {
      await this.put(backup.key, (current as StoredObject).body, backup.stored);
    }
    // 2. The new file, over what was read at its name.
    const meta = this.metaOf(next, file);
    await this.put(`${DIR}${file}`, next.bytes, target);
    // 3. The manifest, last, over the one that was read.
    const updated: EcbManifest = {
      active: meta,
      ...(read === undefined
        ? {}
        : { previous: { ...read.manifest.active, file: `previous/${read.manifest.active.file}` } }),
      rejected: read?.manifest.rejected ?? [],
    };
    await this.put(
      MANIFEST,
      new TextEncoder().encode(`${JSON.stringify(updated, null, 2)}\n`),
      read?.stored,
    );
    return meta;
  }

  async keepRejected(next: DownloadedHistory): Promise<StoredHistoryMeta> {
    const read = await this.manifest();
    if (read === undefined) {
      throw new EcbHistoryDamaged("manifest.json");
    }
    const stamp = next.fetched_at.replace(/[:.]/g, "-");
    const file = `rejected/${stamp}-${fileOfSource(next.source)}`;
    const meta = this.metaOf(next, file);
    await this.put(`${DIR}${file}`, next.bytes, undefined);
    const updated: EcbManifest = { ...read.manifest, rejected: [...read.manifest.rejected, meta] };
    await this.put(
      MANIFEST,
      new TextEncoder().encode(`${JSON.stringify(updated, null, 2)}\n`),
      read.stored,
    );
    return meta;
  }
}
