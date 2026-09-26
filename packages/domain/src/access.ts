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
  API_CONFIG_CEILINGS,
  API_CONFIG_VARIABLES,
  type ApiConfig,
  parseApiConfig,
  TOKEN_CEILING_DAYS,
} from "./access/config.js";
export {
  type ConsoleMode,
  type ConsoleStart,
  entryForSubject,
  isDeviceName,
  isLoopbackPort,
  isPkceVerifier,
  loopbackCallback,
  parseConsoleStart,
  parseExchangeBody,
  type ReissueRefusal,
  reissueRefusal,
} from "./access/console.js";
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
  type CredentialEntry,
  type CredentialsFile,
  EMPTY_CREDENTIALS,
  entryForRemote,
  entryForStart,
  expiryWarning,
  foldersNested,
  isCredentialEntry,
  isHttpsOrigin,
  parseCredentials,
  parseRemoteJson,
  type RemoteJson,
  replacesAnotherOrigin,
  serializeCredentials,
  serializeRemoteJson,
  withEntry,
  withoutEntry,
} from "./access/credentials.js";
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
  matchRoute,
  originAccepted,
  ROUTES,
  type RoutePolicy,
  type RouteSpec,
} from "./access/routes.js";
export {
  fromOwnSite,
  presentedDeviceId,
  type RequestSite,
  type SessionView,
  sessionView,
} from "./access/session.js";
export {
  type ConsoleCodePayload,
  consoleCodePayload,
  consoleLoginPayload,
  isSubject,
  type LoginPayload,
  loginPayload,
  type PayloadReading,
  readConsoleCodePayload,
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
  publishedDevice,
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
  checkToken,
  DEVICE_TOKEN,
  type DeviceTokenParts,
  formatDeviceToken,
  newTokenRecord,
  parseDeviceToken,
  parseTokenRecord,
  revokedRecord,
  serializeTokenRecord,
  type TokenListItem,
  type TokenRecord,
  type TokenStatus,
  tokenIdOfParameterName,
  tokenListItem,
  tokenParameterName,
  tokenParameterPath,
  tokenStatus,
} from "./access/token.js";
