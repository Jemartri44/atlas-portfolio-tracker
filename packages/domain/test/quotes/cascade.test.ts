import { describe, expect, it } from "vitest";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { type UpdatePricesInput, updatePrices } from "../../src/quotes/cascade.js";
import { encodeCloseLine, readCloseFile } from "../../src/quotes/line.js";
import { downloadPlan } from "../../src/quotes/priority.js";
import { parseStatus } from "../../src/quotes/status.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { closes, FakeSource, MemoryPriceStore, symbolsFile } from "./fakes.js";

const TODAY = "2027-01-06"; // a Wednesday
const settings = mergeSettings(DEFAULT_SETTINGS, { bucket_benchmark_asset_id: "ast_index" });

/** A bucket position, a benchmark, a fund with a reference ETF and the rest of the core. */
const ledger = () => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.asset("ast_index", { asset_type: "etf" });
  b.asset("ast_wetf", { asset_type: "etf" });
  b.asset("ast_unheld", { asset_type: "etf" });
  b.assetUpdated({
    asset_id: "ast_world",
    asset_type: "fund",
    book: "core",
    asset_class: "equity",
    name: "ast_world",
    currency: "EUR",
    transferable: true,
    active: true,
    reference_etf_id: "ast_wetf",
  });
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", trade_date: "2027-01-04" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_bonds", trade_date: "2027-01-04" });
  b.thesisOpened({ thesis_id: "th1" });
  b.buy({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    trade_date: "2027-01-04",
    currency: "USD",
    fx_rate: "1.1",
    thesis_id: "th1",
  });
  return projectLedger(b.build(), { asOf: TODAY });
};

const ALL = {
  ast_spec: { currency: "USD", eodhd: "SPEC.US", alpha_vantage: "SPEC" },
  ast_index: { currency: "EUR", eodhd: "INDEX.INDX" },
  ast_wetf: { currency: "EUR", eodhd: "WETF.XETRA", alpha_vantage: "WETF.DEX" },
  ast_world: { currency: "EUR", eodhd: "LU0000000001.EUFUND" },
  ast_bonds: { currency: "EUR", eodhd: "BOND.AS" },
};

const setup = (
  answer: ConstructorParameters<typeof FakeSource>[1] = () => closes(["2027-01-05", "10"]),
  fallback: ConstructorParameters<typeof FakeSource>[1] = () => closes(["2027-01-05", "10"]),
) => {
  const store = new MemoryPriceStore();
  store.files.set("symbols.json", symbolsFile(ALL));
  const eodhd = new FakeSource("eodhd", answer, store);
  const alpha = new FakeSource("alpha_vantage", fallback, store);
  let tick = Date.parse("2027-01-06T08:00:00.000Z");
  const input: UpdatePricesInput = {
    state: ledger(),
    settings,
    today: TODAY,
    now: () => {
      tick += 1000;
      return new Date(tick);
    },
    store,
    sources: { eodhd, alpha_vantage: alpha },
  };
  return { store, eodhd, alpha, input };
};

describe("the priority of the day (ADR-0031, fixed)", () => {
  it("is the bucket, then the index and the reference ETFs, then the core; nothing unheld", () => {
    expect(downloadPlan(ledger(), settings)).toEqual([
      { asset_id: "ast_spec", group: "bucket" },
      { asset_id: "ast_index", group: "reference" },
      { asset_id: "ast_wetf", group: "reference" },
      { asset_id: "ast_bonds", group: "core" },
      { asset_id: "ast_world", group: "core" },
    ]);
  });

  it("lists an asset once, in its first group, and nothing sold", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", trade_date: "2027-01-04" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_bonds", trade_date: "2027-01-04" });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      trade_date: "2027-01-05",
      quantity: "10",
    });
    const plan = downloadPlan(
      projectLedger(b.build()),
      mergeSettings(DEFAULT_SETTINGS, { bucket_benchmark_asset_id: "ast_world" }),
    );
    expect(plan).toEqual([{ asset_id: "ast_world", group: "reference" }]);
  });

  it("ignores a benchmark or a reference that is not in the catalogue", () => {
    const plan = downloadPlan(
      ledger(),
      mergeSettings(DEFAULT_SETTINGS, { bucket_benchmark_asset_id: "ast_typo" }),
    );
    expect(plan.map((p) => p.asset_id)).not.toContain("ast_typo");
  });
});

