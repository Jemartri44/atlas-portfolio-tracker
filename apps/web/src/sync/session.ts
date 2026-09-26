// The session of this browser with the API (feature 015, E1; `docs/api.md`
// §3). The cookie is `HttpOnly`: the web learns whether it is signed in, and
// which device id the API assigned it, from `GET /api/session` (P8 (a), B5).
// Signing in is a **navigation** to `/api/auth/login` — our own origin, so
// the CSP does not change — and the token of Google never reaches this page
// (ADR-0027, way c). Nothing here configures the sync: signing in only serves
// to sync later, explicitly.
//
// Every request goes to our own origin, carries no `Authorization` and never
// follows a redirect; every `POST` carries `x-amz-content-sha256` over the
// exact bytes of its body (ADR-0027, fact 2).

export type SessionState =
  | { readonly kind: "signed_in"; readonly expiresAt: string; readonly deviceId: string }
  | { readonly kind: "signed_out" }
  | { readonly kind: "expired" }
  | { readonly kind: "not_allowed" }
  | { readonly kind: "forgotten" }
  /** The cloud did not answer as the API does: not deployed, offline, down. */
  | { readonly kind: "unavailable"; readonly code: string };

type Fetch = typeof fetch;

const errorCode = async (response: Response): Promise<string | undefined> => {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code : undefined;
  } catch {
    return undefined;
  }
};

const isDeviceId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{22}$/.test(value);

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
      | { signed_in?: unknown; expires_at?: unknown; device_id?: unknown }
      | undefined;
    return body?.signed_in === true &&
      typeof body.expires_at === "string" &&
      isDeviceId(body.device_id)
      ? { kind: "signed_in", expiresAt: body.expires_at, deviceId: body.device_id }
      : { kind: "unavailable", code: "transport_rejected" };
  }
  const code = await errorCode(response);
  switch (code) {
    case "unauthenticated":
      return { kind: "signed_out" };
    case "session_invalid":
      return { kind: "expired" };
    case "not_allowed":
      return { kind: "not_allowed" };
    case "device_forgotten":
      return { kind: "forgotten" };
    default:
      return { kind: "unavailable", code: code ?? "transport_rejected" };
  }
};

/** Where to go to sign in, presenting the device id this browser keeps (not a credential). */
export const signInHref = (deviceId: string | undefined): string =>
  deviceId === undefined
    ? "/api/auth/login"
    : `/api/auth/login?device_id=${encodeURIComponent(deviceId)}`;

/** The SHA-256 of the exact bytes of a body, in hex, as CloudFront wants it before the Lambda. */
export const bodySha256 = async (body: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** Closes the session: the API clears the cookie, whatever it held. */
export const signOut = async (
  request: Fetch = fetch,
): Promise<"signed_out" | { readonly code: string }> => {
  const body = "{}";
  let response: Response;
  try {
    response = await request("/api/auth/logout", {
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
  return response.status === 204
    ? "signed_out"
    : { code: (await errorCode(response)) ?? "transport_rejected" };
};
