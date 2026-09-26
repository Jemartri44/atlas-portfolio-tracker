// Every error the API answers with (`docs/api.md` §7), **each with its own
// literal and its own status**: none is folded into another (mutant 49). The
// body is `{ "error": { "code", "details" } }`, never a sentence: the
// interfaces translate the code.

export const API_ERRORS = {
  unauthenticated: 401,
  credentials_ambiguous: 400,
  session_invalid: 401,
  device_token_invalid: 401,
  device_token_revoked: 401,
  device_token_expired: 401,
  not_allowed: 403,
  forbidden_for_credential: 403,
  origin_rejected: 403,
  device_forgotten: 403,
  body_invalid: 400,
  body_not_json: 415,
  body_too_large: 413,
  not_found: 404,
  internal: 500,
  remote_unavailable: 503,
} as const;

export type ApiErrorCode = keyof typeof API_ERRORS;

export interface ApiRefusal {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
}

export const refusal = (code: ApiErrorCode, details: Record<string, unknown> = {}): ApiRefusal => ({
  status: API_ERRORS[code],
  code,
  details,
});

/**
 * The codes of the pages of the Lambda (`docs/api.md` §3.1): HTML, never read
 * by an HTTP client, each with its own sentence. The access-denied page is
 * not an error page and has no code here.
 */
export const LOGIN_PAGE_ERRORS = {
  login_attempt_missing: 400,
  login_attempt_invalid: 400,
  login_state_mismatch: 400,
  google_error: 400,
  google_exchange_failed: 503,
  id_token_invalid: 400,
  id_token_audience: 400,
  id_token_issuer: 400,
  id_token_expired: 400,
  id_token_nonce: 400,
  email_not_verified: 403,
  remote_unavailable: 503,
  /** Anything nobody expected, on the start or the return of a sign-in (N1 of the review of PR #90). */
  internal: 500,
} as const;

export type LoginPageError = keyof typeof LOGIN_PAGE_ERRORS;
