// What the clients of the API share (`httpRemote`, `ApiDraftStore`): one
// request of the web, with its cookie (same origin), and the SHA-256 of a body. No Node
// module and no DOM type, so the web can bundle it.

import { RemoteError } from "@atlas/domain/sync";

export interface ApiFetchOptions {
  /** The web's own origin. */
  readonly origin: string;
  readonly fetch: typeof fetch;
}

/** `cache` is a DOM-only member of `RequestInit`. */
const NO_STORE = { cache: "no-store" } as const;

export const hex = async (bytes: Uint8Array): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/**
 * One request: `redirect: "error"`, never from the HTTP cache, and the SHA-256
 * of the exact body on every POST and PUT
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
      credentials: "same-origin",
      ...(payload === undefined ? {} : { body: payload as Uint8Array<ArrayBuffer> }),
    });
  } catch {
    throw new RemoteError("network_failed", undefined);
  }
};
