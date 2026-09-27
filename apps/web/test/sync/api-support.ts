// The API of the tests of feature 015 (`apps/api/test/harness.ts`) as the
// network of the web: a `fetch` at the page's own origin, with the cookie of a
// web sign-in and `Origin` on a write, as the browser sends them; a browser on
// the double of IndexedDB; and what the cloud holds.

import type { LedgerEvent, UseCaseDeps } from "@atlas/domain";
import { webDevice } from "../../../../packages/adapters/test/sync/devices.js";
import { ALLOWED, SELF, setup } from "../../../api/test/harness.js";
import type { WebSyncEnv } from "../../src/sync/engine.js";

export const DEVICE = "webdevice0000000000001";
export const OTHER = "webdevice0000000000002";

export type Api = ReturnType<typeof setup>;

/** The API, its clock after the ledgers of the builder (recorded in August 2027). */
export const apiAt = (): Api => {
  const api = setup();
  api.advance(Date.parse("2027-09-01T10:00:00.000Z") - api.nowMs());
  return api;
};

/** The browser's `fetch` at its own origin: the cookie of the jar, and `Origin` on a write. */
export const sameOrigin = (api: Api): typeof fetch =>
  (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), SELF);
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(new Headers(init?.headers));
    const result = await api.call(method, url.pathname, {
      headers: method === "GET" ? headers : { ...headers, origin: SELF },
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

export const browserOf = async (events: readonly LedgerEvent[], api: Api, device = DEVICE) => {
  await api.signIn(ALLOWED, device);
  const web = webDevice(events);
  let millis = Date.parse("2027-08-30T09:00:00.000Z");
  const env: WebSyncEnv = {
    fetch: sameOrigin(api),
    open: web.open,
    now: () => {
      millis += 1000;
      return new Date(millis);
    },
  };
  return { web, env };
};

export const cloudText = async (api: Api): Promise<string> => {
  const read = await api.call("GET", "/api/ledger", { headers: { origin: SELF } });
  return read.isBase64Encoded ? Buffer.from(read.body, "base64").toString("utf8") : read.body;
};

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
