import { describe, expect, it } from "vitest";
import { exposure, type Split } from "../../src/projections/exposure.js";
import type { IndexTables } from "../../src/projections/index-profiles.js";
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

  describe("the defaults of an index", () => {
    const profile = (key: string, name: string, currency: Split, region: Split) => ({
      key,
      name,
      currency,
      region,
      via: { isin: "IE0000000002", name: "ETF Mundo" },
      as_of: "2026-10-31",
      checked: "2026-11-03",
    });
    const tables: IndexTables = {
      profiles: {
        // A definition: no fund and no date.
        gold: {
          key: "gold",
          name: "Oro",
          currency: { USD: "100" },
          region: { global: "100" },
          checked: "2026-11-03",
        },
        world: profile(
          "world",
          "Índice Mundo",
          { USD: "70", EUR: "30" },
          { north_america: "70", europe: "30" },
        ),
        euro_bonds: profile("euro_bonds", "Bonos euro", { EUR: "100" }, { europe: "100" }),
      },
      funds: {
        IE0000000001: {
          isin: "IE0000000001",
          name: "Fondo Mundo",
          index: "world",
          as_of: "2026-10-31",
          checked: "2026-11-03",
        },
      },
      byClass: { gold: "gold" },
    };
    const known = new Map([["ast_world", { isin: "IE0000000001" }]]);
    const withDefaults = (exposures: Parameters<typeof exposure>[1], catalogue = known) =>
      exposure(
        coreWeights(projectLedger(ledger({ gold: true })), DATE, settings),
        exposures,
        catalogue,
        tables,
      );

    it("proposes the index of a known fund and of the class, marks them, and counts them", () => {
      const result = withDefaults({ ast_bonds: { index: "euro_bonds" } });
      expect(result.currency.defaulted).toEqual(["ast_world", "ast_bonds", "ast_gold"]);
      expect(result.counts).toEqual({ owner: 0, default: 3, none: 0 });
      const labels = Object.fromEntries(result.currency.assets.map((a) => [a.asset_id, a.index]));
      expect(labels).toEqual({
        ast_world: {
          key: "world",
          name: "Índice Mundo",
          as_of: "2026-10-31",
          via: "ETF Mundo",
          proposed: true,
        },
        ast_bonds: {
          key: "euro_bonds",
          name: "Bonos euro",
          as_of: "2026-10-31",
          via: "ETF Mundo",
          proposed: false,
        },
        ast_gold: { key: "gold", name: "Oro", proposed: true },
      });
      // 600 world (70/30), 400 bonds (EUR), 100 gold (USD): USD 420 + 100, EUR 180 + 400.
      expect(shares(result.currency)).toEqual(
        ["EUR 52.7272727273", "USD 47.2727272727"].map((x) => x),
      );
    });

    it("lets the owner's own split win over the default, in one dimension at a time", () => {
      const result = withDefaults({ ast_world: { currency: { JPY: "100" } } });
      expect(result.currency.assets.find((a) => a.asset_id === "ast_world")).toEqual({
        asset_id: "ast_world",
        state: "owner",
      });
      expect(result.region.assets.find((a) => a.asset_id === "ast_world")?.state).toBe("default");
      expect(result.currency.defaulted).not.toContain("ast_world");
    });

    it("says no data, and lists the assets, for what has no proposal: the rest is not guessed", () => {
      const result = withDefaults({});
      // ast_bonds has no ISIN in the table, no index chosen and no class default.
      expect(result.currency.shares).toBeUndefined();
      expect(result.currency.missing_assets).toEqual(["ast_bonds"]);
      expect(result.currency.assets.find((a) => a.asset_id === "ast_bonds")).toEqual({
        asset_id: "ast_bonds",
        state: "none",
      });
      expect(result.counts).toEqual({ owner: 0, default: 2, none: 1 });
      // An index key that is no profile (removed, mistyped) is no proposal either.
      expect(withDefaults({ ast_bonds: { index: "gone" } }).counts.none).toBe(1);
    });

    it("counts an asset as the owner's only when every dimension is", () => {
      const result = withDefaults({
        ast_world: { currency: { USD: "100" }, region: { north_america: "100" } },
        ast_bonds: declared.ast_bonds,
      });
      expect(result.counts).toEqual({ owner: 2, default: 1, none: 0 });
    });
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
