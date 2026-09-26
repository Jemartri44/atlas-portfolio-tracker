// The handler of the Function URL (feature 015; `docs/api.md`). It **composes
// and decides nothing**: which route admits which credential, how a signed
// payload is read, what an ID token must say, who is allowed and which device
// is alive are `@atlas/domain/access`; the signatures and the reads are the
// adapters'. It never redirects a data route, never writes anything on a
// failure, and logs only codes (`log.ts`).

import type { JsonWebKey } from "node:crypto";
import {
  base64url,
  pkceChallenge,
  Signer,
  sameSecret,
  sha256Hex,
  verifyRs256,
} from "@atlas/adapters/access";
import {
  AccessSecrets,
  type AccessSecrets as AccessSecretsType,
  appendOnlyLedger,
  DependencyUnavailable,
  DeviceStore,
  type ObjectStore,
  type ParameterStore,
  TokenRegistry,
} from "@atlas/adapters/aws";
import { type IdentityProvider, IdentityUnavailable } from "@atlas/adapters/identity";
import {
  type Admission,
  type ApiConfig,
  type ApiRefusal,
  admit,
  bodyTooLarge,
  type ConsoleStart,
  checkIdTokenClaims,
  checkIdTokenHeader,
  checkToken,
  consoleCodePayload,
  consoleLoginPayload,
  cookieValues,
  DEVICE_TOKEN_HEADER,
  deviceRefusal,
  entryForSubject,
  expectEmptyObject,
  findRoute,
  formatDeviceToken,
  instantOf,
  isAllowed,
  isId22,
  keepsPresentedWebDevice,
  LOGIN_COOKIE,
  LOGIN_PAGE_ERRORS,
  type LoginPageError,
  loginPayload,
  loopbackCallback,
  matchRoute,
  newDevice,
  newTokenRecord,
  parseConsoleStart,
  parseDeviceToken,
  parseExchangeBody,
  presentedCredential,
  presentedDeviceId,
  readConsoleCodePayload,
  readJsonBody,
  readLoginPayload,
  readSessionPayload,
  refusal,
  reissueRefusal,
  type SessionPayload,
  sessionPayload,
  sessionView,
  splitJwt,
  subjectAllowed,
  type TokenListItem,
  type TokenRecord,
  tokenListItem,
  tokenStatus,
} from "@atlas/domain/access";
import { type FunctionUrlEvent, type FunctionUrlResult, normalise, type Request } from "./event.js";
import { type LogEntry, logLine } from "./log.js";
import { fail, type Outcome } from "./outcome.js";
import {
  accessDeniedPage,
  CODE_PAGE_CSP,
  loginErrorPage,
  manualCodePage,
  PAGE_CSP,
  reissueConfirmPage,
} from "./pages.js";
import {
  clearLoginCookie,
  clearSessionCookie,
  json,
  loginCookie,
  noContent,
  page,
  redirect,
  sessionCookie,
} from "./respond.js";
import { type SyncCredential, syncRoutes } from "./sync.js";

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
const MAX_DEVICE_ATTEMPTS = 3;

