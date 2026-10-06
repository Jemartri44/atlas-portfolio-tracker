// @vitest-environment happy-dom
//
// Feature 023 (ADR-0035, E2b): writing from the web, over the real handler with
// the doubles of S3, SSM and Google. A write is one unit with `If-Match`; a
// `412` reloads quietly and asks to confirm again; a lost answer is looked for
// by its ids and a retry uses the same ones; an ended session is said, not lost.

import type { PreparedRateCorrections } from "@atlas/domain/ecb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootCloud } from "../../src/ledger/cloud.js";
import { discardPending, retryPending, settlePending } from "../../src/ledger/pending.js";
import { writeCorrections } from "../../src/ledger/rate-corrections.js";
import { requireDeps, store } from "../../src/ledger/state.js";
import { previewDraft, recordDraft } from "../../src/ledger/write.js";
import { goldenText } from "../helpers/golden.js";
import { until } from "../helpers/render.jsx";
import { apiAt, cloudText, sameOrigin, signedIn } from "../sync/api-support.js";

const LEDGER = "ledger/ledger.jsonl";

const deposit = (amount: string) =>
  ({
    type: "cash_deposit",
    account_id: "acc_mi",
    value_date: "2027-08-25",
    amount,
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2027-08-25",
  }) as never;

const rig = async () => {
  const api = apiAt();
  api.s3.seed(LEDGER, goldenText());
  const net = {
    cookie: (await signedIn(api)).cookie as string | undefined,
    /** "lost": the POST reaches the API and the answer never comes; "dropped": it never leaves. */
    post: "ok" as "ok" | "lost" | "dropped",
  };
  const through = sameOrigin(api, () => net.cookie);
  const request = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === "/api/ledger/lines" && net.post !== "ok") {
      if (net.post === "lost") {
        await through(input, init);
      }
      net.post = "ok";
      throw new TypeError("network lost");
    }
    return through(input, init);
  }) as typeof fetch;
  await bootCloud(request);
  await until(() => store.load().phase === "ready", "the ledger");
  return { api, net };
};

beforeEach(() => store.setPending(undefined));
afterEach(() => {
  store.setPending(undefined);
  store.setDeps(undefined);
  store.setLoad({ phase: "loading" });
});

describe("writing to the cloud", () => {
  it("records one unit and shows it in the reloaded ledger", async () => {
    const { api } = await rig();
    const before = store.snapshot()?.events.length as number;
    const result = await recordDraft(deposit("100"));
    expect(result.ok).toBe(true);
    expect((await cloudText(api)).trim().split("\n")).toHaveLength(before + 1);
    expect(store.snapshot()?.events).toHaveLength(before + 1);
    expect(store.pending()).toBeUndefined();
  });

  it("a stale screen gets a conflict, with the ledger reloaded and nothing written", async () => {
    const { api } = await rig();
    const phase = store.load();
    if (phase.phase !== "ready") {
      throw new Error("not ready");
    }
    const old = phase.snapshot;
    await recordDraft(deposit("5"));
    const written = (await cloudText(api)).trim().split("\n").length;
    // The page still paints the old ledger (a form open for minutes).
    store.setLoad({ ...phase, snapshot: old });
    const result = await recordDraft(deposit("7"));
    expect(result).toEqual({ ok: false, failure: { kind: "conflict" } });
    expect((await cloudText(api)).trim().split("\n")).toHaveLength(written);
    expect(store.snapshot()?.etag).not.toBe(old.etag);
  });

  it("a lost answer is looked for by its id: it was written, and is not written twice", async () => {
    const { api, net } = await rig();
    const before = (await cloudText(api)).trim().split("\n").length;
    net.post = "lost";
    const result = await recordDraft(deposit("9"));
    expect(result).toEqual({ ok: false, failure: { kind: "unknown" } });
    await until(() => store.pending()?.state === "written", "the outcome");
    expect((await cloudText(api)).trim().split("\n")).toHaveLength(before + 1);
    discardPending();
  });

  it("a send that never left is not written, and sending again uses the same id", async () => {
    const { api, net } = await rig();
    const before = (await cloudText(api)).trim().split("\n").length;
    net.post = "dropped";
    const result = await recordDraft(deposit("9"));
    expect(result).toEqual({ ok: false, failure: { kind: "unknown" } });
    await until(() => store.pending()?.state === "not_written", "the outcome");
    const id = store.pending()?.ids[0] as string;
    // Nothing else may be recorded meanwhile.
    expect((await recordDraft(deposit("1"))).ok).toBe(false);
    await retryPending();
    expect(store.pending()?.state).toBe("written");
    const lines = (await cloudText(api)).trim().split("\n");
    expect(lines).toHaveLength(before + 1);
    expect(lines.at(-1)).toContain(id);
    await settlePending();
    discardPending();
  });

  it("an ended session is said, and nothing is written", async () => {
    const { api, net } = await rig();
    const before = (await cloudText(api)).trim().split("\n").length;
    net.cookie = undefined;
    const result = await recordDraft(deposit("3"));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind).toBe("signed_out");
    expect((await cloudText(api)).trim().split("\n")).toHaveLength(before);
  });
});

describe("writing the chain of ECB rate corrections", () => {
  /** A real chain of two events, as `prepareRateCorrections` would hand it over. */
  const chain = async (): Promise<PreparedRateCorrections> => {
    const first = (await previewDraft(deposit("11"))).candidates;
    const second = (await previewDraft(deposit("12"))).candidates;
    const loaded = await requireDeps().store.load();
    return {
      chain: [...first, ...second],
      etag: loaded.etag,
      events: loaded.events,
    } as unknown as PreparedRateCorrections;
  };

  it("a lost answer finds the chain by the ids it sent: it was written, and is not written twice", async () => {
    const { api, net } = await rig();
    const before = (await cloudText(api)).trim().split("\n").length;
    const prepared = await chain();
    expect(new Set(prepared.chain.map((event) => event.id)).size).toBe(2);
    net.post = "lost";
    const result = await writeCorrections(prepared);
    expect(result).toEqual({ ok: false, failure: { kind: "unknown" } });
    expect(store.pending()?.ids).toEqual(prepared.chain.map((event) => event.id));
    await until(() => store.pending()?.state === "written", "the outcome");
    expect((await cloudText(api)).trim().split("\n")).toHaveLength(before + prepared.chain.length);
    discardPending();
  });

  it("a send that never left is sent again with the same ids, and nothing is duplicated", async () => {
    const { api, net } = await rig();
    const before = (await cloudText(api)).trim().split("\n").length;
    const prepared = await chain();
    net.post = "dropped";
    await writeCorrections(prepared);
    await until(() => store.pending()?.state === "not_written", "the outcome");
    await retryPending();
    expect(store.pending()?.said).toBeUndefined();
    expect(store.pending()?.state).toBe("written");
    const lines = (await cloudText(api)).trim().split("\n");
    expect(lines).toHaveLength(before + prepared.chain.length);
    for (const event of prepared.chain) {
      expect(lines.filter((line) => line.includes(event.id))).toHaveLength(1);
    }
    discardPending();
  });
});
