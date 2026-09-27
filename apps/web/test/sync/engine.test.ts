// The sync of the web (feature 015, E4), end to end: the engine over the
// double of IndexedDB, talking to the API composed with its doubles
// (`apps/api/test/harness.ts`) as its network, with the cookie of a web
// sign-in. The device is the session's: the browser records the one it
// joined with, and another session's does not sync (§27.4).

import type { LedgerEvent, UseCaseDeps } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { Builder, base, textOf } from "../../../../packages/adapters/test/sync/builder.js";
import { webDevice } from "../../../../packages/adapters/test/sync/devices.js";
import { ALLOWED, SELF, setup } from "../../../api/test/harness.js";
import {
  confirmHeld,
  deactivate,
  discardHeld,
  heldList,
  planRedo,
  recordRedo,
  redownload,
  startSync,
  syncNow,
  type WebSyncEnv,
  webSyncStatus,
} from "../../src/sync/engine.js";

const DEVICE = "webdevice0000000000001";
const OTHER = "webdevice0000000000002";

type Api = ReturnType<typeof setup>;

/** The API, its clock after the ledgers of the builder (recorded in August 2027). */
const apiAt = (): Api => {
  const api = setup();
  api.advance(Date.parse("2027-09-01T10:00:00.000Z") - api.nowMs());
  return api;
};

/** The browser's `fetch` at its own origin: the cookie of the jar, and `Origin` on a write. */
const sameOrigin = (api: Api): typeof fetch =>
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

