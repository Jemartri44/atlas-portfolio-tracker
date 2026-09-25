// The ledger as the sync sees it: exact lines and hashes of their bytes
// (ADR-0026, Part A; §6.3 (V14) of prompt 014). Whether a line of the queue is
// already somewhere — in the remote, in what is held back — is decided by its
// exact bytes, never by its id, its fingerprint or a re-serialisation.

import { sha256Hex, utf8Encode } from "../ids/sha256.js";

/** The lines of a ledger file, without their newlines, in file order. */
export const linesOfText = (text: string): string[] => {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
};

/** The bytes the lines make as a file: each followed by its newline. */
export const textOfLines = (lines: readonly string[]): string =>
  lines.map((line) => `${line}\n`).join("");

/** SHA-256 of the first `count` lines as they are in the file. The marker stores it. */
export const prefixSha256 = (lines: readonly string[], count: number): string =>
  sha256Hex(utf8Encode(textOfLines(lines.slice(0, count))));

/** SHA-256 of the bytes of one line, without its newline: how a line is named out of the ledger. */
export const lineSha256 = (line: string): string => sha256Hex(utf8Encode(line));

/** The SHA-256 of zero bytes: the etag of an empty or absent remote (`docs/api.md` §5). */
export const EMPTY_ETAG = sha256Hex(new Uint8Array(0));
