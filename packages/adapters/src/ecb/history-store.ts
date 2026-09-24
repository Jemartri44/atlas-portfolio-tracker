// `reference/ecb/` next to the ledger, on the disk (ADR-0029, point 1; ADR-0006).
//
//   reference/ecb/manifest.json      which file is in force, with its source,
//                                    its address, when it was fetched and its
//                                    SHA-256; the previous one; the rejected
//   reference/ecb/<name>             the history in force, **byte for byte**:
//                                    `eurofxref-hist.csv` from the ZIP, or
//                                    `api-exr.csv` from the API
//   reference/ecb/previous/<name>    the one it replaced, as a backup
//   reference/ecb/rejected/<when>-<name>  a download that did not validate
//
// Every write goes under the lock of the ledger folder (ADR-0026, Part B;
// decision (t) of prompt 012): one lock for every write in the folder. Files
// are written to a temporary name, synced and renamed, so a history is never
// seen in half; the manifest is renamed last, so until then the old one is in
// force.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type {
  DownloadedHistory,
  EcbHistoryStore,
  StoredHistory,
  StoredHistoryMeta,
} from "@atlas/domain/ecb";
import { type HeldLock, withFolderLock } from "../ledger-store/folder-lock.js";

export const ECB_DIR = join("reference", "ecb");
const MANIFEST = "manifest.json";

export interface EcbManifest {
  active: StoredHistoryMeta;
  previous?: StoredHistoryMeta;
  rejected: StoredHistoryMeta[];
}

/** The history's own file name by source: the API is never named as the ZIP. */
export const fileOfSource = (source: DownloadedHistory["source"]): string =>
  source === "zip" ? "eurofxref-hist.csv" : "api-exr.csv";

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** The stored history does not match what its manifest records. */
export class EcbHistoryDamaged extends Error {
  constructor(readonly file: string) {
    super(`reference/ecb/${file} is not the file its manifest records`);
    this.name = "EcbHistoryDamaged";
  }
}

export class FileEcbHistoryStore implements EcbHistoryStore {
  /** `folder` is the ledger's folder. */
  constructor(
    private readonly folder: string,
    private readonly options: { beforeManifest?: () => Promise<void> } = {},
  ) {}

  private get dir(): string {
    return join(this.folder, ECB_DIR);
  }

  async manifest(): Promise<EcbManifest | undefined> {
    try {
      return JSON.parse(await fs.readFile(join(this.dir, MANIFEST), "utf8")) as EcbManifest;
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async active(): Promise<StoredHistory | undefined> {
    const manifest = await this.manifest();
    if (manifest === undefined) {
      return undefined;
    }
    const bytes = await fs.readFile(join(this.dir, manifest.active.file));
    if (sha256(bytes) !== manifest.active.sha256) {
      throw new EcbHistoryDamaged(manifest.active.file);
    }
    return { meta: manifest.active, text: bytes.toString("utf8") };
  }

  /** Writes `bytes` at `path` atomically: a temporary file, synced, renamed. */
  private async writeAtomically(path: string, bytes: Uint8Array, lock: HeldLock): Promise<void> {
    const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
    const handle = await fs.open(temporary, "wx");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await lock.assertOwned();
      await fs.rename(temporary, path);
    } finally {
      await fs.rm(temporary, { force: true });
    }
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
    return withFolderLock(this.folder, async (lock) => {
      await fs.mkdir(join(this.dir, "previous"), { recursive: true });
      const manifest = await this.manifest();
      const file = fileOfSource(next.source);
      if (manifest !== undefined) {
        // The one in force becomes the backup before anything replaces it.
        const current = await fs.readFile(join(this.dir, manifest.active.file));
        await this.writeAtomically(join(this.dir, "previous", manifest.active.file), current, lock);
      }
      const meta = this.metaOf(next, file);
      await this.writeAtomically(join(this.dir, file), next.bytes, lock);
      await this.options.beforeManifest?.();
      const updated: EcbManifest = {
        active: meta,
        ...(manifest === undefined
          ? {}
          : { previous: { ...manifest.active, file: `previous/${manifest.active.file}` } }),
        rejected: manifest?.rejected ?? [],
      };
      await this.writeAtomically(
        join(this.dir, MANIFEST),
        Buffer.from(`${JSON.stringify(updated, null, 2)}\n`),
        lock,
      );
      return meta;
    });
  }

  async keepRejected(next: DownloadedHistory): Promise<StoredHistoryMeta> {
    return withFolderLock(this.folder, async (lock) => {
      await fs.mkdir(join(this.dir, "rejected"), { recursive: true });
      const manifest = (await this.manifest()) as EcbManifest;
      const stamp = next.fetched_at.replace(/[:.]/g, "-");
      const file = `rejected/${stamp}-${fileOfSource(next.source)}`;
      const meta = this.metaOf(next, file);
      await this.writeAtomically(join(this.dir, file), next.bytes, lock);
      const updated: EcbManifest = { ...manifest, rejected: [...manifest.rejected, meta] };
      await this.writeAtomically(
        join(this.dir, MANIFEST),
        Buffer.from(`${JSON.stringify(updated, null, 2)}\n`),
        lock,
      );
      return meta;
    });
  }
}
