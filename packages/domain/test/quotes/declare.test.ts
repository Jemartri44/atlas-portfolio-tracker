import { describe, expect, it } from "vitest";
import { checkSymbols, recordSymbols, removeSymbols } from "../../src/quotes/declare.js";
import { parseStatus } from "../../src/quotes/status.js";
import { parseSymbols } from "../../src/quotes/symbols.js";
import { closes, FakeSource, MemoryPriceStore } from "./fakes.js";

const now = () => new Date("2027-01-06T08:00:00.000Z");

const sources = (store: MemoryPriceStore, eodhd: string | undefined | Error = "GBP") => ({
  eodhd: new FakeSource(
    "eodhd",
    () => closes(),
    store,
    () => (eodhd instanceof Error ? eodhd : { ok: true, value: eodhd }),
  ),
  alpha_vantage: new FakeSource(
    "alpha_vantage",
    () => closes(),
    store,
    () => ({ ok: true, value: "GBX" }),
  ),
});

describe("declaring the symbols of an asset (D-Q2, D-Q6)", () => {
  it("asks each source for its currency, one reserved call each", async () => {
    const store = new MemoryPriceStore();
    const result = await checkSymbols({
      declaration: { currency: "GBX", eodhd: "CSPX.LSE", alpha_vantage: "CSPX.LON" },
      store,
      sources: sources(store),
      now,
    });
    expect(result).toEqual({
      ok: true,
      checks: { eodhd: "GBP", alpha_vantage: "GBX" },
      unchecked: [],
    });
    const status = parseStatus(store.files.get("_status.json"));
    expect(status.sources.eodhd?.calls_at).toHaveLength(1);
    expect(status.sources.alpha_vantage?.calls_at).toHaveLength(1);
  });

  it("leaves unchecked, and says so, a source without a key or without budget", async () => {
    const store = new MemoryPriceStore();
    store.files.set("config.json", '{"daily_calls":{"alpha_vantage":0}}');
    const result = await checkSymbols({
      declaration: { currency: "EUR", eodhd: "X.EUFUND", alpha_vantage: "X" },
      store,
      sources: { alpha_vantage: sources(store).alpha_vantage },
      now,
    });
    expect(result).toEqual({ ok: true, checks: {}, unchecked: ["eodhd", "alpha_vantage"] });
    // A source without a symbol in the declaration is not asked at all.
    const only = await checkSymbols({
      declaration: { currency: "GBX", alpha_vantage: "X.LON" },
      store,
      sources: sources(store),
      now,
    });
    expect(only).toEqual({ ok: true, checks: {}, unchecked: ["alpha_vantage"] });
  });

  it("stops at the first source that fails, and writes nothing", async () => {
    const store = new MemoryPriceStore();
    const s = sources(store, new Error("down"));
    expect(
      await checkSymbols({ declaration: { currency: "EUR", eodhd: "X" }, store, sources: s, now }),
    ).toEqual({
      ok: false,
      source: "eodhd",
      kind: "unavailable",
    });
    const refused = {
      ...s,
      eodhd: new FakeSource(
        "eodhd",
        () => closes(),
        store,
        () => ({ ok: false, kind: "blocked" }),
      ),
    };
    expect(
      await checkSymbols({
        declaration: { currency: "EUR", eodhd: "X" },
        store,
        sources: refused,
        now,
      }),
    ).toMatchObject({
      ok: false,
      kind: "blocked",
    });
    expect(store.files.has("symbols.json")).toBe(false);
  });

  it("stops before reserving anything when a source cannot run in this runtime (D-Q1)", async () => {
    const store = new MemoryPriceStore();
    const s = sources(store);
    const eodhd = Object.assign(s.eodhd, {
      ready: () => {
        throw new Error("no exact JSON numbers here");
      },
    });
    await expect(
      checkSymbols({
        declaration: { currency: "EUR", eodhd: "X" },
        store,
        sources: { ...s, eodhd },
        now,
      }),
    ).rejects.toThrow("no exact JSON numbers here");
    expect(store.transactions).toBe(0);
    // A source without a symbol in the declaration is not asked whether it can run.
    expect(
      await checkSymbols({
        declaration: { currency: "EUR", alpha_vantage: "X" },
        store,
        sources: { ...s, eodhd },
        now,
      }),
    ).toMatchObject({ ok: true });
  });

  it("writes nothing while a disagreement is not confirmed, and keeps the confirmation", async () => {
    const store = new MemoryPriceStore();
    const declaration = { currency: "GBX", eodhd: "CSPX.LSE" };
    const pending = await recordSymbols({
      assetId: "ast_x",
      declaration,
      checks: { eodhd: "GBP" },
      accepted: [],
      store,
      now,
    });
    expect(pending).toEqual([{ source: "eodhd", declared: "GBX", found: "GBP" }]);
    expect(store.files.has("symbols.json")).toBe(false);
    expect(
      await recordSymbols({
        assetId: "ast_x",
        declaration,
        checks: { eodhd: "GBP" },
        accepted: ["eodhd"],
        store,
        now,
      }),
    ).toEqual([]);
    const other = {
      assetId: "ast_y",
      declaration: { currency: "EUR" },
      checks: {},
      accepted: [],
      store,
      now,
    };
    await recordSymbols(other);
    const file = parseSymbols(store.files.get("symbols.json"));
    expect(file.assets.ast_x).toMatchObject({
      currency: "GBX",
      currency_confirmed_over: { eodhd: "GBP" },
    });
    expect(Object.keys(file.assets)).toEqual(["ast_x", "ast_y"]);
    expect(await removeSymbols(store, "ast_x")).toBe(true);
    expect(await removeSymbols(store, "ast_x")).toBe(false);
    expect(Object.keys(parseSymbols(store.files.get("symbols.json")).assets)).toEqual(["ast_y"]);
  });
});
