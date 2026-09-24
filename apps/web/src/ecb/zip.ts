// The CSV inside the ECB's ZIP, in the browser (feature 012, block 3): on a
// phone the user imports what the ECB's page offers, `eurofxref-hist.zip`.
// The platform inflates (`DecompressionStream("deflate-raw")`, in every
// current browser); the directory, the lengths and the CRC-32 are checked here,
// so a damaged file is refused and never read in half. The console does the
// same with `node:zlib` (`packages/adapters/src/ecb/zip.ts`).

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

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/** Whether the bytes start like a ZIP. */
export const isZip = (bytes: Uint8Array): boolean =>
  bytes.length >= 4 && new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) === LOCAL;

const inflate = async (data: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([new Uint8Array(data)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** The bytes of the first entry whose name ends in `suffix`. */
export const entryOfZip = async (zip: Uint8Array, suffix: string): Promise<Uint8Array> => {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== EOCD) {
    end -= 1;
  }
  if (end < 0) {
    throw new ZipUnreadable("no es un ZIP, o está cortado");
  }
  const entries = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  for (let index = 0; index < entries; index += 1) {
    if (at + 46 > zip.length || view.getUint32(at, true) !== CENTRAL) {
      throw new ZipUnreadable("el directorio del ZIP está dañado");
    }
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    if (!name.endsWith(suffix)) {
      continue;
    }
    if (local + 30 > zip.length || view.getUint32(local, true) !== LOCAL) {
      throw new ZipUnreadable("el ZIP está dañado");
    }
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = zip.subarray(start, start + compressed);
    if (data.length !== compressed || (method !== 0 && method !== 8)) {
      throw new ZipUnreadable("el ZIP está cortado o usa una compresión desconocida");
    }
    const bytes = method === 0 ? data : await inflate(data);
    if (bytes.length !== size || crc32(bytes) !== crc) {
      throw new ZipUnreadable("el contenido del ZIP no cuadra con su comprobación");
    }
    return bytes;
  }
  throw new ZipUnreadable(`el ZIP no trae ningún ${suffix}`);
};
