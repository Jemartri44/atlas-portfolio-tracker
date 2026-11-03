// The rules of the access to the API (ADR-0027), as a **separate entry point**
// of the domain, like `sync.ts`: which credential a request brings, which route
// admits it, how a signed payload is read, what an ID token of Google has to
// say, who is in the allow list, when every session was closed, and the
// configuration of the Lambda. Pure: the MAC, the RSA signature and every read are the adapters'.
// The barrel never re-exports any of it, and the web never reaches it.

export {
  type AllowEntry,
  isAllowed,
  parseAllowList,
  subjectAllowed,
} from "./access/allow-list.js";
export { bodyTooLarge, expectEmptyObject, MAX_BODY_BYTES, readJsonBody } from "./access/body.js";
export {
  API_ERRORS,
  type ApiErrorCode,
  type ApiRefusal,
  LOGIN_PAGE_ERRORS,
  type LoginPageError,
  refusal,
} from "./access/codes.js";
export {
  API_CONFIG_CEILINGS,
  API_CONFIG_VARIABLES,
  type ApiConfig,
  parseApiConfig,
} from "./access/config.js";
export {
  cookieValues,
  LOGIN_COOKIE,
  type Presented,
  parseCookieHeader,
  presentedCredential,
  SESSION_COOKIE,
} from "./access/cookies.js";
export {
  checkIdTokenClaims,
  checkIdTokenHeader,
  type IdTokenExpectation,
  type IdTokenFailure,
  splitJwt,
} from "./access/id-token.js";
export { ID22, ID43, instantOf, isId22, isId43 } from "./access/ids.js";
export {
  type Admission,
  admit,
  findRoute,
  matchRoute,
  originAccepted,
  ROUTES,
  type RoutePolicy,
  type RouteSpec,
} from "./access/routes.js";
export {
  closedByMark,
  parseSessionsValidFrom,
  SESSIONS_VALID_FROM_KEY,
  type SessionView,
  serializeSessionsValidFrom,
  sessionView,
} from "./access/session.js";
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
} from "./access/signed.js";
export {
  ifNoneMatchHits,
  type ReferenceEntry,
  type ReferenceKind,
  referenceContentType,
  referenceIndex,
  referenceKey,
  refusalOfRemote,
  requestedEtag,
  versionOf,
} from "./access/sync-routes.js";
export {
  advancesWebSignIn,
  parseWebSignIn,
  serializeWebSignIn,
  WEB_SIGN_IN_KEY,
} from "./access/web-sign-in.js";
export { isInstant } from "./guards.js";
