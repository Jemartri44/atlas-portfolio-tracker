// The body of a request that writes (`docs/api.md` §1 and §7): JSON is
// mandatory — one of the defences of ADR-0027 against forged requests — and
// its size is bounded **before** reading it. What `JSON.parse` says about a
// malformed body is never kept: its message copies the start of the body, and
// the body may carry a secret (N3). Only the code travels.

import { type ApiRefusal, refusal } from "./codes.js";

/**
 * Well below the 6 MB a synchronous Function URL admits (block 0, §1.4): the
 * ledger stays under 1-2 MB in twenty years (ADR-0002), and its first upload
 * travels JSON-escaped in one `PUT` (§5.5). A bound of the protocol, not a
 * setting of the user.
 */
export const MAX_BODY_BYTES = 5 * 1024 * 1024;

export const bodyTooLarge = (bytes: number): ApiRefusal | undefined =>
  bytes > MAX_BODY_BYTES ? refusal("body_too_large", { limit: MAX_BODY_BYTES }) : undefined;

export const readJsonBody = (
  contentType: string | undefined,
  text: string,
): { readonly value: unknown } | ApiRefusal => {
  if (contentType === undefined || !/^application\/json\s*(;.*)?$/i.test(contentType.trim())) {
    return refusal("body_not_json", { reason: "content_type" });
  }
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return refusal("body_not_json", { reason: "syntax" });
  }
};

/** A route whose body carries nothing must still send `{}`, and only that. */
export const expectEmptyObject = (value: unknown): ApiRefusal | undefined =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === 0
    ? undefined
    : refusal("body_invalid", { reason: "not_empty_object" });
