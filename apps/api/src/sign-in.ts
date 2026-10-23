// The sign-in with Google (`docs/api.md` §3 and §4.1, §4.2): the web's start and return, the
// start of the console's and the return that hands it a one-time code. Which ID token is good,
// who is allowed and which device lives are `@atlas/domain/access`; this only walks the steps.

import type { JsonWebKey } from "node:crypto";
import { pkceChallenge, verifyRs256 } from "@atlas/adapters/access";
import { recordWebSignIn } from "@atlas/adapters/aws";
import { IdentityUnavailable } from "@atlas/adapters/identity";
import { madridDateOf } from "@atlas/domain";
import {
  type ConsoleStart,
  checkIdTokenClaims,
  checkIdTokenHeader,
  consoleCodePayload,
  consoleLoginPayload,
  cookieValues,
  instantOf,
  isAllowed,
  keepsPresentedWebDevice,
  LOGIN_COOKIE,
  loginPayload,
  loopbackCallback,
  newDevice,
  parseConsoleStart,
  presentedDeviceId,
  readLoginPayload,
  reissueRefusal,
  sessionPayload,
  splitJwt,
} from "@atlas/domain/access";
import type { ApiContext } from "./context.js";
import type { Request } from "./event.js";
import { fail, type Outcome } from "./outcome.js";
import {
  accessDeniedPage,
  CODE_PAGE_CSP,
  manualCodePage,
  PAGE_CSP,
  reissueConfirmPage,
} from "./pages.js";
import { clearLoginCookie, loginCookie, page, redirect, sessionCookie } from "./respond.js";

const MAX_DEVICE_ATTEMPTS = 3;

export const signInRoutes = (ctx: ApiContext) => {
  const { deps, config, secrets, devices, id, nowSeconds, signerNow, loginPage } = ctx;
  const redirectUri = `${config.origin}/api/auth/callback`;

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
      did: presentedDeviceId(request.query.get("device_id") ?? undefined, {
        secFetchSite: request.headers.get("sec-fetch-site"),
        origin: request.headers.get("origin"),
        self: config.origin,
      }),
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

  /**
   * The date of this web sign-in, for the monthly mail (`access/last-web-sign-in.json`): only the
   * date of Madrid, moved forward, never back. **The sign-in never fails for it**: what happened is
   * only the reason of the log line.
   */
  const signInDate = async (): Promise<string> => {
    try {
      return `sign_in_date_${await recordWebSignIn(deps.objects, madridDateOf(deps.now()))}`;
    } catch {
      return "sign_in_date_unavailable";
    }
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
    if (attempt.ok.flow === "console") {
      return consoleReturn(attempt.ok.console as ConsoleStart, claims.sub, attempt.ok.iat);
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
    const cookie = sessionCookie(
      (await signerNow()).sign("session", session),
      config.sessionTtlSeconds,
    );
    return {
      result: redirect(`${config.origin}/`, [clearLoginCookie(), cookie]),
      code: presented === deviceId ? "signed_in" : "signed_in_new_device",
      reason: await signInDate(),
    };
  };

  /** `GET /api/auth/console/start` (§4.1): every parameter checked, then the attempt and Google. */
  const consoleStart = async (request: Request): Promise<Outcome> => {
    const asked = parseConsoleStart([...request.query]);
    if ("status" in asked) {
      return fail(asked);
    }
    const state = id(32);
    const nonce = id(32);
    const verifier = id(32);
    const payload = consoleLoginPayload({
      state,
      nonce,
      verifier,
      console: asked,
      now: nowSeconds(),
      ttlSeconds: config.loginTtlSeconds,
    });
    const location = deps.identity.authorizationUrl({
      clientId: await secrets.clientId(),
      redirectUri,
      state,
      nonce,
      codeChallenge: pkceChallenge(verifier),
      // An interactive screen, always (ADR-0033, point 2).
      prompt: "select_account",
    });
    return {
      result: redirect(location, [
        loginCookie((await signerNow()).sign("login", payload), config.loginTtlSeconds),
      ]),
      code: "console_login_started",
    };
  };

  /**
   * The return of a sign-in of the console (§4.2), once Google and the list
   * said yes: **no session cookie**, a one-time code signed with the subkey
   * `console_code`. Loopback: to the literal `127.0.0.1`. Manual: a page that
   * shows it only after confirming the name. A reissue: first the page with
   * the data of the server, and nothing without its confirmation.
   */
  const consoleReturn = async (
    asked: ConsoleStart,
    sub: string,
    attemptIat: number,
  ): Promise<Outcome> => {
    const reissue = asked.reissue_device_id;
    let device: { deviceName?: string } | undefined;
    if (reissue !== undefined) {
      const read = await devices.read(reissue);
      const refused = reissueRefusal(read);
      if (refused !== undefined || typeof read !== "object") {
        return loginPage(refused ?? "reissue_device_missing");
      }
      device = read.device_name === undefined ? {} : { deviceName: read.device_name };
    }
    const code = (await signerNow()).sign(
      "console_code",
      consoleCodePayload({
        tokenId: id(16),
        codeChallenge: asked.code_challenge,
        sub,
        deviceName: asked.device_name,
        reissueDeviceId: reissue,
        now: nowSeconds(),
        ttlSeconds: config.consoleCodeTtlSeconds,
      }),
    );
    const loopback =
      asked.mode === "loopback"
        ? loopbackCallback(asked.port as number, code, asked.state)
        : undefined;
    const attemptedAt = instantOf(attemptIat);
    if (device === undefined) {
      if (loopback !== undefined) {
        return { result: redirect(loopback, [clearLoginCookie()]), code: "console_code_issued" };
      }
      return {
        result: page(
          200,
          manualCodePage({ code, deviceName: asked.device_name, attemptedAt }),
          [clearLoginCookie()],
          CODE_PAGE_CSP,
        ),
        code: "console_code_issued",
      };
    }
    return {
      result: page(
        200,
        reissueConfirmPage({
          deviceName: device.deviceName,
          attemptedAt,
          next: loopback === undefined ? { code } : { loopback },
        }),
        [clearLoginCookie()],
        CODE_PAGE_CSP,
      ),
      code: "console_reissue_offered",
    };
  };

  return { login, callback, consoleStart };
};

/** A segment of a JWT as JSON, or nothing: a malformed one is simply not a claim set. */
const jsonOf = (segment: string): unknown => {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
};
