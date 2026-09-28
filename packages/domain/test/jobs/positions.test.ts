// Feature 016, E4 (plan §8; data-model §4): `positions.json` of the monthly
// dump — the valued projection, readable without the application. The two
// books apart and never added up (constitution III), amounts as decimal
// strings (ADR-0005), and a position without a price said as such, never as
// a zero (constitution V).

import { describe, expect, it } from "vitest";
import { positionsDocument, serializePositions } from "../../src/jobs/positions.js";
import { Decimal } from "../../src/money/decimal.js";
import { Money } from "../../src/money/money.js";
import { Quantity } from "../../src/money/quantity.js";
import type { ExternalPrices } from "../../src/projections/prices.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { settingsAt } from "../../src/projections/settings-at.js";
import type { LedgerState } from "../../src/projections/state.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const ledger = () => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.asset("ast_money", { asset_class: "fixed_income", isin: "XX0000000001" });
  b.settings(
    mergeSettings(DEFAULT_SETTINGS, {
      target_weights: { ast_world: "60", ast_bonds: "30", ast_money: "10" },
    }),
  );
  b.deposit({ account_id: "acc_etf", amount: "500", value_date: "2026-08-31" });
  b.buy({
    account_id: "acc_etf",
    asset_id: "ast_money",
    quantity: "4",
    unit_price: "100",
    trade_date: "2026-09-01",
  });
  b.valuation({
    account_id: "acc_etf",
    asset_id: "ast_money",
    date: "2026-09-30",
    quantity: "4",
    unit_value: "101.5",
  });
  b.deposit({ account_id: "acc_fund", amount: "10000", value_date: "2026-08-31" });
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "6",
    unit_price: "1000",
    trade_date: "2026-09-01",
  });
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_bonds",
    quantity: "3",
    unit_price: "100",
    trade_date: "2026-09-01",
  });
  b.valuation({
    account_id: "acc_fund",
    asset_id: "ast_world",
    date: "2026-09-30",
    quantity: "6",
    unit_value: "1100",
  });
  b.deposit({
    account_id: "acc_bucket",
    amount: "200",
    currency: "USD",
    fx_rate: "1.25",
    value_date: "2026-08-31",
  });
  b.thesisOpened({ thesis_id: "th_1" });
  b.buy({
    thesis_id: "th_1",
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    quantity: "2",
    unit_price: "50",
    currency: "USD",
    fx_rate: "1.25",
    trade_date: "2026-09-01",
  });
  b.valuation({
    account_id: "acc_bucket",
    asset_id: "ast_spec",
    date: "2026-09-30",
    quantity: "2",
    unit_value: "60",
    currency: "USD",
    fx_rate: "1.25",
  });
  return b.build();
};

const documentOf = (
  options: { external?: ExternalPrices; change?: (state: LedgerState) => void } = {},
) => {
  const events = ledger();
  const state = projectLedger(events, { asOf: "2026-10-01" });
  options.change?.(state);
  return positionsDocument({
    state,
    settings: settingsAt(state, "2026-10-01").settings,
    date: "2026-10-01",
    ...(options.external === undefined ? {} : { external: options.external }),
    generatedAt: "2026-10-01T01:15:04.000Z",
    ledger: { sha256: "c".repeat(64), lines: events.length },
  });
};

