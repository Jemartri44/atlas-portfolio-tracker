// The identifiers of the access (`docs/api.md` §2 and §3): random values in
// base64url without padding, of a **fixed length** and a closed alphabet, so
// that none of them can carry a `:` or a `/` into a name built from it.

/** 128 bits: a session id. */
export const ID22 = /^[A-Za-z0-9_-]{22}$/;
/** 256 bits: a `state`, a `nonce`, a PKCE verifier or challenge, a secret. */
export const ID43 = /^[A-Za-z0-9_-]{43}$/;

export const isId22 = (value: unknown): value is string =>
  typeof value === "string" && ID22.test(value);

export const isId43 = (value: unknown): value is string =>
  typeof value === "string" && ID43.test(value);

/** Seconds since the epoch as an instant (`2026-10-01T10:00:00Z`, no milliseconds). */
export const instantOf = (seconds: number): string =>
  new Date(seconds * 1000).toISOString().replace(".000Z", "Z");
