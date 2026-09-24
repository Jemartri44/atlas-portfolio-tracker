// What the adapters of prices share: the injectable `fetch`, and the one rule
// about addresses. **EODHD and Alpha Vantage carry the key in the URL**, so
// no address is ever kept: not in an error, not in a message, not in a file
// (§6.3 (e) and §6.4 (e) of prompt 013). A failure is its kind and nothing
// else; the error of `fetch` itself — which may quote the URL — is dropped
// unread. This is not the `reasonOf` of the ECB, which kept `error.message`.

import type { SourceFailureKind, SourceResult } from "@atlas/domain/quotes";

export type Fetch = (url: string) => Promise<Response>;

export const failure = <T>(kind: SourceFailureKind): SourceResult<T> => ({ ok: false, kind });

export interface Answer {
  readonly status: number;
  readonly text: string;
}

/** The status and the body, or `undefined` when the request never got an answer. */
export const ask = async (fetchUrl: Fetch, url: string): Promise<Answer | undefined> => {
  try {
    const response = await fetchUrl(url);
    return { status: response.status, text: await response.text() };
  } catch {
    // Deliberately unread: its message may carry the address, and the key in it.
    return undefined;
  }
};
