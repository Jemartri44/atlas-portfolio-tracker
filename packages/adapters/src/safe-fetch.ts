// The `fetch` the sources use when nobody gives them another: it never follows a
// redirect (EODHD carries its key in the address, and a redirect would hand it to
// wherever it points) and it never waits for ever on a source that hangs. The
// jobs compose their own with the same two options.

/** A `fetch` of one address, as the sources use it. */
export type FetchUrl = (url: string) => Promise<Response>;

export const safeFetch =
  (timeoutMs: number): FetchUrl =>
  (url) =>
    fetch(url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
