// The rules of the access to the API (ADR-0027): how a signed payload is read, what an ID token
// of Google has to say, who is in the allow list, when every session was closed, and the date of
// the last web sign-in. Pure, over `@atlas/domain` only: the MAC, the RSA signature and every read
// are the adapters'; the HTTP plumbing (routes, codes, cookies, bodies) is the API's own
// (`apps/api/src/access/`). Neither the domain nor the web ever import this package.

export {
  type AllowEntry,
  isAllowed,
  parseAllowList,
  subjectAllowed,
} from "./allow-list.js";
export {
  checkIdTokenClaims,
  checkIdTokenHeader,
  type IdTokenExpectation,
  type IdTokenFailure,
  splitJwt,
} from "./id-token.js";
export { ID22, ID43, instantOf, isId22, isId43 } from "./ids.js";
export {
  closedByMark,
  parseSessionsValidFrom,
  SESSIONS_VALID_FROM_KEY,
  type SessionView,
  serializeSessionsValidFrom,
  sessionView,
} from "./session.js";
export {
  isSubject,
  type LoginPayload,
  loginPayload,
  type PayloadReading,
  readLoginPayload,
  readSessionPayload,
  type SessionPayload,
  SIGNING,
  type SigningPurpose,
  sessionPayload,
  splitSigned,
} from "./signed.js";
export {
  advancesWebSignIn,
  parseWebSignIn,
  serializeWebSignIn,
  WEB_SIGN_IN_KEY,
} from "./web-sign-in.js";
