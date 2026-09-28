// The reference data over HTTP (feature 016, E3; `docs/api.md` §6): the
// index of `reference/ecb/` and `prices/`, and one file at a time, with
// `If-None-Match` on the version the device holds. **One client, the
// credential injected**, like the remote ledger: the console with the device
// token of its folder, the web with its cookie (same origin). Every request
// with `redirect: "error"`, so a token never leaves its origin. No rule lives
// here: what an index may be is the domain's (`parseReferenceIndex`).
//
// A subpath of its own (`@atlas/adapters/reference-http`), so that the web
// loads it lazily, never on its boot path.

import { parseErrorAnswer, parseReferenceIndex, RemoteError } from "@atlas/domain/sync";

export interface HttpReferenceOptions {
  readonly origin: string;
  readonly fetch: typeof fetch;
  /** The device token of the console; without it, the cookie of the web travels (same origin). */
  readonly token?: string;
}

export type ReferenceKind = "ecb" | "prices";

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

  const bytesOf = async (response: Response): Promise<Uint8Array> => {
    try {
      return new Uint8Array(await response.arrayBuffer());
    } catch {
      throw new RemoteError("network_failed", response.status);
    }
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
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder().decode(await bytesOf(response)));
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
      return { kind: "file", bytes: await bytesOf(response), version: read };
    },
  };
};

export type HttpReference = ReturnType<typeof httpReference>;