describe("updatePrices", () => {
  it("without any source with a key, calls nobody and says so", async () => {
    const { store, input } = setup();
    const report = await updatePrices({ ...input, sources: {} });
    expect(report).toEqual({ no_sources: true, assets: [], remaining: {}, failing: [] });
    expect(store.transactions).toBe(0);
    // A source switched off by its budget counts as no source.
    store.files.set("config.json", '{"daily_calls":{"eodhd":0}}');
    expect(
      (await updatePrices({ ...input, sources: { eodhd: input.sources.eodhd as FakeSource } }))
        .no_sources,
    ).toBe(true);
  });

  it("downloads in the order of priority, writes the lines, and never calls with the lock held", async () => {
    const { store, eodhd, alpha, input } = setup();
    const report = await updatePrices(input);
    expect(eodhd.calls.map((c) => c.symbol)).toEqual([
      "SPEC.US",
      "INDEX.INDX",
      "WETF.XETRA",
      "BOND.AS",
      "LU0000000001.EUFUND",
    ]);
    expect(eodhd.calls.every((c) => !c.locked)).toBe(true);
    expect(alpha.calls).toEqual([]);
    // A year back the first time; the declared currency on every line.
    expect(eodhd.calls[0]).toMatchObject({ from: "2026-01-06", to: TODAY });
    expect(readCloseFile("ast_spec", store.files.get("ast_spec.jsonl") ?? "")).toEqual([
      {
        schema_version: 1,
        date: "2027-01-05",
        close: "10",
        currency: "USD",
        source: "eodhd",
        fetched_at: expect.any(String),
      },
    ]);
    expect(report.assets.map((a) => [a.asset_id, a.outcome, a.source, a.added])).toEqual([
      ["ast_spec", "updated", "eodhd", 1],
      ["ast_index", "updated", "eodhd", 1],
      ["ast_wetf", "updated", "eodhd", 1],
      ["ast_bonds", "updated", "eodhd", 1],
      ["ast_world", "updated", "eodhd", 1],
    ]);
    expect(report.remaining).toEqual({ eodhd: 15, alpha_vantage: 25 });
    expect(parseStatus(store.files.get("_status.json")).sources.eodhd).toMatchObject({
      consecutive_failures: 0,
      last_success: expect.any(String),
    });
  });

  it("spends nothing the second time on what is already up to date", async () => {
    const { eodhd, input } = setup();
    await updatePrices(input);
    const again = await updatePrices(input);
    expect(eodhd.calls).toHaveLength(5);
    expect(again.assets.every((a) => a.outcome === "up_to_date")).toBe(true);
    expect(again.remaining.eodhd).toBe(15);
  });

  it("asks from the day after the last close, and says unchanged when nothing is new", async () => {
    const { store, eodhd, input } = setup(() => closes(["2027-01-01", "9"]));
    store.files.set(
      "ast_spec.jsonl",
      `${encodeCloseLine({ schema_version: 1, date: "2027-01-01", close: "9.0", currency: "USD", source: "eodhd", fetched_at: "2027-01-02T00:00:00.000Z" })}\n`,
    );
    const report = await updatePrices(input);
    expect(eodhd.calls[0]).toMatchObject({ symbol: "SPEC.US", from: "2027-01-02" });
    // The answer carried a close outside the window: it is not stored.
    expect(report.assets[0]).toMatchObject({ outcome: "unchanged", added: 0 });
  });

  it("goes to the fallback after unavailable or not_found, and says which source failed", async () => {
    const { eodhd, alpha, input } = setup((symbol) =>
      symbol === "SPEC.US" ? { ok: false, kind: "unavailable" } : { ok: false, kind: "not_found" },
    );
    const report = await updatePrices(input);
    expect(alpha.calls.map((c) => c.symbol)).toEqual(["SPEC", "WETF.DEX"]);
    expect(report.assets[0]).toMatchObject({
      outcome: "updated",
      source: "alpha_vantage",
      failures: [{ source: "eodhd", kind: "unavailable" }],
    });
    // Without a fallback symbol, a not_found is a failure of the asset.
    expect(report.assets[1]).toMatchObject({
      outcome: "failed",
      failures: [{ source: "eodhd", kind: "not_found" }],
    });
    expect(eodhd.calls).toHaveLength(5);
  });

  it("never retries a blocked or rate-limited source in the same run, not even for another symbol", async () => {
    for (const kind of ["blocked", "rate_limited"] as const) {
      const { store, eodhd, alpha, input } = setup(() => ({ ok: false, kind }));
      const report = await updatePrices(input);
      expect(eodhd.calls).toHaveLength(1);
      expect(alpha.calls.map((c) => c.symbol)).toEqual(["SPEC", "WETF.DEX"]);
      expect(report.assets[1]).toMatchObject({
        outcome: "failed",
        failures: [{ source: "eodhd", kind }],
      });
      // It is one consecutive failure, not five.
      expect(parseStatus(store.files.get("_status.json")).sources.eodhd?.consecutive_failures).toBe(
        1,
      );
    }
  });

  it("treats an exception of an adapter as unavailable", async () => {
    const { report } = await (async () => {
      const s = setup(() => new Error("socket hang up"));
      return { report: await updatePrices(s.input) };
    })();
    expect(report.assets[0]?.failures[0]).toEqual({ source: "eodhd", kind: "unavailable" });
  });

  it("keeps the last value of what does not fit in the budget, and says how many stayed out", async () => {
    const { store, eodhd, alpha, input } = setup();
    store.files.set("config.json", '{"daily_calls":{"eodhd":2,"alpha_vantage":1}}');
    const report = await updatePrices(input);
    expect(eodhd.calls.map((c) => c.symbol)).toEqual(["SPEC.US", "INDEX.INDX"]);
    expect(alpha.calls.map((c) => c.symbol)).toEqual(["WETF.DEX"]);
    expect(report.assets.map((a) => a.outcome)).toEqual([
      "updated",
      "updated",
      "updated",
      "out_of_budget",
      "out_of_budget",
    ]);
    expect(report.assets[3]?.failures).toEqual([{ source: "eodhd", kind: "budget_exhausted" }]);
    expect(report.remaining).toEqual({ eodhd: 0, alpha_vantage: 0 });
  });

  it("never spends more than the budget with two consoles at once", async () => {
    const { store, eodhd, input } = setup();
    store.files.set("config.json", '{"daily_calls":{"eodhd":3,"alpha_vantage":0}}');
    const second = new FakeSource("eodhd", () => closes(["2027-01-05", "10"]), store);
    // The two runs interleave call by call; the lock is per reservation.
    await Promise.all([
      updatePrices(input),
      updatePrices({ ...input, sources: { eodhd: second } }),
    ]);
    expect(eodhd.calls.length + second.calls.length).toBe(3);
    expect(parseStatus(store.files.get("_status.json")).sources.eodhd?.calls_at).toHaveLength(3);
  });

  it("never downloads a symbol whose currency disagrees, and records it with its own literal", async () => {
    const { store, eodhd, alpha, input } = setup();
    store.files.set(
      "symbols.json",
      symbolsFile({
        ast_spec: {
          currency: "USD",
          eodhd: "SPEC.US",
          alpha_vantage: "SPEC",
          currency_check: { eodhd: { found: "EUR", at: "x" } },
        },
      }),
    );
    const report = await updatePrices(input);
    expect(eodhd.calls).toEqual([]);
    expect(alpha.calls.map((c) => c.symbol)).toEqual(["SPEC"]);
    expect(report.assets[0]).toMatchObject({
      outcome: "updated",
      source: "alpha_vantage",
      failures: [{ source: "eodhd", kind: "currency_mismatch" }],
    });
    // With both sources disagreeing, nothing is called for it.
    store.files.set(
      "symbols.json",
      symbolsFile({
        ast_spec: {
          currency: "USD",
          eodhd: "SPEC.US",
          currency_check: { eodhd: { found: "EUR", at: "x" } },
        },
      }),
    );
    store.files.delete("ast_spec.jsonl");
    const alone = await updatePrices(input);
    expect(alone.assets[0]).toMatchObject({ outcome: "currency_mismatch" });
    expect(
      parseStatus(store.files.get("_status.json")).assets.ast_spec?.last_failure,
    ).toMatchObject({
      kind: "currency_mismatch",
      declared: "USD",
      found: "EUR",
    });
  });

  it("does not store a close whose currency the source gave and disagrees, and does not count it as a failure of the source", async () => {
    const { store, input } = setup(
      (symbol) =>
        symbol === "SPEC.US"
          ? { ok: true, value: [{ date: "2027-01-05", close: "10", currency: "EUR" }] }
          : closes(["2027-01-05", "10"]),
      () => ({ ok: true, value: [{ date: "2027-01-05", close: "10", currency: "GBP" }] }),
    );
    const report = await updatePrices(input);
    expect(report.assets[0]).toMatchObject({
      outcome: "currency_mismatch",
      failures: [
        { source: "eodhd", kind: "currency_mismatch" },
        { source: "alpha_vantage", kind: "currency_mismatch" },
      ],
    });
    expect(store.files.has("ast_spec.jsonl")).toBe(false);
    const status = parseStatus(store.files.get("_status.json"));
    expect(status.sources.eodhd?.consecutive_failures).toBe(0);
    expect(status.assets.ast_spec?.last_failure).toMatchObject({ found: "GBP", declared: "USD" });
  });

  it("says an asset has no symbol, and spends nothing on it", async () => {
    const { store, eodhd, input } = setup();
    store.files.set(
      "symbols.json",
      symbolsFile({ ast_spec: { currency: "USD", alpha_vantage: "SPEC" } }),
    );
    const report = await updatePrices({
      ...input,
      sources: { eodhd: input.sources.eodhd as FakeSource },
    });
    expect(eodhd.calls).toEqual([]);
    expect(report.assets.map((a) => a.outcome)).toEqual(Array(5).fill("no_symbol"));
  });

  it("says a file it cannot read, and neither calls nor writes for that asset", async () => {
    const { store, eodhd, input } = setup();
    store.files.set("ast_spec.jsonl", '{"schema_version":2}\n');
    const report = await updatePrices(input);
    expect(report.assets[0]).toMatchObject({
      outcome: "unreadable",
      error: "price_file_newer_version",
    });
    expect(eodhd.calls.map((c) => c.symbol)).not.toContain("SPEC.US");
    expect(store.files.get("ast_spec.jsonl")).toBe('{"schema_version":2}\n');
  });

  it("decides what to append inside the lock, with what is there then", async () => {
    // Another console writes the same close, and a newer version of a file,
    // between the download and the write: the decision uses what is there now.
    const { store, input } = setup();
    const eodhd = new FakeSource(
      "eodhd",
      (symbol) => {
        // Another console writes the close of ast_spec while this one is
        // already asking for another asset: after the download of ast_spec,
        // before its write.
        if (symbol === "INDEX.INDX") {
          store.files.set(
            "ast_spec.jsonl",
            `${encodeCloseLine({ schema_version: 1, date: "2027-01-05", close: "10.00", currency: "USD", source: "eodhd", fetched_at: "2027-01-06T07:00:00.000Z" })}\n`,
          );
        }
        if (symbol === "BOND.AS") {
          store.files.set("ast_bonds.jsonl", '{"schema_version":2}\n');
        }
        return closes(["2027-01-05", "10"]);
      },
      store,
    );
    const report = await updatePrices({ ...input, sources: { eodhd } });
    expect(readCloseFile("ast_spec", store.files.get("ast_spec.jsonl") ?? "")).toHaveLength(1);
    expect(report.assets[0]).toMatchObject({ outcome: "unchanged", added: 0 });
    expect(report.assets.find((a) => a.asset_id === "ast_bonds")).toMatchObject({
      outcome: "unreadable",
      error: "price_file_newer_version",
    });
  });

  it("only appends: the bytes already there are never rewritten", async () => {
    const { store, input } = setup(() => closes(["2027-01-05", "10"]));
    const first = `${encodeCloseLine({ schema_version: 1, date: "2027-01-04", close: "9.50", currency: "USD", source: "alpha_vantage", fetched_at: "2027-01-05T00:00:00.000Z" })}\n`;
    store.files.set("ast_spec.jsonl", first);
    await updatePrices(input);
    const after = store.files.get("ast_spec.jsonl") ?? "";
    expect(after.startsWith(first)).toBe(true);
    expect(after.split("\n").filter(Boolean)).toHaveLength(2);
  });

  it("writes the declared currency, never the currency of the asset", async () => {
    const { store, input } = setup();
    store.files.set(
      "symbols.json",
      symbolsFile({ ast_spec: { currency: "GBX", eodhd: "SPEC.LSE" } }),
    );
    await updatePrices(input);
    expect(readCloseFile("ast_spec", store.files.get("ast_spec.jsonl") ?? "")[0]?.currency).toBe(
      "GBX",
    );
  });

  it("reports the sources over the threshold of consecutive failures", async () => {
    const { store, input } = setup(
      () => ({ ok: false, kind: "unavailable" }),
      () => ({ ok: false, kind: "invalid_response" }),
    );
    store.files.set("config.json", '{"failure_threshold":2}');
    const report = await updatePrices(input);
    expect(report.failing).toEqual(["eodhd", "alpha_vantage"]);
  });
});
