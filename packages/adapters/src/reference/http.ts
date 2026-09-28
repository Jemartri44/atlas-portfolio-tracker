// The reference data over HTTP (feature 016, E3; `docs/api.md` §6): the
// index of `reference/ecb/` and `prices/`, and one file at a time, with
// `If-None-Match` on the version the device holds. **One client, the
// credential injected**, like the remote ledger: the console with the device
// token of its folder, the web with its cookie (same origin). Every request
// with `redirect: "error"`, so a token never leaves its origin. No rule lives
// here: what an index may be is the domain's (`parseReferenceIndex`).
//
// A subpath of its own (`@atlas/adapters/reference-http`), so that the web
// loads it lazily, never on its boot path; and a folder of its own, outside
// `sync/`: it only reads, and the web reaches what configures the sync only
// through its engine (feature 015's guardians).

import { parseErrorAnswer, parseReferenceIndex, RemoteError } from "@atlas/domain/remote-answers";

export interface HttpReferenceOptions {
  readonly origin: string;
  readonly fetch: typeof fetch;
  /** The device token of the console; without it, the cookie of the web travels (same origin). */
  readonly token?: string;
}

export type ReferenceKind = "ecb" | "prices";

/**
 * The most an answer of the reference data may weigh: 20 MB (review of PR
 * #108, N6) — the index, the manifest of the ECB, a file of prices.
 */
export const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;

/**
 * The most **a history of the ECB** may weigh: 64 MB (round 2 of the review
 * of PR #108). `api-exr.csv` is some 12 MB today and grows every day; the
 * ZIP's CSV is smaller. Only these two names under `ecb`.
 */
export const MAX_ECB_HISTORY_BYTES = 64 * 1024 * 1024;

const ECB_HISTORIES: ReadonlySet<string> = new Set(["api-exr.csv", "eurofxref-hist.csv"]);

const limitOf = (kind: ReferenceKind, name: string): number =>
  kind === "ecb" && ECB_HISTORIES.has(name) ? MAX_ECB_HISTORY_BYTES : MAX_REFERENCE_BYTES;

export type ReferenceRead =
  /** The version asked for is the one there: nothing travelled. */
  | { readonly kind: "not_modified" }
  | { readonly kind: "missing" }
  | { readonly kind: "file"; readonly bytes: Uint8Array; readonly version: string };

/** The opaque version of an `ETag`, weak or strong (CloudFront weakens it when it compresses). */
const versionOfHeader = (etag: string | null): string | undefined => {
  const version = etag?.replace(/^W\//, "").replace(/^"|"$/g, "");
  return version === undefined || version === "" ? undefined : version;
};

export const httpReference = (options: HttpReferenceOptions) => {
  const call = async (path: string, headers: Record<string, string> = {}): Promise<Response> => {
    try {
      return await options.fetch(`${options.origin}${path}`, {
        method: "GET",
        headers: {
          ...headers,
          ...(options.token === undefined ? {} : { "x-atlas-device-token": options.token }),
        },
        redirect: "error",
        credentials: options.token === undefined ? "same-origin" : "omit",
      });
    } catch {
      throw new RemoteError("network_failed", undefined);
    }
  };

  const tooLarge = (status: number): RemoteError =>
    new RemoteError("transport_rejected", status, { reason: "too_large" });

  /**
   * The body, **never more than `limit`** (review of PR #108, N6 and round
   * 2): the SHA-256 of the manifest says nothing of the size, and a huge
   * object would be loaded whole into a phone before anything checked it.
   * Refused by the length it says, or counted as it arrives.
   */
  const bytesOf = async (
    response: Response,
    limit: number = MAX_REFERENCE_BYTES,
  ): Promise<Uint8Array> => {
    const said = Number(response.headers.get("content-length"));
    if (Number.isFinite(said) && said > limit) {
      throw tooLarge(response.status);
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      if (reader === undefined) {
        return new Uint8Array(await response.arrayBuffer());
      }
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        total += value.length;
        if (total > limit) {
          await reader.cancel().catch(() => undefined);
          throw tooLarge(response.status);
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof RemoteError) {
        throw error;
      }
      throw new RemoteError("network_failed", response.status);
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    return bytes;
  };

  const failure = async (response: Response): Promise<RemoteError> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(await bytesOf(response)));
    } catch {
      parsed = undefined;
    }
    const error = parseErrorAnswer(parsed);
    return error === undefined
      ? new RemoteError("transport_rejected", response.status, { reason: "shape" })
      : new RemoteError(error.code, response.status, error.details);
  };

  return {
    /** `GET /api/reference/index`. */
    async index() {
      const response = await call("/api/reference/index");
      if (response.status !== 200) {
        throw await failure(response);
      }
      const body = await bytesOf(response);
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder().decode(body));
      } catch {
        parsed = undefined;
      }
      const index = parseReferenceIndex(parsed);
      if (index === undefined) {
        throw new RemoteError("transport_rejected", response.status, { reason: "shape" });
      }
      return index;
    },

    /** `GET /api/reference/<kind>/<name>`, with `If-None-Match` on `version` when there is one. */
    async get(kind: ReferenceKind, name: string, version?: string): Promise<ReferenceRead> {
      const response = await call(
        `/api/reference/${kind}/${name}`,
        version === undefined ? {} : { "if-none-match": `"${version}"` },
      );
      if (response.status === 304) {
        return { kind: "not_modified" };
      }
      if (response.status === 404) {
        return { kind: "missing" };
      }
      if (response.status !== 200) {
        throw await failure(response);
      }
      const read = versionOfHeader(response.headers.get("etag"));
      if (read === undefined) {
        throw new RemoteError("transport_rejected", 200, { reason: "etag" });
      }
      return { kind: "file", bytes: await bytesOf(response, limitOf(kind, name)), version: read };
    },
  };
};

export type HttpReference = ReturnType<typeof httpReference>;
