// What the clients of the API share (`httpRemote`, `ApiDraftStore`): one
// request with the credential injected, and the SHA-256 of a body. No Node
// module and no DOM type, so the web can bundle it.

import { RemoteError } from "@atlas/domain/sync";

export interface ApiFetchOptions {
  /** `https://…` of the console's entry, or the web's own origin. */
  readonly origin: string;
  readonly fetch: typeof fetch;
  /** The device token of the console; without it, the cookie of the web travels (same origin). */
  readonly token?: string;
}

/** `cache` is a DOM-only member of `RequestInit`. */
export const NO_STORE = { cache: "no-store" } as const;

export const hex = async (bytes: Uint8Array): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/**
 * One request: `redirect: "error"` (a token never leaves its origin), never
 * from the HTTP cache, and the SHA-256 of the exact body on every POST/PUT
 * (ADR-0027, fact 2). What did not arrive is `network_failed`.
 */
export const apiFetch = async (
  options: ApiFetchOptions,
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
      ...NO_STORE,
      credentials: options.token === undefined ? "same-origin" : "omit",
      ...(payload === undefined ? {} : { body: payload as Uint8Array<ArrayBuffer> }),
    });
  } catch {
    throw new RemoteError("network_failed", undefined);
  }
};
