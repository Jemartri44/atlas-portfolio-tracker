// The one file of a ZIP, with `node:zlib` and nothing else (ADR-0029, point 1:
// no new package). Enough for the ECB's `eurofxref-hist.zip` — a single entry,
// deflated — and strict about the rest: the lengths and the CRC-32 of the
// directory are checked, so a truncated or damaged download is refused
// instead of read in half (verified on the real ZIP on 2026-09-24,
// `specs/012-ecb-reference-rates/questions.md` §4).

import { crc32, inflateRawSync } from "node:zlib";

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** A ZIP that cannot be read, with what is wrong. */
export class ZipUnreadable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipUnreadable";
  }
}

/** The bytes of the first entry whose name ends in `suffix`. */
export const entryOfZip = (
  zip: Uint8Array,
  suffix: string,
): { name: string; bytes: Uint8Array } => {
  const view = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = view.length - 22;
  while (end >= 0 && view.readUInt32LE(end) !== EOCD) {
    end -= 1;
  }
  if (end < 0) {
    throw new ZipUnreadable("no end of central directory: not a ZIP, or truncated");
  }
  const entries = view.readUInt16LE(end + 10);
  let at = view.readUInt32LE(end + 16);
  for (let index = 0; index < entries; index += 1) {
    if (at + 46 > view.length || view.readUInt32LE(at) !== CENTRAL) {
      throw new ZipUnreadable("damaged central directory");
    }
    const method = view.readUInt16LE(at + 10);
    const crc = view.readUInt32LE(at + 16);
    const compressed = view.readUInt32LE(at + 20);
    const size = view.readUInt32LE(at + 24);
    const nameLength = view.readUInt16LE(at + 28);
    const extra = view.readUInt16LE(at + 30);
    const comment = view.readUInt16LE(at + 32);
    const local = view.readUInt32LE(at + 42);
    const name = view.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    at += 46 + nameLength + extra + comment;
    if (!name.endsWith(suffix)) {
      continue;
    }
    if (local + 30 > view.length || view.readUInt32LE(local) !== LOCAL) {
      throw new ZipUnreadable(`damaged local header of ${name}`);
    }
    const start = local + 30 + view.readUInt16LE(local + 26) + view.readUInt16LE(local + 28);
    const data = view.subarray(start, start + compressed);
    if (data.length !== compressed) {
      throw new ZipUnreadable(`${name} is truncated`);
    }
    let bytes: Uint8Array;
    if (method === 0) {
      bytes = data;
    } else if (method === 8) {
      try {
        bytes = inflateRawSync(data);
      } catch (error) {
        throw new ZipUnreadable(`${name} does not inflate: ${(error as Error).message}`);
      }
    } else {
      throw new ZipUnreadable(`${name} uses compression method ${method}`);
    }
    if (bytes.length !== size || crc32(bytes) >>> 0 !== crc) {
      throw new ZipUnreadable(`${name} does not match its size or its CRC-32`);
    }
    return { name, bytes: new Uint8Array(bytes) };
  }
  throw new ZipUnreadable(`no entry ending in ${suffix}`);
};
