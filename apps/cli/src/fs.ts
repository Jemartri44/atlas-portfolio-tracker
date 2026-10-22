// Small file-system helpers shared by the console modules.

import { createHash } from "node:crypto";
import { access } from "node:fs/promises";

export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

/** The SHA-256 of some bytes, in hex: the etag of a ledger. */
export const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
