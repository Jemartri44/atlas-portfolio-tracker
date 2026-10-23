// The handler of the Function URL (`docs/api.md`). It **composes
// and decides nothing**: which route admits which credential, how a signed
// payload is read, what an ID token must say, who is allowed and which device
// is alive are `@atlas/domain/access`; the signatures and the reads are the
// adapters'. It never redirects a data route, never writes anything on a
// failure, and logs only codes (`log.ts`).

import {
  appendOnlyLedger,
  DependencyUnavailable,
  draftObjects,
  referenceReader,
} from "@atlas/adapters/aws";
import {
  type Admission,
  type ApiRefusal,
  admit,
  bodyTooLarge,
  DEVICE_TOKEN_HEADER,
  expectEmptyObject,
  findRoute,
  matchRoute,
  presentedCredential,
  readJsonBody,
  refusal,
  sessionView,
} from "@atlas/domain/access";
import { createContext, type HandlerDeps } from "./context.js";
import { deviceTokenRoutes } from "./device-tokens.js";
import { draftRoutes } from "./drafts.js";
import { type FunctionUrlEvent, type FunctionUrlResult, normalise, type Request } from "./event.js";
import { type LogEntry, logLine } from "./log.js";
import { fail, type Outcome } from "./outcome.js";
import { clearSessionCookie, json, noContent } from "./respond.js";
import { signInRoutes } from "./sign-in.js";
import { type SyncCredential, syncRoutes } from "./sync.js";

export type { HandlerDeps };

export type Handler = (event: FunctionUrlEvent) => Promise<FunctionUrlResult>;

export const createHandler = (deps: HandlerDeps): Handler => {
  const ctx = createContext(deps);
  const { config, devices, leftAlive, loginPage, sessionOf, tokenOf } = ctx;
  const sync = syncRoutes({
    config,
    ledger: appendOnlyLedger(deps.objects),
    reference: referenceReader(deps.objects),
    devices,
    now: deps.now,
  });
  const drafts = draftRoutes({ objects: draftObjects(deps.objects), now: deps.now });
  const { login, callback, consoleStart } = signInRoutes(ctx);
  const { exchange, revokeOwn, listTokens, revokeFromWeb } = deviceTokenRoutes(ctx);

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
    body: unknown,
  ): Promise<Outcome> => {
    switch (path) {
      case "/api/ledger":
        return request.method === "GET"
          ? sync.readLedger()
          : sync.initialise(request.headers.get("if-match"), body);
      case "/api/ledger/lines":
        return sync.appendLines(request.headers.get("if-match"), body);
      case "/api/reference/index":
        return sync.indexReference();
      case "/api/drafts":
        return request.method === "GET" ? drafts.list() : drafts.create(body);
      case "/api/drafts/{id}/stamp":
        return drafts.stamp(params.id as string, body);
      case "/api/drafts/{id}/end":
        return drafts.end(params.id as string, body);
      default:
        return sync.readReference(
          path === "/api/reference/ecb/{name}" ? "ecb" : "prices",
          params.name as string,
          request.headers.get("if-none-match"),
          request.headers.get("accept-encoding"),
        );
    }
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
      case "/api/reference/index":
      case "/api/reference/ecb/{name}":
      case "/api/reference/prices/{name}":
      case "/api/drafts":
      case "/api/drafts/{id}/stamp":
      case "/api/drafts/{id}/end": {
        const credential = await credentialOf(admission);
        if ("code" in credential) {
          return { outcome: fail(credential), route: at };
        }
        const outcome = await syncRoute(request, spec.path, matched.params, body);
        return {
          outcome:
            credential.tokenId === undefined
              ? outcome
              : { ...outcome, tokenId: credential.tokenId },
          route: at,
        };
      }
      default:
        // A route of the table with no branch here: not served.
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
      // whatever fails there is a page, and it clears the attempt. Everywhere else, the JSON of §7.
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
