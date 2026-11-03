import { describe, expect, it } from "vitest";
import { exposure } from "../../src/projections/exposure.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { coreWeights } from "../../src/projections/weights.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const DATE = "2027-12-31";
const settings: Settings = {
  ...DEFAULT_SETTINGS,
  target_weights: { ast_world: "50", ast_bonds: "40", ast_gold: "10" },
};

/** 600 in the world fund, 400 in bonds, optionally 100 in gold. */
const ledger = (options: { gold?: boolean; priced?: boolean } = {}): LedgerEvent[] => {
  const b = new LedgerBuilder();
  catalogue(b);
  const buy = (account_id: string, asset_id: string, quantity: string) =>
    b.buy({ account_id, asset_id, quantity, unit_price: "100" });
  buy("acc_fund", "ast_world", "6");
  buy("acc_fund", "ast_bonds", "4");
  const valued = ["ast_world", "ast_bonds"];
  if (options.gold) {
    buy("acc_etf", "ast_gold", "1");
  }
  for (const asset_id of options.priced === false ? ["ast_world"] : valued) {
    b.valuation({ account_id: "acc_fund", asset_id, date: DATE, unit_value: "100" });
  }
  if (options.gold) {
    b.valuation({ account_id: "acc_etf", asset_id: "ast_gold", date: DATE, unit_value: "100" });
  }
  return b.build();
};

const run = (events: LedgerEvent[], exposures: Parameters<typeof exposure>[1]) =>
  exposure(coreWeights(projectLedger(events), DATE, settings), exposures);

const shares = (dimension: { shares?: { key: string; pct: { toString(): string } }[] }) =>
  dimension.shares?.map((share) => `${share.key} ${share.pct.toString()}`);

const declared = {
  ast_world: { currency: { USD: "60", EUR: "40" }, region: { north_america: "60", europe: "40" } },
  ast_bonds: { currency: { EUR: "100" }, region: { europe: "100" } },
};

describe("exposure", () => {
  it("splits the value of the core by currency and region, largest first", () => {
    const result = run(ledger(), declared);
    expect(result.total_eur.amount.toString()).toBe("1000");
    expect(shares(result.currency)).toEqual(["EUR 64", "USD 36"]);
    expect(shares(result.region)).toEqual(["europe 64", "north_america 36"]);
    expect(result.currency.missing_assets).toEqual([]);
  });

  it("orders equal shares by key", () => {
    const result = run(ledger(), {
      ast_world: { currency: { USD: "50", JPY: "50" }, region: { x: "100" } },
      ast_bonds: declared.ast_bonds,
    });
    expect(shares(result.currency)).toEqual(["EUR 40", "JPY 30", "USD 30"]);
  });

  it("puts gold and crypto in USD unless the owner says otherwise, and says it did", () => {
    const events = ledger({ gold: true });
    const byDefault = run(events, declared);
    expect(byDefault.currency.defaulted).toEqual(["ast_gold"]);
    expect(
      byDefault.currency.shares?.find((s) => s.key === "USD")?.value_eur.amount.toString(),
    ).toBe("460");
    // Region has no default: gold with no declared region leaves the region without data.
    expect(byDefault.region.shares).toBeUndefined();
    expect(byDefault.region.missing_assets).toEqual(["ast_gold"]);
    const own = run(events, { ...declared, ast_gold: { currency: { EUR: "100" } } });
    expect(own.currency.defaulted).toEqual([]);
    expect(own.currency.shares?.find((s) => s.key === "USD")?.value_eur.amount.toString()).toBe(
      "360",
    );
  });

  it("gives no breakdown, and lists the assets, when one with value declares nothing", () => {
    const result = run(ledger(), { ast_world: declared.ast_world });
    expect(result.currency.shares).toBeUndefined();
    expect(result.currency.missing_assets).toEqual(["ast_bonds"]);
    expect(result.region.missing_assets).toEqual(["ast_bonds"]);
  });

  it("ignores an asset with no value left, even without a declared exposure", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "6", unit_price: "100" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_bonds", quantity: "4", unit_price: "100" });
    b.sell({ account_id: "acc_fund", asset_id: "ast_bonds", quantity: "4", unit_price: "100" });
    b.valuation({ account_id: "acc_fund", asset_id: "ast_world", date: DATE, unit_value: "100" });
    b.valuation({ account_id: "acc_fund", asset_id: "ast_bonds", date: DATE, unit_value: "100" });
    const result = run(b.build(), { ast_world: declared.ast_world });
    expect(result.currency.missing_assets).toEqual([]);
    expect(shares(result.currency)).toEqual(["USD 60", "EUR 40"]);
  });

  it("checks a declared split even for an asset with no value", () => {
    expect(() => run(ledger(), { ...declared, ast_spec: { currency: { USD: "60" } } })).toThrow(
      expect.objectContaining({
        code: "invalid_exposure",
        details: { reason: "total", asset_id: "ast_spec", dimension: "currency", total: "60" },
      }),
    );
  });

  it("gives no figure with an unpriced asset held", () => {
    const result = run(ledger({ priced: false }), declared);
    expect(result.gap).toBe("partial");
    expect(result.currency.shares).toBeUndefined();
  });

  it("refuses a split that is not valid, with the reason", () => {
    expect(() => run(ledger(), { ...declared, ast_bonds: { currency: {} } })).toThrow(
      expect.objectContaining({ code: "invalid_exposure" }),
    );
  });
});
