// The sync of the web (feature 015, E4), end to end: the engine over the
// double of IndexedDB, talking to the API composed with its doubles
// (`apps/api/test/harness.ts`) as its network, each browser with its own
// cookie of a web sign-in. The device is the session's, read again before
// every order: the browser records the one it joined with, and another
// session's does not sync (§27.4; review of PR #97, security B1).

import { describe, expect, it } from "vitest";
import { Builder, base, textOf } from "../../../../packages/adapters/test/sync/builder.js";
import {
  deactivate,
  redownload,
  startSync,
  syncNow,
  webSyncStatus,
} from "../../src/sync/engine.js";
import {
  confirmHeld,
  discardHeld,
  heldList,
  planRedo,
  recordRedo,
} from "../../src/sync/engine-held.js";
import { apiAt, browserOf, cloudText, depsOf } from "./api-support.js";

describe("the sync of the web, against the API", () => {
  it("does nothing until asked: a browser that never started is not configured", async () => {
    const api = apiAt();
    const { env } = await browserOf(base(), api);
    expect(await webSyncStatus(env)).toMatchObject({ configured: false, joined: undefined });
    expect(await syncNow(env)).toMatchObject({
      status: "refused",
      refusal: { code: "sync_not_configured" },
    });
  });

  it("uploads the whole ledger to an empty cloud, as the device of the session", async () => {
    const api = apiAt();
    const browser = await browserOf(base(), api);
    const { web, env } = browser;
    expect(await startSync(env, "init")).toMatchObject({ status: "synced", pending: 0 });
    expect(await cloudText(api)).toBe(await web.text());
    expect(await webSyncStatus(env)).toMatchObject({
      configured: true,
      enabled: true,
      half: false,
      joined: browser.device(),
      pending: 0,
      held: 0,
    });
    // Starting again is refused: it is configured.
    expect(await startSync(env, "init")).toMatchObject({
      refusal: { code: "sync_already_configured" },
    });
  });

  // Mutant C4 of E4 survived without this: with another device in the
  // session, uploading everything again is refused; only joining is allowed.
  it("never initialises again over a sync of another device: it joins", async () => {
    const api = apiAt();
    const browser = await browserOf(base(), api);
    await startSync(browser.env, "init");
    const first = browser.device();
    await browser.signInAgain();
    expect(browser.device()).not.toBe(first);
    expect(await startSync(browser.env, "init")).toMatchObject({
      status: "refused",
      refusal: { code: "sync_already_configured" },
    });
    expect(await webSyncStatus(browser.env)).toMatchObject({ joined: first });
    expect(await startSync(browser.env, "join_from_remote")).toMatchObject({ status: "synced" });
    expect(await webSyncStatus(browser.env)).toMatchObject({ joined: browser.device() });
  });

  it("syncs only as the device it joined with, read from the session at the order", async () => {
    const api = apiAt();
    const browser = await browserOf(base(), api);
    const { web, env } = browser;
    await startSync(env, "init");
    const joined = browser.device();
    await web.record([new Builder(20).deposit("100")]);
    // Another tab signs in again: the cookie is of another device now.
    await browser.signInAgain();
    expect(await syncNow(env)).toMatchObject({
      status: "refused",
      refusal: { code: "sync_device_changed", details: { joined, session: browser.device() } },
    });
    expect(await redownload(env)).toMatchObject({
      refusal: { code: "sync_device_changed" },
    });
    expect(await cloudText(api)).toBe(textOf(base()));
    // Joining again, with its operations, is the way out.
    expect(await startSync(env, "join_with_mine")).toMatchObject({ status: "synced", pending: 1 });
    expect(await syncNow(env)).toMatchObject({ status: "synced", uploaded: 1 });
    expect(await cloudText(api)).toBe(await web.text());
  });

  it("stops without a session, and writes nothing", async () => {
    const api = apiAt();
    const browser = await browserOf(base(), api);
    await startSync(browser.env, "init");
    await browser.web.record([new Builder(30).deposit("10")]);
    browser.signOut();
    expect(await syncNow(browser.env)).toMatchObject({
      status: "stopped",
      stop: { code: "remote_failed", details: { remote_code: "unauthenticated" } },
    });
    expect(await cloudText(api)).toBe(textOf(base()));
  });

  it("refuses to initialise over a cloud that holds another ledger, and finishes one that holds this one", async () => {
    const api = apiAt();
    const first = await browserOf(base(), api);
    await startSync(first.env, "init");
    const other = new Builder(40);
    other.account("acc_other");
    const stranger = await browserOf(other.events, api);
    expect(await startSync(stranger.env, "init")).toMatchObject({
      refusal: { code: "init_remote_not_empty" },
    });
    // A copy of the same bytes: an initialisation cut after uploading.
    const copy = await browserOf(base(), api);
    expect(await startSync(copy.env, "init")).toMatchObject({
      status: "synced",
      uploaded: 0,
    });
    expect(await webSyncStatus(copy.env)).toMatchObject({ joined: copy.device(), pending: 0 });
  });

  it("joins from the cloud holding its own lines back, says how many, and never uploads them alone", async () => {
    const api = apiAt();
    const first = await browserOf(base(), api);
    await startSync(first.env, "init");
    const own = new Builder(60);
    own.deposit("250");
    const second = await browserOf([...base(), ...own.events], api);
    expect(await startSync(second.env, "join_from_remote")).toMatchObject({
      status: "synced",
      retained: 1,
    });
    expect(await second.web.text()).toBe(textOf(base()));
    expect(await webSyncStatus(second.env)).toMatchObject({ joined: second.device(), held: 1 });
    const [view] = await heldList(second.env);
    expect(view?.resolutions).not.toContain("confirm");
    await expect(confirmHeld(second.env, view?.unit.unit as string)).rejects.toMatchObject({
      code: "resolution_not_offered",
    });
    expect(await syncNow(second.env)).toMatchObject({ status: "synced", uploaded: 0 });
    expect(await cloudText(api)).toBe(textOf(base()));
  });

  it("holds back an operation another device already recorded, until the user confirms it", async () => {
    const api = apiAt();
    const first = await browserOf(base(), api);
    await startSync(first.env, "init");
    const second = await browserOf(base(), api);
    expect(await startSync(second.env, "join_from_remote")).toMatchObject({ retained: 0 });
    const deposit = { amount: "50", date: "2027-01-11" };
    await first.web.record([new Builder(100).deposit(deposit.amount, deposit.date)]);
    expect(await syncNow(first.env)).toMatchObject({ status: "synced", uploaded: 1 });
    await second.web.record([new Builder(900).deposit(deposit.amount, deposit.date)]);
    expect(await syncNow(second.env)).toMatchObject({ held: { code: "new_duplicate" } });
    const [view] = await heldList(second.env);
    expect(view?.resolutions).toEqual(["confirm", "redo", "discard"]);
    await confirmHeld(second.env, view?.unit.unit as string);
    expect(await syncNow(second.env)).toMatchObject({ status: "synced", uploaded: 1 });
    expect(await webSyncStatus(second.env)).toMatchObject({ held: 0, pending: 0 });
    expect(await cloudText(api)).toBe(await second.web.text());
  });

  it("discards what is held back, and redoes it with the plan the user saw", async () => {
    const api = apiAt();
    const first = await browserOf(base(), api);
    await startSync(first.env, "init");
    const own = new Builder(80);
    own.deposit("300");
    own.deposit("400", "2027-01-12");
    const second = await browserOf([...base(), ...own.events], api);
    expect(await startSync(second.env, "join_from_remote")).toMatchObject({ retained: 2 });
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
    expect(await syncNow(second.env)).toMatchObject({ status: "synced", uploaded: 1 });
  });

  // Review of PR #97, correctness B1 (D-Q1): resolving what is held never
  // waits for the rest of the ledger to be valid.
  it("redoes what is held back on a ledger that is invalid", async () => {
    const api = apiAt();
    const first = await browserOf(base(), api);
    await startSync(first.env, "init");
    const own = new Builder(80);
    own.deposit("300");
    const second = await browserOf([...base(), ...own.events], api);
    await startSync(second.env, "join_from_remote");
    // A sale of more than is held: the local ledger is invalid now.
    await second.web.record([new Builder(200).trade("sell", "1000", "2027-02-01")]);
    const deps = depsOf(second.web, second.env);
    const { projectLedger } = await import("@atlas/domain");
    const loaded = await deps.store.load();
    expect(projectLedger(loaded.events, { collectErrors: true }).invalid.length).toBeGreaterThan(0);
    const [unit] = await heldList(second.env);
    const redo = await planRedo(second.env, deps, unit?.unit.unit as string);
    expect("plan" in redo).toBe(true);
    if ("plan" in redo) {
      await recordRedo(second.env, deps, unit?.unit.unit as string, redo.plan, false);
    }
    expect(await webSyncStatus(second.env)).toMatchObject({ held: 0 });
    expect(await second.web.text()).toContain('"amount":"300"');
  });

  it("joins with its own operations as pending", async () => {
    const api = apiAt();
    const first = await browserOf(base(), api);
    await startSync(first.env, "init");
    const own = new Builder(100);
    own.deposit("500");
    const second = await browserOf([...base(), ...own.events], api);
    expect(await startSync(second.env, "join_with_mine")).toMatchObject({
      status: "synced",
      pending: 1,
    });
    expect(await syncNow(second.env)).toMatchObject({ status: "synced", uploaded: 1 });
  });

  it("deactivates only with nothing pending, and then does not sync until joined again", async () => {
    const api = apiAt();
    const { web, env } = await browserOf(base(), api);
    await startSync(env, "init");
    await web.record([new Builder(120).deposit("70")]);
    expect(await deactivate(env)).toMatchObject({
      code: "deactivate_refused_pending",
      details: { pending: 1 },
    });
    await syncNow(env);
    expect(await deactivate(env)).toBeUndefined();
    expect(await webSyncStatus(env)).toMatchObject({ configured: true, enabled: false });
    expect(await syncNow(env)).toMatchObject({
      refusal: { code: "sync_deactivated" },
    });
  });
});
