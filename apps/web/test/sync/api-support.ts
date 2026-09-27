// The API of the tests of feature 015 (`apps/api/test/harness.ts`) as the
// network of the web: a `fetch` at the page's own origin, with the cookie of a
// web sign-in and `Origin` on a write, as the browser sends them; a browser on
// the double of IndexedDB; and what the cloud holds.

import type { LedgerEvent, UseCaseDeps } from "@atlas/domain";
import { SESSION_COOKIE } from "@atlas/domain/access";
import { webDevice } from "../../../../packages/adapters/test/sync/devices.js";
import { ALLOWED, SELF, setup } from "../../../api/test/harness.js";
import type { WebSyncEnv } from "../../src/sync/engine.js";

export type Api = ReturnType<typeof setup>;

/** The API, its clock after the ledgers of the builder (recorded in August 2027). */
export const apiAt = (): Api => {
  const api = setup();
  api.advance(Date.parse("2027-09-01T10:00:00.000Z") - api.nowMs());
  return api;
};

/** The browser's `fetch` at its own origin: the cookie of the jar, and `Origin` on a write. */
/**
 * The browser's `fetch` at its own origin: **its own** cookie of the session
 * (read at each call, so another tab that signs in again changes it, as the
 * browser does), and `Origin` on a write.
 */
export const sameOrigin = (api: Api, cookie: () => string | undefined): typeof fetch =>
  (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), SELF);
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(new Headers(init?.headers));
    const result = await api.call(method, url.pathname, {
      headers: method === "GET" ? headers : { ...headers, origin: SELF },
      jar: false,
      cookies: cookie() === undefined ? [] : [`${SESSION_COOKIE}=${cookie()}`],
      ...(init?.body === undefined || init.body === null
        ? {}
        : {
            body:
              typeof init.body === "string"
                ? init.body
                : new TextDecoder().decode(init.body as Uint8Array),
          }),
    });
    const body =
      result.statusCode === 304 || result.statusCode === 204
        ? null
        : result.isBase64Encoded
          ? Buffer.from(result.body, "base64")
          : result.body;
    return new Response(body, { status: result.statusCode, headers: result.headers });
  }) as typeof fetch;

/** A sign-in of the web from scratch: its cookie, and the device the API assigned it. */
export const signedIn = async (api: Api): Promise<{ cookie: string; device: string }> => {
  await api.signIn(ALLOWED);
  const cookie = api.session() as string;
  const view = await api.call("GET", "/api/session", {
    jar: false,
    cookies: [`${SESSION_COOKIE}=${cookie}`],
  });
  return { cookie, device: (JSON.parse(view.body) as { device_id: string }).device_id };
};

export const browserOf = async (events: readonly LedgerEvent[], api: Api) => {
  let session: { cookie: string | undefined; device: string } = await signedIn(api);
  const web = webDevice(events);
  let millis = Date.parse("2027-08-30T09:00:00.000Z");
  const env: WebSyncEnv = {
    fetch: sameOrigin(api, () => session.cookie),
    open: web.open,
    now: () => {
      millis += 1000;
      return new Date(millis);
    },
  };
  return {
    web,
    env,
    /** The device of the cookie this browser holds now. */
    device: () => session.device,
    /** Another tab signs in again, and the API assigns another device: the cookie changes here too. */
    signInAgain: async (): Promise<void> => {
      session = await signedIn(api);
    },
    /** The session is closed: no cookie travels any more. */
    signOut: (): void => {
      session = { cookie: undefined, device: "" };
    },
  };
};

/** What the cloud holds, read off the double of S3. */
export const cloudText = async (api: Api): Promise<string> =>
  api.s3.text("ledger/ledger.jsonl") ?? "";

export const depsOf = (web: ReturnType<typeof webDevice>, env: WebSyncEnv): UseCaseDeps => {
  let counter = 0;
  return {
    store: web.store,
    clock: { now: env.now as () => Date },
    random: (target) => {
      counter += 1;
      target.fill((counter * 7) % 256);
    },
  };
};
