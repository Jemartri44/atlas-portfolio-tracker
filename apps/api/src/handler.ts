// The handler of the Function URL (`docs/api.md`). It **composes
// and decides nothing**: which route admits which credential, how a signed
// payload is read, what an ID token must say, who is allowed and when every
// session was closed are `@atlas/access`; the signatures and the reads are the
// adapters'. It never redirects a data route, never writes anything on a
// failure, and logs only codes (`log.ts`).

import { sessionView } from "@atlas/access";
import {
  appendOnlyLedger,
  closeSessionsBefore,
  DependencyUnavailable,
  draftObjects,
  exposureObject,
  referenceReader,
} from "@atlas/adapters/aws";
import { bodyTooLarge, expectEmptyObject, readJsonBody } from "./access/body.js";
import { refusal } from "./access/codes.js";
import { presentedCredential } from "./access/cookies.js";
import { admit, findRoute, matchRoute } from "./access/routes.js";
import { createContext, type HandlerDeps } from "./context.js";
import { draftRoutes } from "./drafts.js";
import { type FunctionUrlEvent, type FunctionUrlResult, normalise, type Request } from "./event.js";
import { exposureRoutes } from "./exposure.js";
import { jobStatusRoutes } from "./job-status.js";
import { type LogEntry, logLine } from "./log.js";
import { fail, type Outcome } from "./outcome.js";
import { clearSessionCookie, json, noContent } from "./respond.js";
import { signInRoutes } from "./sign-in.js";
import { syncRoutes } from "./sync.js";

export type { HandlerDeps };

export type Handler = (event: FunctionUrlEvent) => Promise<FunctionUrlResult>;

export const createHandler = (deps: HandlerDeps): Handler => {
  const ctx = createContext(deps);
  const { config, loginPage, sessionOf } = ctx;
  const sync = syncRoutes({
    config,
    ledger: appendOnlyLedger(deps.objects),
    reference: referenceReader(deps.objects),
    now: deps.now,
  });
  const drafts = draftRoutes({ objects: draftObjects(deps.objects), now: deps.now });
  const exposure = exposureRoutes({ object: exposureObject(deps.objects) });
  const jobStatus = jobStatusRoutes({
    objects: deps.objects,
    activeFamilies: deps.config.activeJobFamilies,
  });
  const { login, callback } = signInRoutes(ctx);

  /** A route of the ledger, the reference data, the drafts or the exposure, once its session is checked. */
  const syncRoute = async (
    request: Request,
    path: string,
    params: Readonly<Record<string, string>>,
    body: unknown,
  ): Promise<Outcome> => {
    switch (path) {
      case "/api/ledger":
        return sync.readLedger(request.headers.get("accept-encoding"));
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
      case "/api/jobs/status":
        return jobStatus.read();
      case "/api/exposure":
        return request.method === "GET"
          ? exposure.read()
          : exposure.write({
              ifMatch: request.headers.get("if-match"),
              ifNoneMatch: request.headers.get("if-none-match"),
              // Never undefined here: a body that is not UTF-8 was refused above (415 body_not_json).
              text: request.bodyText as string,
              bytes: request.bodyBytes,
            });
      default:
        return sync.readReference(
          path === "/api/reference/ecb/{name}" ? "ecb" : "prices",
          params.name as string,
          request.headers.get("if-none-match"),
          request.headers.get("accept-encoding"),
        );
    }
  };

  /** The session of a route admitted with the cookie (routes.ts), checked. */
  const checkedSession = (admission: ReturnType<typeof admit>) => {
    // Admitted only with the session: anything else is a routing table that disagrees with the
    // switch below, never a session.
    if (admission.kind !== "session") {
      throw new Error("route admitted without a session");
    }
    return sessionOf(admission.value);
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
      presentedCredential(request.cookies),
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
        return { outcome: await login(), route: at };
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
      case "/api/auth/logout-all": {
        const shape = expectEmptyObject(body);
        if (shape !== undefined) {
          return { outcome: fail(shape), route: at };
        }
        const session = await checkedSession(admission);
        if ("code" in session) {
          return { outcome: fail(session), route: at };
        }
        // The clock of the API, never one the client sends; this cookie goes with the rest.
        await closeSessionsBefore(deps.objects, ctx.nowSeconds());
        return {
          outcome: { result: noContent([clearSessionCookie()]), code: "signed_out_everywhere" },
          route: at,
        };
      }
      case "/api/session": {
        const session = await checkedSession(admission);
        if ("code" in session) {
          return { outcome: fail(session), route: at };
        }
        return { outcome: { result: json(200, sessionView(session)) }, route: at };
      }
      case "/api/ledger":
      case "/api/ledger/lines":
      case "/api/reference/index":
      case "/api/reference/ecb/{name}":
      case "/api/reference/prices/{name}":
      case "/api/drafts":
      case "/api/drafts/{id}/stamp":
      case "/api/drafts/{id}/end":
      case "/api/jobs/status":
      case "/api/exposure": {
        const session = await checkedSession(admission);
        if ("code" in session) {
          return { outcome: fail(session), route: at };
        }
        return { outcome: await syncRoute(request, spec.path, matched.params, body), route: at };
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