describe("positions.json of the monthly dump (E4)", () => {
  it("values each position of each book apart, with its price and its cost, in decimal strings", () => {
    const document = documentOf();
    expect(document).toEqual({
      positions_format: 1,
      as_of: "2026-10-01",
      generated_at: "2026-10-01T01:15:04.000Z",
      ledger: { sha256: "c".repeat(64), lines: 20 },
      note: "Informativo. Valores con el último precio conocido; nunca una cifra fiscal.",
      core: [
        {
          account_id: "acc_etf",
          asset_id: "ast_money",
          isin: "XX0000000001",
          name: "ast_money",
          asset_class: "fixed_income",
          quantity: "4",
          cost_eur: "400.00",
          value_eur: "406.00",
          price: { date: "2026-09-30", source: "manual", approximation: false },
        },
        {
          account_id: "acc_fund",
          asset_id: "ast_bonds",
          name: "ast_bonds",
          asset_class: "fixed_income",
          quantity: "3",
          cost_eur: "300.00",
          value_eur: null,
          price: { source: "none" },
        },
        {
          account_id: "acc_fund",
          asset_id: "ast_world",
          name: "ast_world",
          asset_class: "equity",
          quantity: "6",
          cost_eur: "6000.00",
          value_eur: "6600.00",
          price: { date: "2026-09-30", source: "manual", approximation: false },
        },
      ],
      bucket: [
        {
          account_id: "acc_bucket",
          asset_id: "ast_spec",
          name: "ast_spec",
          quantity: "2",
          cost_eur: "80.00",
          value_eur: "96.00",
          price: { date: "2026-09-30", source: "manual", approximation: false },
        },
      ],
      cash: [
        {
          account_id: "acc_bucket",
          book: "bucket",
          currency: "USD",
          amount: "100.00",
          value_eur: "80.00",
        },
        {
          account_id: "acc_etf",
          book: "core",
          currency: "EUR",
          amount: "100.00",
          value_eur: "100.00",
        },
        {
          account_id: "acc_fund",
          book: "core",
          currency: "EUR",
          amount: "3700.00",
          value_eur: "3700.00",
        },
      ],
      totals: {
        core: { eur: "7006.00", partial: true },
        bucket: { eur: "96.00", partial: false },
        cash: { eur: "3880.00", partial: false },
      },
      // Bonds have no price: the core total is what does have one, and says so.
      warnings: ["partial_core_total", "partial_net_worth"],
    });
  });

  it("says the source of a close of the cloud, and an approximation as such", () => {
    const external: ExternalPrices = {
      at: (assetId, date) =>
        assetId === "ast_bonds"
          ? {
              date: "2026-09-30" <= date ? "2026-09-30" : date,
              unit_value: Decimal.parse("110"),
              currency: "EUR",
              fx_rate: Decimal.ONE,
              source: "eodhd",
              approximate: true,
            }
          : undefined,
    };
    const document = documentOf({ external });
    expect(document.core.find((row) => row.asset_id === "ast_bonds")).toMatchObject({
      value_eur: "330.00",
      price: { date: "2026-09-30", source: "eodhd", approximation: true },
    });
    expect(document.totals.core).toEqual({ eur: "7336.00", partial: false });
  });

  it("says a position with no open lots behind it without a cost, never a zero", () => {
    // The shape `integrity` reports as `lots_mismatch`: the dump still writes it.
    const document = documentOf({
      change: (state) => {
        state.positions.set("acc_fund|ast_gold", Quantity.parse("1"));
        state.cash.set("acc_fund|USD", Money.parse("50", "USD"));
      },
    });
    // Two currencies of one account: by currency.
    expect(
      document.cash
        .filter((row) => row.account_id === "acc_fund")
        .map((row) => [row.currency, row.amount, row.value_eur]),
    ).toEqual([
      ["EUR", "3700.00", "3700.00"],
      ["USD", "50.00", "40.00"],
    ]);
    expect(document.core.find((row) => row.asset_id === "ast_gold")).toEqual({
      account_id: "acc_fund",
      asset_id: "ast_gold",
      name: "ast_gold",
      asset_class: "gold",
      quantity: "1",
      cost_eur: null,
      value_eur: null,
      price: { source: "none" },
    });
  });

  it("is written to be read by hand: indented, one closing line, and never a total of both books", () => {
    const text = serializePositions(documentOf());
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "positions_format": 1,\n');
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(documentOf())));
    expect(text).not.toMatch(/"(total_eur|net_worth|total)"/);
  });
});
