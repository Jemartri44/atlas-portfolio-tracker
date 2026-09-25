// The rules of the access to the API (feature 015; ADR-0027, ADR-0033), as a
// **separate entry point** of the domain, like `sync.ts`: which credential a
// request brings, which route admits it, how a signed payload is read, what
// an ID token of Google has to say, who is in the allow list, which device a
// credential belongs to and whether it is alive, and the configuration of the
// Lambda. Pure: the MAC, the RSA signature and every read are the adapters'.
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
  API_CONFIG_VARIABLES,
  type ApiConfig,
  parseApiConfig,
  TOKEN_CEILING_DAYS,
} from "./access/config.js";
export {
  cookieValues,
  DEVICE_TOKEN_HEADER,
  LOGIN_COOKIE,
  type Presented,
  parseCookieHeader,
  presentedCredential,
  SESSION_COOKIE,
} from "./access/cookies.js";
export {
  DEVICE_FORMAT,
  type DeviceObject,
  type DeviceRefusalReason,
  type DeviceState,
  type DeviceType,
  deviceKey,
  deviceRefusal,
  keepsPresentedWebDevice,
  newDevice,
  parseDeviceObject,
  serializeDeviceObject,
} from "./access/device.js";
export {
  checkIdTokenClaims,
  checkIdTokenHeader,
  type IdTokenExpectation,
  type IdTokenFailure,
  splitJwt,
} from "./access/id-token.js";
export { ID22, ID43, instantOf, isId22, isId43, isInstant } from "./access/ids.js";
export {
  type Admission,
  admit,
  findRoute,
  originAccepted,
  ROUTES,
  type RoutePolicy,
  type RouteSpec,
} from "./access/routes.js";
export { presentedDeviceId, type SessionView, sessionView } from "./access/session.js";
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
