import { describe, expect, it } from "vitest";
import { checkSymbols, recordSymbols, removeSymbols } from "../../src/quotes/declare.js";
import { parseStatus } from "../../src/quotes/status.js";
import { parseSymbols } from "../../src/quotes/symbols.js";
import { closes, declared, FakeSource, MemoryPriceStore } from "./fakes.js";

const now = () => new Date("2027-01-06T08:00:00.000Z");

const sources = (store: MemoryPriceStore, eodhd: string | undefined | Error = "GBP") => ({
  eodhd: new FakeSource(
    "eodhd",
    () => closes(),
    store,
    () => (eodhd instanceof Error ? eodhd : { ok: true, value: eodhd }),
  ),
});

describe("declaring the symbols of an asset (D-Q2, D-Q6)", () => {
  it("asks the source for its currency, one reserved call", async () => {
    const store = new MemoryPriceStore();
    const result = await checkSymbols({
      declaration: declared("GBX", { eodhd: "CSPX.LSE" }),
      store,
      sources: sources(store),
      now,
    });
    expect(result).toEqual({ ok: true, checks: { eodhd: "GBP" }, unchecked: [] });
    const status = parseStatus(store.files.get("_status.json"));
    expect(status.sources.eodhd?.calls_at).toHaveLength(1);
  });

  it("leaves unchecked, and says so, a source without a key or without budget", async () => {
    const store = new MemoryPriceStore();
    const declaration = declared("EUR", { eodhd: "X.EUFUND" });
    // Without a source built (no key)…
    expect(await checkSymbols({ declaration, store, sources: {}, now })).toEqual({
      ok: true,
      checks: {},
      unchecked: ["eodhd"],
    });
    // …or with a budget of zero.
    store.files.set("config.json", '{"daily_calls":{"eodhd":0}}');
    expect(await checkSymbols({ declaration, store, sources: sources(store), now })).toEqual({
      ok: true,
      checks: {},
      unchecked: ["eodhd"],
    });
    // A declaration without a symbol asks nothing.
    expect(
      await checkSymbols({ declaration: declared("EUR", {}), store, sources: sources(store), now }),
    ).toEqual({ ok: true, checks: {}, unchecked: [] });
  });

  it("stops at the first source that fails, and writes nothing", async () => {
    const store = new MemoryPriceStore();
    const s = sources(store, new Error("down"));
    expect(
      await checkSymbols({ declaration: declared("EUR", { eodhd: "X" }), store, sources: s, now }),
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
        declaration: declared("EUR", { eodhd: "X" }),
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
        declaration: declared("EUR", { eodhd: "X" }),
        store,
        sources: { ...s, eodhd },
        now,
      }),
    ).rejects.toThrow("no exact JSON numbers here");
    expect(store.transactions).toBe(0);
    // A declaration without a symbol does not ask whether the source can run.
    expect(
      await checkSymbols({
        declaration: declared("EUR", {}),
        store,
        sources: { ...s, eodhd },
        now,
      }),
    ).toMatchObject({ ok: true });
  });

  it("writes nothing while a disagreement is not confirmed, and keeps the confirmation", async () => {
    const store = new MemoryPriceStore();
    const declaration = declared("GBX", { eodhd: "CSPX.LSE" });
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
      declaration: declared("EUR", {}),
      checks: {},
      accepted: [],
      store,
      now,
    };
    await recordSymbols(other);
    const file = parseSymbols(store.files.get("symbols.json"));
    expect(file.assets.ast_x).toMatchObject({
      currencies: { eodhd: "GBX" },
      currency_confirmed_over: { eodhd: "GBP" },
    });
    expect(Object.keys(file.assets)).toEqual(["ast_x", "ast_y"]);
    expect(await removeSymbols(store, "ast_x")).toBe(true);
    expect(await removeSymbols(store, "ast_x")).toBe(false);
    expect(Object.keys(parseSymbols(store.files.get("symbols.json")).assets)).toEqual(["ast_y"]);
  });
});
