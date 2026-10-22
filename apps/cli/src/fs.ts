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

/**
 * The bytes as text, strictly UTF-8: `undefined` when they are not. With
 * `ignoreBOM` (the default) a BOM is kept as a character; without it, it is dropped.
 */
export const strictUtf8 = (bytes: Uint8Array, ignoreBOM = true): string | undefined => {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM }).decode(bytes);
  } catch {
    return undefined;
  }
};
