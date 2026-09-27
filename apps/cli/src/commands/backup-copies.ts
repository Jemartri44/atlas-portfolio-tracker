// The copies `atlas backup` adds in feature 015, E5 (ADR-0032, layer 4; §7
// P5): the local folder `documents/` — where the user leaves by hand the
// documentary source of a corporate action — and, with `--from-bucket`, the
// objects of `documents/` and `imports/` of the data bucket, read **with the
// role of administration** and never written nor deleted there. Every file is
// verified once written, and **nothing is ever overwritten**: a destination
// that already holds the same bytes is left as it is; one with other bytes is
// refused.

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { DomainError } from "@atlas/domain";
import type { AdminClients } from "../admin/environment.js";

export interface Copied {
  readonly written: number;
  readonly unchanged: number;
}

const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** Writes one file **without overwriting**, and reads it back to verify it. */
const copyVerified = async (
  bytes: Uint8Array,
  destination: string,
): Promise<"written" | "unchanged"> => {
  const existing = await readFile(destination).catch(() => undefined);
  if (existing !== undefined) {
    if (sha(existing) === sha(bytes)) {
      return "unchanged";
    }
    throw new DomainError("path_exists", `${destination} already exists with other bytes`, {
      path: destination,
    });
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: "wx" });
  if (sha(await readFile(destination)) !== sha(bytes)) {
    throw new DomainError("backup_mismatch", "the copy does not match its source", {
      path: destination,
    });
  }
  return "written";
};

/** Every file under a folder, at any depth; none when the folder does not exist. */
const filesUnder = async (folder: string): Promise<string[]> => {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
};

/** The local `documents/` beside the ledger, into `<to>/documents/`. */
export const copyLocalDocuments = async (ledgerFolder: string, to: string): Promise<Copied> => {
  const source = join(ledgerFolder, "documents");
  let written = 0;
  let unchanged = 0;
  for (const file of await filesUnder(source)) {
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
  return { written, unchanged };
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
 * `documents/` and `imports/` of the bucket, into `<to>/bucket/…`, only
 * reading. A key that is not a plain path is **skipped**, said, and the copy
 * goes on (review of PR #98, preference accepted by the direction): one odd
 * key does not leave every other document without its copy.
 */
export const copyBucketFolders = async (
  clients: AdminClients,
  to: string,
): Promise<CopiedFromBucket> => {
  let written = 0;
  let unchanged = 0;
  const skipped: string[] = [];
  for (const prefix of ["documents/", "imports/"]) {
    for (const listed of await clients.objects.listAll(prefix)) {
      // The marker of a folder made in the console of S3: nothing to copy.
      if (listed.key.endsWith("/")) {
        continue;
      }
      const path = safeKey(listed.key);
      if (path === undefined) {
        skipped.push(listed.key);
        continue;
      }
      const stored = await clients.objects.get(listed.key);
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
  }
  return { written, unchanged, skipped };
};
