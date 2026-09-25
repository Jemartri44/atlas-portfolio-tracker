// Which credential a request brings (`docs/api.md` §2): **exactly one**. The
// cookie of the session and the device token together are refused **without
// looking at either** (`credentials_ambiguous`): judged by presence alone.

export const SESSION_COOKIE = "__Host-atlas_session";
export const LOGIN_COOKIE = "__Host-atlas_login";
export const DEVICE_TOKEN_HEADER = "x-atlas-device-token";

/** `a=b; c=d` as pairs, in order; a piece without `=` is dropped (it names no cookie). */
export const parseCookieHeader = (header: string): [string, string][] =>
  header
    .split(";")
    .map((piece) => piece.trim())
    .filter((piece) => piece.includes("="))
    .map((piece) => {
      const at = piece.indexOf("=");
      return [piece.slice(0, at).trim(), piece.slice(at + 1).trim()];
    });

export type Presented =
  | { readonly kind: "none" }
  | { readonly kind: "ambiguous" }
  | { readonly kind: "session"; readonly value: string }
  /** The session cookie twice: never "the first one" (bloque 0, §1.4). */
  | { readonly kind: "session_repeated" }
  | { readonly kind: "token"; readonly value: string };

/** Every value of a cookie by name, in order (a name may come twice). */
export const cookieValues = (
  cookies: readonly (readonly [string, string])[],
  name: string,
): string[] => cookies.filter(([key]) => key === name).map(([, value]) => value);

export const presentedCredential = (
  cookies: readonly (readonly [string, string])[],
  deviceToken: string | undefined,
): Presented => {
  const sessions = cookieValues(cookies, SESSION_COOKIE);
  if (sessions.length > 0 && deviceToken !== undefined) {
    return { kind: "ambiguous" };
  }
  if (deviceToken !== undefined) {
    return { kind: "token", value: deviceToken };
  }
  if (sessions.length === 0) {
    return { kind: "none" };
  }
  if (sessions.length > 1) {
    return { kind: "session_repeated" };
  }
  return { kind: "session", value: sessions[0] as string };
};
