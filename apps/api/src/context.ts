// What every route of the API shares (`docs/api.md` §2): the stores, the clock, the secrets, the
// signer and the two ways of checking a credential — the session cookie and the device token —
// in the order of §2.2 and §3. The routes that use them are `sign-in.ts` and `device-tokens.ts`;
// `handler.ts` only matches and dispatches.

import { base64url, Signer, sameSecret } from "@atlas/adapters/access";
import {
  AccessSecrets,
  type AccessSecrets as AccessSecretsType,
  DeviceStore,
  type ObjectStore,
  type ParameterStore,
  TokenRegistry,
} from "@atlas/adapters/aws";
import type { IdentityProvider } from "@atlas/adapters/identity";
import {
  type ApiConfig,
  type ApiRefusal,
  checkToken,
  deviceRefusal,
  LOGIN_PAGE_ERRORS,
  type LoginPageError,
  parseDeviceToken,
  readSessionPayload,
  refusal,
  type SessionPayload,
  subjectAllowed,
  type TokenRecord,
} from "@atlas/domain/access";
import type { Outcome } from "./outcome.js";
import { loginErrorPage, PAGE_CSP } from "./pages.js";
import { clearLoginCookie, page } from "./respond.js";

export interface HandlerDeps {
  readonly config: ApiConfig;
  readonly objects: ObjectStore;
  readonly parameters: ParameterStore;
  readonly identity: IdentityProvider;
  readonly now: () => Date;
  /** `n` random bytes (`crypto.randomBytes` in production; deterministic in tests). */
  readonly random: (bytes: number) => Uint8Array;
  /** Where each log line goes (`console.log` in the Lambda). */
  readonly log: (line: string) => void;
}

/** What every route of the API shares: the stores, the clock, the secrets and the checks of the two credentials. */
export interface ApiContext {
  readonly deps: HandlerDeps;
  readonly config: ApiConfig;
  readonly secrets: AccessSecretsType;
  readonly devices: DeviceStore;
  readonly tokens: TokenRegistry;
  /** The errors after which a new token stayed alive, with its public id. */
  readonly leftAlive: WeakMap<object, string>;
  readonly nowSeconds: () => number;
  readonly id: (bytes: 16 | 32) => string;
  readonly signerNow: () => Promise<Signer>;
  readonly loginPage: (code: LoginPageError) => Outcome;
  readonly sessionOf: (value: string) => Promise<SessionPayload | ApiRefusal>;
  readonly tokenOf: (value: string, acceptExpired?: boolean) => Promise<TokenRecord | ApiRefusal>;
}

export const createContext = (deps: HandlerDeps): ApiContext => {
  const { config } = deps;
  const secrets: AccessSecretsType = new AccessSecrets(deps.parameters, deps.now, config);
  const devices = new DeviceStore(deps.objects);
  const leftAlive = new WeakMap<object, string>();
  const tokens = new TokenRegistry(deps.parameters, config.ssmPrefix, {
    project: "atlas",
    env: config.env,
  });
  let signer: { readonly key: string; readonly signer: Signer } | undefined;

  const nowSeconds = (): number => Math.floor(deps.now().getTime() / 1000);
  const id = (bytes: 16 | 32): string => base64url(deps.random(bytes));

  const signerNow = async (): Promise<Signer> => {
    const key = await secrets.sessionKey();
    if (signer?.key !== key) {
      signer = { key, signer: Signer.fromSessionKey(key) };
    }
    return signer.signer;
  };

  /** Every page of the sign-in clears the attempt: it is single use, whatever the outcome. */
  const loginPage = (code: LoginPageError): Outcome => ({
    result: page(
      LOGIN_PAGE_ERRORS[code],
      loginErrorPage(code),
      [clearLoginCookie()],
      PAGE_CSP,
      code === "remote_unavailable" ? { "retry-after": "5" } : {},
    ),
    code,
  });

  /** The session of a cookie, checked in the order of `docs/api.md` §2 and §3: signature and `typ`, expiry, list, device. */
  const sessionOf = async (value: string): Promise<SessionPayload | ApiRefusal> => {
    const opened = (await signerNow()).open("session", value);
    if (opened === undefined) {
      return refusal("session_invalid", { reason: "signature" });
    }
    const read = readSessionPayload(opened, nowSeconds());
    if ("failure" in read) {
      return refusal("session_invalid", { reason: read.failure });
    }
    if (!subjectAllowed(await secrets.allowList(), read.ok.sub)) {
      return refusal("not_allowed");
    }
    const reason = deviceRefusal(await devices.read(read.ok.did), "web");
    return reason === undefined ? read.ok : refusal("device_forgotten", { reason });
  };

  /**
   * The token of a request, checked in the order of `docs/api.md` §2.2: its
   * format **before any name is built**, its record read without cache and
   * without selector, the secret in constant time, revoked, expired (unless
   * the renewal asks), the pair in the list, and its device: it exists, it is
   * a console and it is active.
   */
  const tokenOf = async (
    value: string,
    acceptExpired = false,
  ): Promise<TokenRecord | ApiRefusal> => {
    const parts = parseDeviceToken(value);
    if (parts === undefined) {
      return refusal("device_token_invalid", { reason: "format" });
    }
    const read = await tokens.read(parts.tokenId);
    const checked = checkToken(read, {
      secretMatches: typeof read === "object" && sameSecret(parts.secret, read.secret_sha256),
      nowMs: deps.now().getTime(),
      allowList: await secrets.allowList(),
      acceptExpired,
    });
    if ("status" in checked) {
      return checked;
    }
    const reason = deviceRefusal(await devices.read(checked.ok.device_id), "console");
    return reason === undefined ? checked.ok : refusal("device_forgotten", { reason });
  };

  return {
    deps,
    config,
    secrets,
    devices,
    tokens,
    leftAlive,
    nowSeconds,
    id,
    signerNow,
    loginPage,
    sessionOf,
    tokenOf,
  };
};
