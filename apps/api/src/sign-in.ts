// The sign-in with Google (`docs/api.md` §3): the web's start and return. Which ID token is good
// and who is allowed are `@atlas/domain/access`; this only walks the steps.

import type { JsonWebKey } from "node:crypto";
import { pkceChallenge, verifyRs256 } from "@atlas/adapters/access";
import { recordWebSignIn } from "@atlas/adapters/aws";
import { IdentityUnavailable } from "@atlas/adapters/identity";
import { madridDateOf } from "@atlas/domain";
import {
  checkIdTokenClaims,
  checkIdTokenHeader,
  cookieValues,
  isAllowed,
  LOGIN_COOKIE,
  loginPayload,
  readLoginPayload,
  sessionPayload,
  splitJwt,
} from "@atlas/domain/access";
import type { ApiContext } from "./context.js";
import type { Request } from "./event.js";
import type { Outcome } from "./outcome.js";
import { accessDeniedPage, PAGE_CSP } from "./pages.js";
import { clearLoginCookie, loginCookie, page, redirect, sessionCookie } from "./respond.js";

export const signInRoutes = (ctx: ApiContext) => {
  const { deps, config, secrets, id, nowSeconds, signerNow, loginPage } = ctx;
  const redirectUri = `${config.origin}/api/auth/callback`;

  const login = async (): Promise<Outcome> => {
    const state = id(32);
    const nonce = id(32);
    const verifier = id(32);
    const payload = loginPayload({
      state,
      nonce,
      verifier,
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
    const session = sessionPayload({
      sub: claims.sub,
      sid: id(16),
      now: nowSeconds(),
      ttlSeconds: config.sessionTtlSeconds,
    });
    const cookie = sessionCookie(
      (await signerNow()).sign("session", session),
      config.sessionTtlSeconds,
    );
    return {
      result: redirect(`${config.origin}/`, [clearLoginCookie(), cookie]),
      code: "signed_in",
      reason: await signInDate(),
    };
  };

  return { login, callback };
};

/** A segment of a JWT as JSON, or nothing: a malformed one is simply not a claim set. */
const jsonOf = (segment: string): unknown => {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
};
