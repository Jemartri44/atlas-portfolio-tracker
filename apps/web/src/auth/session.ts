// The session of this browser with the API (`docs/api.md` §3). The cookie is `HttpOnly`: the web
// learns whether it is signed in, and until when, from `GET /api/session`.
// Signing in is a **navigation** to `/api/auth/login` — our own origin, so the CSP does not change
// — and the token of Google never reaches this page (ADR-0027, way c). Nothing here configures the
// sync: signing in only serves to sync later, explicitly.
//
// Every request goes to our own origin, carries no `Authorization` and never
// follows a redirect; every `POST` carries `x-amz-content-sha256` over the
// exact bytes of its body (ADR-0027, fact 2).

export type SessionState =
  | { readonly kind: "signed_in"; readonly expiresAt: string }
  | { readonly kind: "signed_out" }
  | { readonly kind: "expired" }
  | { readonly kind: "not_allowed" }
  /** Every session was closed at once, from this device or another (`logout-all`). */
  | { readonly kind: "closed" }
  /** The cloud did not answer as the API does: not deployed, offline, down. */
  | { readonly kind: "unavailable"; readonly code: string };

type Fetch = typeof fetch;

const errorOf = async (response: Response): Promise<{ code?: string; reason?: string }> => {
  try {
    const body = (await response.json()) as {
      error?: { code?: unknown; details?: { reason?: unknown } };
    };
    const code = body.error?.code;
    const reason = body.error?.details?.reason;
    return {
      ...(typeof code === "string" ? { code } : {}),
      ...(typeof reason === "string" ? { reason } : {}),
    };
  } catch {
    return {};
  }
};

const errorCode = async (response: Response): Promise<string | undefined> =>
  (await errorOf(response)).code;

export const readSession = async (request: Fetch = fetch): Promise<SessionState> => {
  let response: Response;
  try {
    response = await request("/api/session", {
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    return { kind: "unavailable", code: "network_failed" };
  }
  if (response.status === 200) {
    const body = (await response.json().catch(() => undefined)) as
      | { signed_in?: unknown; expires_at?: unknown }
      | undefined;
    return body?.signed_in === true && typeof body.expires_at === "string"
      ? { kind: "signed_in", expiresAt: body.expires_at }
      : { kind: "unavailable", code: "transport_rejected" };
  }
  const { code, reason } = await errorOf(response);
  switch (code) {
    case "unauthenticated":
      return { kind: "signed_out" };
    case "session_invalid":
      return reason === "closed" ? { kind: "closed" } : { kind: "expired" };
    case "not_allowed":
      return { kind: "not_allowed" };
    default:
      return { kind: "unavailable", code: code ?? "transport_rejected" };
  }
};

/** Where to go to sign in: a navigation of this same origin. */
export const SIGN_IN_HREF = "/api/auth/login";

/** The SHA-256 of the exact bytes of a body, in hex, as CloudFront wants it before the Lambda. */
export const bodySha256 = async (body: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const post = async (
  path: "/api/auth/logout" | "/api/auth/logout-all",
  request: Fetch,
): Promise<"signed_out" | { readonly code: string }> => {
  const body = "{}";
  let response: Response;
  try {
    response = await request(path, {
      method: "POST",
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-amz-content-sha256": await bodySha256(body),
      },
      body,
    });
  } catch {
    return { code: "network_failed" };
  }
  return response.status === 204
    ? "signed_out"
    : { code: (await errorCode(response)) ?? "transport_rejected" };
};

/** Closes the session: the API clears the cookie, whatever it held. */
export const signOut = (request: Fetch = fetch) => post("/api/auth/logout", request);

/**
 * Closes **every** session, this one included: the API marks the time, and any session issued
 * before it, on any device, stops working at its next request.
 */
export const signOutEverywhere = (request: Fetch = fetch) => post("/api/auth/logout-all", request);
