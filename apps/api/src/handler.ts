// The handler of the Function URL (feature 015; `docs/api.md`). It **composes
// and decides nothing**: which route admits which credential, how a signed
// payload is read, what an ID token must say, who is allowed and which device
// is alive are `@atlas/domain/access`; the signatures and the reads are the
// adapters'. It never redirects a data route, never writes anything on a
// failure, and logs only codes (`log.ts`).

import type { JsonWebKey } from "node:crypto";
import { base64url, pkceChallenge, Signer, verifyRs256 } from "@atlas/adapters/access";
import {
  AccessSecrets,
  type AccessSecrets as AccessSecretsType,
  DependencyUnavailable,
  DeviceStore,
  type ObjectStore,
  type ParameterStore,
} from "@atlas/adapters/aws";
import { type IdentityProvider, IdentityUnavailable } from "@atlas/adapters/identity";
import {
  type ApiConfig,
  type ApiRefusal,
  admit,
  bodyTooLarge,
  checkIdTokenClaims,
  checkIdTokenHeader,
  cookieValues,
  DEVICE_TOKEN_HEADER,
  deviceRefusal,
  expectEmptyObject,
  findRoute,
  isAllowed,
  keepsPresentedWebDevice,
  LOGIN_COOKIE,
  LOGIN_PAGE_ERRORS,
  type LoginPageError,
  loginPayload,
  newDevice,
  presentedCredential,
  presentedDeviceId,
  readJsonBody,
  readLoginPayload,
  readSessionPayload,
  refusal,
  type SessionPayload,
  sessionPayload,
  sessionView,
  splitJwt,
  subjectAllowed,
} from "@atlas/domain/access";
import { type FunctionUrlEvent, type FunctionUrlResult, normalise, type Request } from "./event.js";
import { type LogEntry, logLine } from "./log.js";
import { accessDeniedPage, loginErrorPage, PAGE_CSP } from "./pages.js";
import {
  clearLoginCookie,
  clearSessionCookie,
  json,
  loginCookie,
  noContent,
  page,
  redirect,
  refused,
  sessionCookie,
} from "./respond.js";

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

export type Handler = (event: FunctionUrlEvent) => Promise<FunctionUrlResult>;

/** What the handler answered, and the code and reason it logs (never anything else). */
interface Outcome {
  readonly result: FunctionUrlResult;
  readonly code?: string;
  readonly reason?: string;
  readonly dependency?: string;
}

const MAX_DEVICE_ATTEMPTS = 3;

