// The copies `atlas backup` adds (ADR-0032, layer 4): the local folder `documents/` — where the
// user leaves by hand the documentary source of a corporate action — and, with `--from-bucket`, the
// objects of `documents/` and `imports/` of the data bucket, and the exposure the owner types
// (`settings/exposure.json`, which cannot be rebuilt from anything), read **with the role of
// administration** and never written nor deleted there. Every file is verified once written, and
// **nothing is ever overwritten**: a destination that already holds the same bytes is left as it
// is; one with other bytes is refused.

import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { DomainError } from "@atlas/domain";
import { EXPOSURE_KEY, PROJECTION_KEY } from "@atlas/domain/portfolio";
import type { AdminClients } from "../admin/environment.js";
import { sha256 } from "../fs.js";

export interface Copied {
  readonly written: number;
  readonly unchanged: number;
}

/** Writes one file **without overwriting**, and reads it back to verify it. */
const copyVerified = async (
  bytes: Uint8Array,
  destination: string,
): Promise<"written" | "unchanged"> => {
  const existing = await readFile(destination).catch(() => undefined);
  if (existing !== undefined) {
    if (sha256(existing) === sha256(bytes)) {
      return "unchanged";
    }
    throw new DomainError("path_exists", `${destination} already exists with other bytes`, {
      path: destination,
    });
  }
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  await writeFile(destination, bytes, { flag: "wx", mode: 0o400 });
  if (sha256(await readFile(destination)) !== sha256(bytes)) {
    throw new DomainError("backup_mismatch", "the copy does not match its source", {
      path: destination,
    });
  }
  return "written";
};

/**
 * Every regular file under a folder, at any depth, and the entries that are neither files nor
 * folders (links and the like), which a copy would silently leave out. No folder is not an error;
 * a folder that cannot be read is: a copy that says «nothing to copy» over documents it could not
 * see would be a lie about files that cannot be rebuilt.
 */
const filesUnder = async (folder: string): Promise<{ files: string[]; skipped: string[] }> => {
  let entries: Dirent[];
  try {
    entries = await readdir(folder, { recursive: true, withFileTypes: true });
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return { files: [], skipped: [] };
    }
    throw new DomainError("documents_unreadable", `${folder} cannot be read`, { path: folder });
  }
  const files: string[] = [];
  const skipped: string[] = [];
  for (const entry of entries) {
    const path = join(entry.parentPath, entry.name);
    if (entry.isFile()) {
      files.push(path);
    } else if (!entry.isDirectory()) {
      skipped.push(relative(folder, path));
    }
  }
  return { files: files.sort(), skipped: skipped.sort() };
};

/** The local `documents/` beside the ledger, into `<to>/documents/`; what is not a file is `skipped`. */
export const copyLocalDocuments = async (
  ledgerFolder: string,
  to: string,
): Promise<CopiedFromBucket> => {
  const source = join(ledgerFolder, "documents");
  let written = 0;
  let unchanged = 0;
  const { files, skipped } = await filesUnder(source);
  for (const file of files) {
    const outcome = await copyVerified(
      await readFile(file),
      join(to, "documents", relative(source, file)),
    );
    if (outcome === "written") {
      written += 1;
    } else {
      unchanged += 1;
    }
  }
  return { written, unchanged, skipped };
};

/** A key of the bucket as a relative path of the disk, or nothing: never out of the destination. */
const safeKey = (key: string): string | undefined => {
  const parts = key.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..") || /[\\:\0]/.test(key)) {
    return undefined;
  }
  return join(...parts);
};

/** What the copy of the bucket did, and the keys it would not write to disk. */
export interface CopiedFromBucket extends Copied {
  readonly skipped: readonly string[];
}

/**
 * `documents/` and `imports/` of the bucket, and the exposure if there is one (no object is not an
 * error), into `<to>/bucket/…`, only reading. A key that is not a plain path is **skipped**, said, and the copy
 * goes on: one odd
 * key does not leave every other document without its copy.
 */
export const copyBucketFolders = async (
  clients: AdminClients,
  to: string,
): Promise<CopiedFromBucket> => {
  let written = 0;
  let unchanged = 0;
  const skipped: string[] = [];
  const keys: string[] = [];
  for (const prefix of ["documents/", "imports/"]) {
    keys.push(...(await clients.objects.listAll(prefix)).map((listed) => listed.key));
  }
  keys.push(EXPOSURE_KEY, PROJECTION_KEY);
  for (const key of keys) {
    // The marker of a folder made in the console of S3: nothing to copy.
    if (key.endsWith("/")) {
      continue;
    }
    const path = safeKey(key);
    if (path === undefined) {
      skipped.push(key);
      continue;
    }
    const stored = await clients.objects.get(key);
    if (stored === undefined) {
      continue;
    }
    const outcome = await copyVerified(stored.body, join(to, "bucket", path));
    if (outcome === "written") {
      written += 1;
    } else {
      unchanged += 1;
    }
  }
  return { written, unchanged, skipped };
};
