// The remote ledger over HTTP (`docs/api.md` §5 and §7): the
// `RemoteLedger` of the console, with its device token, and of the web, with
// its cookie. **One client, the credential injected.** No rule lives here:
// what an answer may be is the domain's (`@atlas/domain/sync`, `answers.ts`).
//
// - Every request goes to `origin` + the path of the API, with
//   `redirect: "error"`: a redirect is a failure, and the token never leaves
//   for another origin (ADR-0033, point 4). The console builds it only with
//   the HTTPS origin of its own entry of `credentials.json`.
// - Every `POST` and `PUT` carries `x-amz-content-sha256`, the SHA-256 of
//   **the exact bytes of the body**, with Web Crypto (ADR-0027, fact 2).
// - The body of `GET /api/ledger` is hashed as it arrived — decompressed, if
//   CloudFront compressed it — and decoded to text
//   without losing anything; an `ETag` that does not say that hash, or bytes
//   that are not UTF-8, are `transport_rejected`.
// - **Only a `rejected.code` holds a line.** An error of the closed list is a
//   `RemoteError` with its code (a `412` sends the sync back to step 1);
//   anything without the shape of the API is `transport_rejected`; what did
//   not arrive is `network_failed`. None of them holds a line.
//
// Web Crypto and `fetch` exist in Node 22 and in the browser: no Node module
// and no DOM type here, so the web can bundle it and the console runs it.

import {
  type AppendEntry,
  type AppendResult,
  etagOfHeader,
  parseAppendAnswer,
  parseErrorAnswer,
  parseInitAnswer,
  RemoteError,
  type RemoteLedger,
  type RemoteSnapshot,
} from "@atlas/domain/sync";
import { decodeUtf8Strict } from "../utf8.js";
import { apiFetch, hex } from "./api-fetch.js";

export interface HttpRemoteOptions {
  /** `https://…` of the console's entry, or the web's own origin. */
  readonly origin: string;
  readonly fetch: typeof fetch;
  /** The device token of the console; without it, the cookie of the web travels (same origin). */
  readonly token?: string;
}

const transportRejected = (status: number | undefined, reason: string): RemoteError =>
  new RemoteError("transport_rejected", status, { reason });

export const httpRemote = (options: HttpRemoteOptions): RemoteLedger => {
  const call = (
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> => apiFetch(options, method, path, body, headers);

  /** The body of an answer, or `network_failed` if it did not arrive whole. */
  const bodyOf = async (response: Response): Promise<Uint8Array> => {
    try {
      return new Uint8Array(await response.arrayBuffer());
    } catch {
      throw new RemoteError("network_failed", response.status);
    }
  };

  const jsonOf = async (response: Response): Promise<unknown> => {
    const bytes = await bodyOf(response);
    try {
      return JSON.parse(decodeUtf8Strict(bytes, false)) as unknown;
    } catch {
      return undefined;
    }
  };

  /** A non-`2xx` answer: its own code if it has the shape of §7, `transport_rejected` if not. */
  const failure = async (response: Response): Promise<RemoteError> => {
    const error = parseErrorAnswer(await jsonOf(response));
    return error === undefined
      ? transportRejected(response.status, "shape")
      : new RemoteError(error.code, response.status, error.details);
  };

  /** A `200` whose body must have the shape `parse` reads. */
  const answer = async <T>(
    response: Response,
    parse: (value: unknown) => T | undefined,
  ): Promise<T> => {
    if (response.status !== 200) {
      throw await failure(response);
    }
    const read = parse(await jsonOf(response));
    if (read === undefined) {
      throw transportRejected(response.status, "shape");
    }
    return read;
  };

  return {
    async read(): Promise<RemoteSnapshot> {
      const response = await call("GET", "/api/ledger");
      if (response.status !== 200) {
        throw await failure(response);
      }
      const bytes = await bodyOf(response);
      const etag = await hex(bytes);
      if (etagOfHeader(response.headers.get("etag")) !== etag) {
        throw transportRejected(response.status, "etag");
      }
      let text: string;
      try {
        text = decodeUtf8Strict(bytes, false);
      } catch {
        throw transportRejected(response.status, "not_utf8");
      }
      return { text, etag };
    },

    async append(entries: readonly AppendEntry[], ifMatch: string): Promise<AppendResult> {
      return answer(
        await call("POST", "/api/ledger/lines", { lines: entries }, { "if-match": `"${ifMatch}"` }),
        parseAppendAnswer,
      );
    },

    async init(content: string, confirmDuplicateIds: readonly string[], ifMatch: string) {
      return answer(
        await call(
          "PUT",
          "/api/ledger",
          { content, confirm_duplicate_ids: confirmDuplicateIds },
          { "if-match": `"${ifMatch}"` },
        ),
        parseInitAnswer,
      );
    },
  };
};
