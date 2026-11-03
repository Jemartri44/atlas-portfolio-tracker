// What the adapters of prices share: the injectable `fetch`, and the one rule about addresses.
// **EODHD and Alpha Vantage carry the key in the URL**, so no address is ever kept: not in an
// error, not in a message, not in a file. A failure is its kind and nothing else; the error of
// `fetch` itself — which may quote the URL — is dropped unread. This is not the `reasonOf` of the
// ECB, which kept `error.message`.

import type { SourceFailureKind, SourceResult } from "@atlas/domain/quotes";

export type Fetch = (url: string) => Promise<Response>;

export const failure = <T>(kind: SourceFailureKind): SourceResult<T> => ({ ok: false, kind });

export interface Answer {
  readonly status: number;
  readonly text: string;
}

/**
 * The most a source may answer, in bytes. The widest real answer, twenty years of closes of one
 * listing, is under 2 MB; a source that sends more is not one of these.
 */
export const MAX_ANSWER_BYTES = 8 * 1024 * 1024;

/** The body as text, or `undefined` when it goes past `MAX_ANSWER_BYTES`: read until then, never more. */
const readCapped = async (response: Response): Promise<string | undefined> => {
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_ANSWER_BYTES || response.body === null) {
    await response.body?.cancel();
    return declared > MAX_ANSWER_BYTES ? undefined : "";
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.length;
    if (total > MAX_ANSWER_BYTES) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const text = new TextDecoder();
  return `${chunks.map((chunk) => text.decode(chunk, { stream: true })).join("")}${text.decode()}`;
};

/** The status and the body, or `undefined` when the request never got an answer or it was too big. */
export const ask = async (fetchUrl: Fetch, url: string): Promise<Answer | undefined> => {
  try {
    const response = await fetchUrl(url);
    const text = await readCapped(response);
    return text === undefined ? undefined : { status: response.status, text };
  } catch {
    // Deliberately unread: its message may carry the address, and the key in it.
    return undefined;
  }
};
