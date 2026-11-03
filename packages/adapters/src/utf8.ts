// Strict UTF-8 decoding (malformed bytes throw), shared by the stores, the API
// and the jobs. `ignoreBOM: true` keeps a leading byte-order mark as the
// character it is; `false` drops it. No Node module, so the web can bundle it.

const DROPPING_BOM = new TextDecoder("utf-8", { fatal: true });
const KEEPING_BOM = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** The text of bytes that are UTF-8, or nothing: each caller says in its own way what «not text» means. */
export const utf8TextOrUndefined = (bytes: Uint8Array, ignoreBOM: boolean): string | undefined => {
  try {
    return decodeUtf8Strict(bytes, ignoreBOM);
  } catch {
    return undefined;
  }
};

export const decodeUtf8Strict = (bytes: Uint8Array, ignoreBOM: boolean): string =>
  (ignoreBOM ? KEEPING_BOM : DROPPING_BOM).decode(bytes);
