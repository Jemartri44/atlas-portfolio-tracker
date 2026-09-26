// The devices of the console, as the web sees them (feature 015, E2;
// `docs/api.md` §4.5): the list of tokens and revoking one, **only with the
// session** — the API refuses a token on these routes. Every request goes to
// our own origin, carries no `Authorization`, never follows a redirect, and a
// POST carries `x-amz-content-sha256` over the exact bytes of its body.

import { bodySha256 } from "./session.js";

type Fetch = typeof fetch;

export interface TokenRow {
  readonly token_id: string;
  readonly status: "active" | "expired" | "revoked" | "unreadable";
  readonly device_id?: string;
  readonly device_name?: string;
  readonly issued_at?: string;
  readonly expires_at?: string;
  readonly revoked_at?: string;
  readonly last_sync_at?: string;
  readonly recent?: boolean;
}

export type TokensState =
  | { readonly kind: "list"; readonly tokens: readonly TokenRow[] }
  | { readonly kind: "failed"; readonly code: string };

const codeOf = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code : "transport_rejected";
  } catch {
    return "transport_rejected";
  }
};

export const readTokens = async (request: Fetch): Promise<TokensState> => {
  let response: Response;
  try {
    response = await request("/api/devices/tokens", {
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    return { kind: "failed", code: "network_failed" };
  }
  if (response.status !== 200) {
    return { kind: "failed", code: await codeOf(response) };
  }
  const body = (await response.json().catch(() => undefined)) as { tokens?: unknown } | undefined;
  return Array.isArray(body?.tokens)
    ? { kind: "list", tokens: body.tokens as TokenRow[] }
    : { kind: "failed", code: "transport_rejected" };
};

export const revokeToken = async (
  request: Fetch,
  tokenId: string,
): Promise<"revoked" | { readonly code: string }> => {
  const body = "{}";
  let response: Response;
  try {
    response = await request(`/api/devices/tokens/${encodeURIComponent(tokenId)}/revoke`, {
      method: "POST",
      credentials: "same-origin",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        "x-amz-content-sha256": await bodySha256(body),
      },
      body,
    });
  } catch {
    return { code: "network_failed" };
  }
  return response.status === 200 ? "revoked" : { code: await codeOf(response) };
};