const browserOf = async (events: readonly LedgerEvent[], api: Api, device = DEVICE) => {
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

const cloudText = async (api: Api): Promise<string> => {
  const read = await api.call("GET", "/api/ledger", { headers: { origin: SELF } });
  return read.isBase64Encoded ? Buffer.from(read.body, "base64").toString("utf8") : read.body;
};

const depsOf = (web: ReturnType<typeof webDevice>, env: WebSyncEnv): UseCaseDeps => {
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

describe("the sync of the web, against the API", () => {
  it("does nothing until asked: a browser that never started is not configured", async () => {
    const api = apiAt();
    const { env } = await browserOf(base(), api);
    expect(await webSyncStatus(env)).toMatchObject({ configured: false, joined: undefined });
    expect(await syncNow(env, DEVICE)).toMatchObject({
      status: "refused",
      refusal: { code: "sync_not_configured" },
    });
  });

  it("uploads the whole ledger to an empty cloud, as the device of the session", async () => {
    const api = apiAt();
    const { web, env } = await browserOf(base(), api);
    expect(await startSync(env, DEVICE, "init")).toMatchObject({ status: "synced", pending: 0 });
    expect(await cloudText(api)).toBe(await web.text());
    expect(await webSyncStatus(env)).toMatchObject({
      configured: true,
      enabled: true,
      half: false,
      joined: DEVICE,
      pending: 0,
      held: 0,
    });
    // Starting again is refused: it is configured.
    expect(await startSync(env, DEVICE, "init")).toMatchObject({
      refusal: { code: "sync_already_configured" },
    });
  });

  it("syncs only as the device it joined with", async () => {
    const api = apiAt();
    const { web, env } = await browserOf(base(), api);
    await startSync(env, DEVICE, "init");
    const more = new Builder(20);
    more.deposit("100");
    await web.record(more.events);
    expect(await syncNow(env, OTHER)).toMatchObject({
      status: "refused",
      refusal: { code: "sync_device_changed", details: { joined: DEVICE, session: OTHER } },
    });
    expect(await redownload(env, OTHER)).toMatchObject({
      refusal: { code: "sync_device_changed" },
    });
    expect(await syncNow(env, DEVICE)).toMatchObject({ status: "synced", uploaded: 1 });
    expect(await cloudText(api)).toBe(await web.text());
  });

  it("refuses to initialise over a cloud that holds another ledger, and finishes one that holds this one", async () => {
    const api = apiAt();
    const first = await browserOf(base(), api);
    await startSync(first.env, DEVICE, "init");
    const other = new Builder(40);
    other.account("acc_other");
    const stranger = await browserOf(other.events, api, OTHER);
    expect(await startSync(stranger.env, OTHER, "init")).toMatchObject({
      refusal: { code: "init_remote_not_empty" },
    });
    // A copy of the same bytes: an initialisation cut after uploading.
    const copy = await browserOf(base(), api, OTHER);
    expect(await startSync(copy.env, OTHER, "init")).toMatchObject({
      status: "synced",
      uploaded: 0,
    });
    expect(await webSyncStatus(copy.env)).toMatchObject({ joined: OTHER, pending: 0 });
  });

  it("joins from the cloud holding its own lines back, never uploading them alone", async () => {
    const api = apiAt();
    const first = await browserOf(base(), api);
    await startSync(first.env, DEVICE, "init");
    const own = new Builder(60);
    own.deposit("250");
    const second = await browserOf([...base(), ...own.events], api, OTHER);
    expect(await startSync(second.env, OTHER, "join_from_remote")).toMatchObject({
      status: "synced",
    });
    expect(await second.web.text()).toBe(textOf(base()));
    expect(await webSyncStatus(second.env)).toMatchObject({ joined: OTHER, held: 1 });
    const [view] = await heldList(second.env);
    expect(view?.resolutions).not.toContain("confirm");
    await expect(confirmHeld(second.env, view?.unit.unit as string)).rejects.toMatchObject({
      code: "resolution_not_offered",
    });
    expect(await syncNow(second.env, OTHER)).toMatchObject({ status: "synced", uploaded: 0 });
    expect(await cloudText(api)).toBe(textOf(base()));
  });

  it("holds back an operation another device already recorded, until the user confirms it", async () => {
    const api = apiAt();
    const first = await browserOf(base(), api);
    await startSync(first.env, DEVICE, "init");
    const second = await browserOf(base(), api, OTHER);
    await startSync(second.env, OTHER, "join_from_remote");
    const deposit = { amount: "50", date: "2027-01-11" };
    await first.web.record([new Builder(100).deposit(deposit.amount, deposit.date)]);
    expect(await syncNow(first.env, DEVICE)).toMatchObject({ status: "synced", uploaded: 1 });
    await second.web.record([new Builder(900).deposit(deposit.amount, deposit.date)]);
    expect(await syncNow(second.env, OTHER)).toMatchObject({ held: { code: "new_duplicate" } });
    const [view] = await heldList(second.env);
    expect(view?.resolutions).toEqual(["confirm", "redo", "discard"]);
    await confirmHeld(second.env, view?.unit.unit as string);
    expect(await syncNow(second.env, OTHER)).toMatchObject({ status: "synced", uploaded: 1 });
    expect(await webSyncStatus(second.env)).toMatchObject({ held: 0, pending: 0 });
    expect(await cloudText(api)).toBe(await second.web.text());
  });

  it("discards what is held back, and redoes it with the plan the user saw", async () => {
    const api = apiAt();
    const first = await browserOf(base(), api);
    await startSync(first.env, DEVICE, "init");
    const own = new Builder(80);
    own.deposit("300");
    own.deposit("400", "2027-01-12");
    const second = await browserOf([...base(), ...own.events], api, OTHER);
    await startSync(second.env, OTHER, "join_from_remote");
    const units = await heldList(second.env);
    expect(units).toHaveLength(2);
    await discardHeld(second.env, units[0]?.unit.unit as string);
    const deps = depsOf(second.web, second.env);
    const redo = await planRedo(second.env, deps, units[1]?.unit.unit as string);
    expect("plan" in redo).toBe(true);
    if ("plan" in redo) {
      await recordRedo(second.env, deps, units[1]?.unit.unit as string, redo.plan, false);
    }
    expect(await webSyncStatus(second.env)).toMatchObject({ held: 0, pending: 1 });
    expect(await syncNow(second.env, OTHER)).toMatchObject({ status: "synced", uploaded: 1 });
  });

  it("joins with its own operations as pending", async () => {
    const api = apiAt();
    const first = await browserOf(base(), api);
    await startSync(first.env, DEVICE, "init");
    const own = new Builder(100);
    own.deposit("500");
    const second = await browserOf([...base(), ...own.events], api, OTHER);
    expect(await startSync(second.env, OTHER, "join_with_mine")).toMatchObject({
      status: "synced",
      pending: 1,
    });
    expect(await syncNow(second.env, OTHER)).toMatchObject({ status: "synced", uploaded: 1 });
  });

  it("deactivates only with nothing pending, and then does not sync until joined again", async () => {
    const api = apiAt();
    const { web, env } = await browserOf(base(), api);
    await startSync(env, DEVICE, "init");
    await web.record([new Builder(120).deposit("70")]);
    expect(await deactivate(env)).toMatchObject({
      code: "deactivate_refused_pending",
      details: { pending: 1 },
    });
    await syncNow(env, DEVICE);
    expect(await deactivate(env)).toBeUndefined();
    expect(await webSyncStatus(env)).toMatchObject({ configured: true, enabled: false });
    expect(await syncNow(env, DEVICE)).toMatchObject({
      refusal: { code: "sync_deactivated" },
    });
  });
});
