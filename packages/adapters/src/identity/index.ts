// The door `@atlas/adapters/identity` (feature 015): the port of the identity
// provider and Google. Node only, never reached by the web.

export {
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GOOGLE_ISSUERS,
  GOOGLE_JWKS_URI,
  GOOGLE_TOKEN_ENDPOINT,
  GoogleIdentity,
  type GoogleOptions,
} from "./google.js";
export {
  type AuthorizationRequest,
  type CodeExchange,
  type IdentityProvider,
  IdentityUnavailable,
} from "./provider.js";