export const createHandler = (deps: HandlerDeps): Handler => {
  const { config } = deps;
  const secrets: AccessSecretsType = new AccessSecrets(deps.parameters, deps.now, config);
  const devices = new DeviceStore(deps.objects);
  /** The errors after which a new token stayed alive, with its public id (R2-2). */
  const leftAlive = new WeakMap<object, string>();
  const tokens = new TokenRegistry(deps.parameters, config.ssmPrefix, {
    project: "atlas",
    env: config.env,
  });
  const redirectUri = `${config.origin}/api/auth/callback`;
  const sync = syncRoutes({
    config,
    ledger: appendOnlyLedger(deps.objects),
    objects: deps.objects,
    devices,
    now: deps.now,
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
    return {
      result: redirect(`${config.origin}/ajustes#sincronizacion`, [
        clearLoginCookie(),
        sessionCookie((await signerNow()).sign("session", session), config.sessionTtlSeconds),
      ]),
      code: presented === deviceId ? "signed_in" : "signed_in_new_device",
    };
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

  /**
   * The device a route of the sync speaks for (§2.3): the cookie's, checked
   * as a session, or the token's, checked as in §2.2 — both with the object
   * of their device. Never the body's.
   */
  const credentialOf = async (admission: Admission): Promise<SyncCredential | ApiRefusal> => {
    if (admission.kind === "session") {
      const session = await sessionOf(admission.value);
      return "code" in session ? session : { deviceId: session.did, type: "web" };
    }
    if (admission.kind === "token") {
      const record = await tokenOf(admission.value);
      return "status" in record
        ? record
        : { deviceId: record.device_id, type: "console", tokenId: record.token_id };
    }
    // Admitted only with one of the two (routes.ts): anything else is a table
    // that disagrees with this switch, never a credential.
    throw new Error("route of the sync admitted without a credential");
  };

  /** A route of the sync, once its credential is checked. */
  const syncRoute = async (
    request: Request,
    path: string,
    params: Readonly<Record<string, string>>,
    credential: SyncCredential,
    body: unknown,
  ): Promise<Outcome> => {
    switch (path) {
      case "/api/ledger":
        return request.method === "GET"
          ? sync.readLedger()
          : sync.initialise(request.headers.get("if-match"), body);
      case "/api/ledger/lines":
        return sync.appendLines(request.headers.get("if-match"), body);
      case "/api/sync/devices/self":
        return sync.publish(credential, body);
      case "/api/reference/index":
        return sync.indexReference();
      default:
        return sync.readReference(
          path === "/api/reference/ecb/{name}" ? "ecb" : "prices",
          params.name as string,
          request.headers.get("if-none-match"),
        );
    }
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
    let device: { deviceName?: string; publishedAt?: string; pending: number } | undefined;
    if (reissue !== undefined) {
      const read = await devices.read(reissue);
      const refused = reissueRefusal(read);
      if (refused !== undefined || typeof read !== "object") {
        return loginPage(refused ?? "reissue_device_missing");
      }
      device = {
        ...(read.device_name === undefined ? {} : { deviceName: read.device_name }),
        ...(read.published_at === undefined ? {} : { publishedAt: read.published_at }),
        pending: read.pending,
      };
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
          publishedAt: device.publishedAt,
          pending: device.pending,
          attemptedAt,
          next: loopback === undefined ? { code } : { loopback },
        }),
        [clearLoginCookie()],
        CODE_PAGE_CSP,
      ),
      code: "console_reissue_offered",
    };
  };

  /**
   * `POST /api/auth/console/token` (§4.3): the code (subkey and `typ`, then
   * its expiry), the verifier against its challenge, the list again (the
   * e-mail of the one entry of the `sub`, Q8 (a)); then, to renew, **the
   * previous token revoked before the new one is created**; to reissue, the
   * device checked again and **every live token of it revoked first**; and
   * the record created **without overwriting**, which is what makes the code
   * single use.
   */
  const exchange = async (admission: Admission, body: unknown): Promise<Outcome> => {
    const parsed = parseExchangeBody(body);
    if ("status" in parsed) {
      return fail(parsed);
    }
    const opened = (await signerNow()).open("console_code", parsed.code);
    if (opened === undefined) {
      return fail(refusal("console_code_invalid", { reason: "signature" }));
    }
    const read = readConsoleCodePayload(opened, nowSeconds());
    if ("failure" in read) {
      return fail(
        read.failure === "expired"
          ? refusal("console_code_expired")
          : refusal("console_code_invalid", { reason: "payload" }),
      );
    }
    const code = read.ok;
    if (pkceChallenge(parsed.code_verifier) !== code.cc) {
      return fail(refusal("pkce_mismatch"));
    }
    const entry = entryForSubject(await secrets.allowList(), code.sub);
    if (entry === "missing" || entry === "ambiguous") {
      return fail(
        refusal("not_allowed", entry === "ambiguous" ? { reason: "ambiguous_subject" } : {}),
      );
    }
    // A code sent again is answered **before anything is revoked** (review of
    // PR #95, N1): its record already exists, and a renewal or a reissue sent
    // twice would otherwise revoke the token the first exchange handed out.
    if ((await tokens.read(code.tid)) !== undefined) {
      return { ...fail(refusal("console_code_used")), tokenId: code.tid };
    }
    const nowMs = deps.now().getTime();
    let deviceId: string;
    let deviceName = code.dn;
    let how: "token_issued" | "token_renewed" | "token_reissued";
    if (admission.kind === "token") {
      if (code.rdid !== undefined) {
        return fail(refusal("body_invalid", { reason: "renewal_and_reissue" }));
      }
      const previous = await tokenOf(admission.value, true);
      if ("status" in previous) {
        return fail(previous);
      }
      if (previous.sub !== code.sub) {
        return fail(refusal("not_allowed", { reason: "other_subject" }));
      }
      // The previous one first (ADR-0033, point 2): a cut between the two
      // steps leaves no token, which is safe; the console signs in again.
      await tokens.revoke(previous, nowMs);
      deviceId = previous.device_id;
      how = "token_renewed";
    } else if (code.rdid !== undefined) {
      const device = await devices.read(code.rdid);
      const refused = reissueRefusal(device);
      if (refused !== undefined || typeof device !== "object") {
        return fail(refusal(refused ?? "reissue_device_missing"));
      }
      // The name the user confirmed on the page is the device's, not the one
      // the console proposed (review of PR #95, N7).
      deviceName = device.device_name ?? code.dn;
      for (const listed of await tokens.list()) {
        // Never the record of this very code: an exchange of the same code
        // running at once may have created it after this one read it, and
        // revoking it would leave the device with no live token (review of
        // PR #95, round 2, R2-1). The create below answers that one with 409.
        if (
          typeof listed.read === "object" &&
          listed.read.device_id === code.rdid &&
          listed.read.token_id !== code.tid
        ) {
          await tokens.revoke(listed.read, nowMs);
        }
      }
      deviceId = code.rdid;
      how = "token_reissued";
    } else {
      deviceId = id(16);
      how = "token_issued";
    }
    const secret = id(32);
    const record = newTokenRecord({
      tokenId: code.tid,
      secretSha256: sha256Hex(secret),
      sub: entry.sub,
      email: entry.email,
      deviceId,
      deviceName,
      issuedAtMs: nowMs,
      lifetimeDays: config.tokenLifetimeDays,
    });
    if ((await tokens.create(record)) === "exists") {
      return { ...fail(refusal("console_code_used")), tokenId: code.tid };
    }
    if (how === "token_issued") {
      let created: "created" | "exists";
      try {
        created = await devices.create(
          newDevice({
            deviceId,
            type: "console",
            createdAt: deps.now().toISOString(),
            deviceName,
          }),
        );
      } catch (error) {
        // S3 failed after the record was created (review of PR #95, N3): the
        // token is revoked — tried a few times, as much as can be — and
        // nothing is handed out; the failure answers as what it is (503).
        await revokeOrMark(record, nowMs, error);
        throw error;
      }
      if (created === "exists") {
        // 128 random bits already taken: the new token must not name another
        // device's object. It is revoked, and nothing is handed out.
        const collision = new Error("device id collision");
        await revokeOrMark(record, nowMs, collision);
        throw collision;
      }
    }
    return {
      result: json(200, {
        token: formatDeviceToken(record.token_id, secret),
        token_id: record.token_id,
        device_id: record.device_id,
        device_name: record.device_name,
        issued_at: record.issued_at,
        expires_at: record.expires_at,
      }),
      code: how,
      tokenId: record.token_id,
    };
  };

  /**
   * Revokes a record just created, retrying a transient failure. If every try
   * fails, the error the caller throws is marked with the record's id, and
   * the log of its 5xx carries it.
   */
  const revokeOrMark = async (
    record: TokenRecord,
    nowMs: number,
    error: unknown,
  ): Promise<void> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await tokens.revoke(record, nowMs);
        return;
      } catch {
        // Tried again below; the answer is a 5xx either way.
      }
    }
    // Every try failed: the record stays alive, and the log of this 5xx names
    // it — its public id, the most a log may say of a token (ADR-0033, point
    // 10; review of PR #95, round 2, R2-2).
    if (typeof error === "object" && error !== null) {
      leftAlive.set(error, record.token_id);
    }
  };

  /** `POST /api/auth/console/revoke` (§4.4): **this** token, and only this one. */
  const revokeOwn = async (admission: Admission, body: unknown): Promise<Outcome> => {
    const shape = expectEmptyObject(body);
    if (shape !== undefined) {
      return fail(shape);
    }
    if (admission.kind !== "token") {
      throw new Error("route admitted without a token");
    }
    const record = await tokenOf(admission.value);
    if ("status" in record) {
      return fail(record);
    }
    const revoked = await tokens.revoke(record, deps.now().getTime());
    return {
      result: json(200, { token_id: revoked.token_id, revoked_at: revoked.revoked_at }),
      code: "token_revoked",
      tokenId: revoked.token_id,
    };
  };

  /** `GET /api/devices/tokens` (§4.5): every record, the unreadable ones too, never an e-mail. */
  const listTokens = async (): Promise<Outcome> => {
    const nowMs = deps.now().getTime();
    const lastSync = new Map<string, string | undefined>();
    const readable: TokenListItem[] = [];
    const unreadable: { token_id: string; status: "unreadable" }[] = [];
    for (const { tokenId, read } of await tokens.list()) {
      if (read === "unreadable") {
        unreadable.push({ token_id: tokenId, status: "unreadable" });
        continue;
      }
      if (!lastSync.has(read.device_id)) {
        const device = await devices.read(read.device_id);
        lastSync.set(read.device_id, typeof device === "object" ? device.last_sync_at : undefined);
      }
      readable.push(
        tokenListItem(read, lastSync.get(read.device_id), nowMs, config.recentIssueDays),
      );
    }
    readable.sort((a, b) => b.issued_at.localeCompare(a.issued_at));
    return {
      result: json(200, { tokens: [...readable, ...unreadable] }),
      ...(unreadable.length > 0 ? { reason: "token_record_unreadable" } : {}),
    };
  };

  /** `POST /api/devices/tokens/<token_id>/revoke` (§4.5): the id checked before any name is built. */
  const revokeFromWeb = async (tokenId: string, body: unknown): Promise<Outcome> => {
    if (!isId22(tokenId)) {
      return fail(refusal("body_invalid", { reason: "token_id" }));
    }
    const shape = expectEmptyObject(body);
    if (shape !== undefined) {
      return fail(shape);
    }
    const read = await tokens.read(tokenId);
    if (typeof read !== "object") {
      return fail(
        refusal("not_found", { reason: read === undefined ? "token_missing" : "token_unreadable" }),
      );
    }
    const revoked = await tokens.revoke(read, deps.now().getTime());
    return {
      result: json(200, { token_id: revoked.token_id, revoked_at: revoked.revoked_at }),
      code:
        tokenStatus(read, deps.now().getTime()) === "revoked"
          ? "token_already_revoked"
          : "token_revoked",
      tokenId: revoked.token_id,
    };
  };

  const route = async (request: Request): Promise<{ outcome: Outcome; route: string }> => {
    const matched = matchRoute(request.method, request.path);
    if (matched === undefined) {
      return { outcome: fail(refusal("not_found")), route: "unmatched" };
    }
    const spec = matched.route;
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
      case "/api/session":
      case "/api/sync/devices":
      case "/api/devices/tokens":
      case "/api/devices/tokens/{token_id}/revoke": {
        // Admitted only with the session (routes.ts): anything else is a
        // routing table that disagrees with this switch, never a session.
        if (admission.kind !== "session") {
          throw new Error("route admitted without a session");
        }
        const session = await sessionOf(admission.value);
        if ("code" in session) {
          return { outcome: fail(session), route: at };
        }
        if (spec.path === "/api/devices/tokens") {
          return { outcome: await listTokens(), route: at };
        }
        if (spec.path === "/api/sync/devices") {
          return { outcome: await sync.listDevices(), route: at };
        }
        if (spec.path === "/api/devices/tokens/{token_id}/revoke") {
          return {
            outcome: await revokeFromWeb(matched.params.token_id as string, body),
            route: at,
          };
        }
        return { outcome: { result: json(200, sessionView(session)) }, route: at };
      }
      case "/api/auth/console/start":
        return { outcome: await consoleStart(request), route: at };
      case "/api/auth/console/token":
        return { outcome: await exchange(admission, body), route: at };
      case "/api/auth/console/revoke":
        return { outcome: await revokeOwn(admission, body), route: at };
      case "/api/ledger":
      case "/api/ledger/lines":
      case "/api/sync/devices/self":
      case "/api/reference/index":
      case "/api/reference/ecb/{name}":
      case "/api/reference/prices/{name}": {
        const credential = await credentialOf(admission);
        if ("code" in credential) {
          return { outcome: fail(credential), route: at };
        }
        const outcome = await syncRoute(request, spec.path, matched.params, credential, body);
        return {
          outcome:
            credential.tokenId === undefined
              ? outcome
              : { ...outcome, tokenId: credential.tokenId },
          route: at,
        };
      }
      default:
        // A route of the table with no branch here: not served (E2 and E3 add theirs).
        return { outcome: fail(refusal("not_found")), route: at };
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
      const signIn =
        base.route === "/api/auth/callback" ||
        base.route === "/api/auth/login" ||
        base.route === "/api/auth/console/start";
      const name =
        error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : "unknown";
      const alive = typeof error === "object" && error !== null ? leftAlive.get(error) : undefined;
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
      if (alive !== undefined) {
        outcome = { ...outcome, tokenId: alive };
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
        ...(outcome.tokenId === undefined ? {} : { token_id: outcome.tokenId }),
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
