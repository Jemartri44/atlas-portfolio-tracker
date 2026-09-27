// The remote ledger over HTTP (feature 015, E3; `docs/api.md` §5 and §7): the
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
//   CloudFront compressed it (block 0 of E3, §23.3) — and decoded to text
//   without losing anything; an `ETag` that does not say that hash, or bytes
//   that are not UTF-8, are `transport_rejected`.
// - **Only a `rejected.code` holds a line.** An error of the closed list is a
//   `RemoteError` with its code (a `412` sends the sync back to step 1);
//   anything without the shape of the API is `transport_rejected`; what did
//   not arrive is `network_failed`. None of them holds a line (V4).
//
// Web Crypto and `fetch` exist in Node 22 and in the browser: no Node module
// and no DOM type here, so the web can bundle it (E4) and the console runs it.

import {
  type AppendEntry,
  type AppendResult,
  type DeviceQueueState,
  etagOfHeader,
  parseAppendAnswer,
  parseErrorAnswer,
  parseInitAnswer,
  parsePublishAnswer,
  RemoteError,
  type RemoteLedger,
  type RemoteSnapshot,
} from "@atlas/domain/sync";

export interface HttpRemoteOptions {
  /** `https://…` of the console's entry, or the web's own origin. */
  readonly origin: string;
  readonly fetch: typeof fetch;
  /** The device token of the console; without it, the cookie of the web travels (same origin). */
  readonly token?: string;
}

const hex = async (bytes: Uint8Array): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const utf8 = new TextDecoder("utf-8", { fatal: true });

const transportRejected = (status: number | undefined, reason: string): RemoteError =>
  new RemoteError("transport_rejected", status, { reason });

export const httpRemote = (options: HttpRemoteOptions): RemoteLedger => {
  const call = async (
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> => {
    const sent: Record<string, string> = { ...headers };
    if (options.token !== undefined) {
      sent["x-atlas-device-token"] = options.token;
    }
    let payload: Uint8Array | undefined;
    if (body !== undefined) {
      payload = new TextEncoder().encode(JSON.stringify(body));
      sent["content-type"] = "application/json";
      sent["x-amz-content-sha256"] = await hex(payload);
    }
    try {
      return await options.fetch(`${options.origin}${path}`, {
        method,
        headers: sent,
        redirect: "error",
        credentials: options.token === undefined ? "same-origin" : "omit",
        ...(payload === undefined ? {} : { body: payload as Uint8Array<ArrayBuffer> }),
      });
    } catch {
      throw new RemoteError("network_failed", undefined);
    }
  };

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
      return JSON.parse(utf8.decode(bytes)) as unknown;
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
        text = utf8.decode(bytes);
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

    async publish(state: DeviceQueueState) {
      return answer(await call("PUT", "/api/sync/devices/self", state), parsePublishAnswer);
    },
  };
};
