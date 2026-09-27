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
// `recover()`, called before each update, undoes a cut between 2 and 3 when
// `previous/` holds exactly what the manifest records (`ecbRecovery`). A write
// whose condition fails — another run, or the administration — is
// `EcbStoreConflict`, and the run stops without retrying (§8.1 P11).

import { createHash } from "node:crypto";
import type {
  DownloadedHistory,
  EcbHistoryStore,
  StoredHistory,
  StoredHistoryMeta,
} from "@atlas/domain/ecb";
import { activeHistoryOf, ecbRecovery } from "@atlas/domain/jobs";
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

  /** Undoes an activation cut before its manifest, or says the history damaged (plan §7.1). */
  async recover(): Promise<EcbRecovered> {
    const manifest = await this.objects.get(MANIFEST);
    const active = manifest === undefined ? undefined : activeHistoryOf(textOf(manifest.body));
    if (manifest !== undefined && active === undefined) {
      return "damaged";
    }
    const file = active === undefined ? undefined : await this.objects.get(`${DIR}${active.file}`);
    const previous =
      active === undefined ? undefined : await this.objects.get(`${DIR}previous/${active.file}`);
    const decision = ecbRecovery({
      active,
      fileSha256: file === undefined ? undefined : sha256(file.body),
      previousSha256: previous === undefined ? undefined : sha256(previous.body),
    });
    if (decision.kind === "none") {
      return "none";
    }
    if (decision.kind === "damaged") {
      return "damaged";
    }
    await this.put(`${DIR}${decision.file}`, (previous as StoredObject).body, file);
    return "undone";
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
    const read = await this.manifest();
    if (read !== undefined) {
      // 1. The history in force becomes the backup before anything replaces it.
      const current = await this.objects.get(`${DIR}${read.manifest.active.file}`);
      if (current === undefined || sha256(current.body) !== read.manifest.active.sha256) {
        throw new EcbHistoryDamaged(read.manifest.active.file);
      }
      const backup = `${DIR}previous/${read.manifest.active.file}`;
      await this.put(backup, current.body, await this.objects.get(backup));
    }
    // 2. The new file, over whatever is at its name.
    const file = fileOfSource(next.source);
    const meta = this.metaOf(next, file);
    await this.put(`${DIR}${file}`, next.bytes, await this.objects.get(`${DIR}${file}`));
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
