// Strict UTF-8 decoding (malformed bytes throw), shared by the stores, the API
// and the jobs. `ignoreBOM: true` keeps a leading byte-order mark as the
// character it is; `false` drops it. No Node module, so the web can bundle it.

const DROPPING_BOM = new TextDecoder("utf-8", { fatal: true });
const KEEPING_BOM = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export const decodeUtf8Strict = (bytes: Uint8Array, ignoreBOM: boolean): string =>
  (ignoreBOM ? KEEPING_BOM : DROPPING_BOM).decode(bytes);