export const createHandler = (deps: HandlerDeps): Handler => {
  const { config } = deps;
  const secrets: AccessSecretsType = new AccessSecrets(deps.parameters, deps.now, config);
  const devices = new DeviceStore(deps.objects);
  const redirectUri = `${config.origin}/api/auth/callback`;
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

  const fail = (value: ApiRefusal): Outcome => ({
    result: refused(value),
    code: value.code,
    ...(typeof value.details.reason === "string" ? { reason: value.details.reason } : {}),
  });

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

  /** A new web device: a fresh id and its object, never over another one. */
  const assignWebDevice = async (): Promise<string> => {
    for (let attempt = 0; attempt < MAX_DEVICE_ATTEMPTS; attempt += 1) {
      const deviceId = id(16);
      const created = await devices.create(
        newDevice({ deviceId, type: "web", createdAt: deps.now().toISOString() }),
      );
      if (created === "created") {
        return deviceId;
      }
    }
    // 128 random bits colliding three times means the source of randomness is broken.
    throw new Error("device id collision");
  };

  const login = async (request: Request): Promise<Outcome> => {
    const state = id(32);
    const nonce = id(32);
    const verifier = id(32);
    const payload = loginPayload({
      state,
      nonce,
      verifier,
      did: presentedDeviceId(request.query.get("device_id") ?? undefined),
      now: nowSeconds(),
      ttlSeconds: config.loginTtlSeconds,
    });
    const location = deps.identity.authorizationUrl({
      clientId: await secrets.clientId(),
      redirectUri,
      state,
      nonce,
      codeChallenge: pkceChallenge(verifier),
    });
    return {
      result: redirect(location, [
        loginCookie((await signerNow()).sign("login", payload), config.loginTtlSeconds),
      ]),
    };
  };

  const callback = async (request: Request): Promise<Outcome> => {
    const attempts = cookieValues(request.cookies, LOGIN_COOKIE);
    if (attempts.length === 0) {
      return loginPage("login_attempt_missing");
    }
    const opened =
      attempts.length === 1 ? (await signerNow()).open("login", attempts[0] as string) : undefined;
    if (opened === undefined) {
      return loginPage("login_attempt_invalid");
    }
    const attempt = readLoginPayload(opened, nowSeconds());
    if ("failure" in attempt) {
      // An attempt past its time is gone: the browser dropped the cookie at the same instant.
      return loginPage(
        attempt.failure === "expired" ? "login_attempt_missing" : "login_attempt_invalid",
      );
    }
    // `state` against the transient cookie, **before** exchanging anything (ADR-0027).
    if (request.query.get("state") !== attempt.ok.state) {
      return loginPage("login_state_mismatch");
    }
    const code = request.query.get("code");
    if (request.query.has("error") || code === null || code === "") {
      return loginPage("google_error");
    }
    const clientId = await secrets.clientId();
    let token: string;
    try {
      token = await deps.identity.exchangeCode({
        clientId,
        clientSecret: await secrets.clientSecret(),
        code,
        verifier: attempt.ok.verifier,
        redirectUri,
      });
    } catch (error) {
      if (error instanceof IdentityUnavailable) {
        return { ...loginPage("google_exchange_failed"), reason: error.reason };
      }
      throw error;
    }
    const parts = splitJwt(token);
    const header = parts === undefined ? undefined : jsonOf(parts.header);
    const checked = checkIdTokenHeader(header);
    if (parts === undefined || checked === "id_token_invalid") {
      return loginPage("id_token_invalid");
    }
    let key: JsonWebKey | undefined;
    try {
      key = await deps.identity.publicKey(checked.kid);
    } catch (error) {
      if (error instanceof IdentityUnavailable) {
        return { ...loginPage("google_exchange_failed"), reason: error.reason };
      }
      throw error;
    }
    if (key === undefined || !verifyRs256(key, parts.signingInput, parts.signature)) {
      return {
        ...loginPage("id_token_invalid"),
        reason: key === undefined ? "unknown_kid" : "signature",
      };
    }
    const claims = checkIdTokenClaims(jsonOf(parts.payload), {
      audience: clientId,
      issuers: deps.identity.issuers,
      nonce: attempt.ok.nonce,
      nowSeconds: nowSeconds(),
    });
    if (typeof claims === "string") {
      return loginPage(claims);
    }
    if (!isAllowed(await secrets.allowList(), claims)) {
      return {
        result: page(403, accessDeniedPage(claims.sub), [clearLoginCookie()], PAGE_CSP),
        code: "not_allowed",
      };
    }
    const presented = attempt.ok.did;
    const deviceId =
      presented !== undefined && keepsPresentedWebDevice(await devices.read(presented))
        ? presented
        : await assignWebDevice();
    const session = sessionPayload({
      sub: claims.sub,
      sid: id(16),
      did: deviceId,
      now: nowSeconds(),
      ttlSeconds: config.sessionTtlSeconds,
    });
    return {
      result: redirect(`${config.origin}/ajustes#sincronizacion`, [
        clearLoginCookie(),
        sessionCookie((await signerNow()).sign("session", session), config.sessionTtlSeconds),
      ]),
      code: presented === deviceId ? "signed_in" : "signed_in_new_device",
    };
  };

  const route = async (request: Request): Promise<{ outcome: Outcome; route: string }> => {
    const spec = findRoute(request.method, request.path);
    if (spec === undefined) {
      return { outcome: fail(refusal("not_found")), route: "unmatched" };
    }
    const at = spec.path;
    const admission = admit(
      spec,
      presentedCredential(request.cookies, request.headers.get(DEVICE_TOKEN_HEADER)),
      request.headers.get("origin"),
      config.origin,
    );
    if (admission.kind === "refused") {
      return { outcome: fail(admission.refusal), route: at };
    }
    let body: unknown;
    if (spec.writes) {
      const tooLarge = bodyTooLarge(request.bodyBytes);
      if (tooLarge !== undefined) {
        return { outcome: fail(tooLarge), route: at };
      }
      const read =
        request.bodyText === undefined
          ? refusal("body_not_json", { reason: "encoding" })
          : readJsonBody(request.headers.get("content-type"), request.bodyText);
      if (!("value" in read)) {
        return { outcome: fail(read), route: at };
      }
      body = read.value;
    }
    switch (spec.path) {
      case "/api/auth/login":
        return { outcome: await login(request), route: at };
      case "/api/auth/callback":
        return { outcome: await callback(request), route: at };
      case "/api/auth/logout": {
        const shape = expectEmptyObject(body);
        if (shape !== undefined) {
          return { outcome: fail(shape), route: at };
        }
        return {
          outcome: { result: noContent([clearSessionCookie()]), code: "signed_out" },
          route: at,
        };
      }
      default: {
        // `/api/session`: the only route of E1 that admits the session.
        const session = await sessionOf((admission as { value: string }).value);
        if ("code" in session) {
          return { outcome: fail(session), route: at };
        }
        return { outcome: { result: json(200, sessionView(session)) }, route: at };
      }
    }
  };

  return async (event) => {
    let request: Request | undefined;
    let entry: Omit<LogEntry, "level" | "status">;
    let outcome: Outcome;
    try {
      request = normalise(event);
      const routed = await route(request);
      outcome = routed.outcome;
      entry = { request_id: request.requestId, method: request.method, route: routed.route };
    } catch (error) {
      const base = {
        request_id: request?.requestId ?? "unknown",
        method: request?.method ?? "unknown",
        route:
          request === undefined
            ? "unmatched"
            : (findRoute(request.method, request.path)?.path ?? "unmatched"),
      };
      entry = base;
      // The start and the return of a sign-in are navigations of the browser:
      // whatever fails there is a page, and it clears the attempt (N1 and S1
      // of the review of PR #90). Everywhere else, the JSON of §7.
      const signIn = base.route === "/api/auth/callback" || base.route === "/api/auth/login";
      const name =
        error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : "unknown";
      if (error instanceof DependencyUnavailable) {
        const value = refusal("remote_unavailable", { dependency: error.dependency });
        outcome = signIn
          ? {
              ...loginPage("remote_unavailable"),
              reason: error.reason,
              dependency: error.dependency,
            }
          : { ...fail(value), reason: error.reason, dependency: error.dependency };
      } else {
        outcome = signIn
          ? { ...loginPage("internal"), reason: name }
          : { ...fail(refusal("internal")), reason: name };
      }
    }
    const status = outcome.result.statusCode;
    deps.log(
      logLine({
        level: status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO",
        ...entry,
        status,
        ...(outcome.code === undefined ? {} : { code: outcome.code }),
        ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
        ...(outcome.dependency === undefined ? {} : { dependency: outcome.dependency }),
      }),
    );
    return outcome.result;
  };
};

/** A segment of a JWT as JSON, or nothing: a malformed one is simply not a claim set. */
const jsonOf = (segment: string): unknown => {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
};
