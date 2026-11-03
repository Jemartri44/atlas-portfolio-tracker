// What every route of the API shares (`docs/api.md` §2): the stores, the clock, the secrets, the
// signer and how the session cookie is checked, in the order of §3. The routes that use them are
// `sign-in.ts` and `handler.ts`, which only matches and dispatches.

import { base64url, Signer } from "@atlas/adapters/access";
import {
  AccessSecrets,
  type AccessSecrets as AccessSecretsType,
  type ObjectStore,
  type ParameterStore,
  readSessionsValidFrom,
} from "@atlas/adapters/aws";
import type { IdentityProvider } from "@atlas/adapters/identity";
import {
  type ApiConfig,
  type ApiRefusal,
  closedByMark,
  LOGIN_PAGE_ERRORS,
  type LoginPageError,
  readSessionPayload,
  refusal,
  type SessionPayload,
  subjectAllowed,
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

export interface ApiContext {
  readonly deps: HandlerDeps;
  readonly config: ApiConfig;
  readonly secrets: AccessSecretsType;
  readonly nowSeconds: () => number;
  readonly id: (bytes: 16 | 32) => string;
  readonly signerNow: () => Promise<Signer>;
  readonly loginPage: (code: LoginPageError) => Outcome;
  readonly sessionOf: (value: string) => Promise<SessionPayload | ApiRefusal>;
}

export const createContext = (deps: HandlerDeps): ApiContext => {
  const { config } = deps;
  const secrets: AccessSecretsType = new AccessSecrets(deps.parameters, deps.now, config);
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

  /**
   * The session of a cookie, checked in the order of `docs/api.md` §3: signature and `typ`,
   * expiry, list, and the mark of logout-all.
   */
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
    return closedByMark(read.ok.iat, await readSessionsValidFrom(deps.objects))
      ? refusal("session_invalid", { reason: "closed" })
      : read.ok;
  };

  return {
    deps,
    config,
    secrets,
    nowSeconds,
    id,
    signerNow,
    loginPage,
    sessionOf,
  };
};
