// Cash that lowers the cost instead of selling (`cost_adjustment`): the
// compensation of an exchange under the neutrality regime (arts. 80.3 and 81.2
// LIS) and a return of share premium or contributions (arts. 25.1.e and 33.3.a
// LIRPF). Every figure is worked out by hand in the comment above it.

import { describe, expect, it } from "vitest";
import { cashBalances } from "../../src/projections/cash.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { Effect } from "../../src/schema/events.js";
import { boxesOf } from "../../src/tax/boxes/boxes.js";
import { taxYearWithChain } from "../../src/tax/year.js";
import { buy, HAND_SETTINGS, lineOf, reportOf, sell, taxBuilder, text } from "./helpers.js";

const cash = (
  amount: string,
  account = "acc_a",
  currency = "EUR",
  fx = "1",
  asset?: string,
): Effect => ({
  op: "cost_adjustment",
  ...(asset === undefined ? {} : { asset_id: asset }),
  per_account: [{ account_id: account, amount }],
  currency,
  fx_rate: fx,
  fx_rate_date: "2027-02-26",
});

const merger = (amount: string, neutrality: boolean | undefined) => {
  const b = taxBuilder(HAND_SETTINGS);
  buy(b, "stock_s", "2027-01-11", "10", "100");
  const action = b.corporateAction({
    kind: "merger",
    asset_id: "stock_s",
    effective_date: "2027-03-01",
    ...(neutrality === undefined ? {} : { neutrality_regime: neutrality }),
    effects: [
      { op: "convert", to_asset_id: "stock_t", ratio: "1/2" },
      cash(amount, "acc_a", "EUR", "1", "stock_t"),
    ],
  });
  return { b, action };
};

describe("the cash of a merger under the neutrality regime (H1)", () => {
  // 10 S bought for 1,000 become 5 T and 10 € in cash. Under the regime the
  // cash lowers the value of what is received: no gain in 2027, and the 5 T
  // cost 1,000 − 10 = 990. Sold in 2028 at 200: 1,000 − 990 = +10.
  it("realizes nothing in the year of the exchange and lowers the cost of what is received", () => {
    const { b, action } = merger("10", true);
    sell(b, "stock_t", "2028-05-10", "5", "200");
    const events = b.build();
    const state = projectLedger(events);
    const lots = state.lots.get("stock_t")?.closed ?? [];
    expect(lots.map((lot) => text(lot.original_cost_eur))).toEqual(["1000"]);
    expect(reportOf(events, 2027).capital_gains.lines).toEqual([]);
    const report = reportOf(events, 2028);
    const line = report.capital_gains.lines[0];
    expect(text(line?.cost_eur)).toBe("990");
    expect(text(line?.computable_eur_rounded)).toBe("10");
    expect(line?.criteria).toContain("13:cost_adjustment");
    // The cash came in: −1,000 + 10 + 1,000 in the account.
    expect(cashBalances(state).map((row) => [row.account_id, text(row.balance)])).toEqual([
      ["acc_a", "10"],
    ]);
    expect(action.neutrality_regime).toBe(true);
  });

  // Already holding 2 T bought at 150 (300): the cash compensates what the
  // merger handed over, so only the 5 new T go down to 990. Selling the 7 at
  // 200: 1,400 − (300 + 990) = +110.
  it("lowers only the lots the merger handed over, not the destination already held", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_t", "2027-01-04", "2", "150");
    buy(b, "stock_s", "2027-01-11", "10", "100");
    b.corporateAction({
      kind: "merger",
      asset_id: "stock_s",
      effective_date: "2027-03-01",
      neutrality_regime: true,
      effects: [
        { op: "convert", to_asset_id: "stock_t", ratio: "1/2" },
        cash("10", "acc_a", "EUR", "1", "stock_t"),
      ],
    });
    const sale = sell(b, "stock_t", "2028-05-10", "7", "200");
    const line = lineOf(reportOf(b.build(), 2028), sale.id);
    expect(text(line.cost_eur)).toBe("1290");
    expect(text(line.computable_eur_rounded)).toBe("110");
  });

  it("is refused without the regime said: the cash would be proceeds of a taxable swap", () => {
    for (const neutrality of [undefined, false]) {
      const { b } = merger("10", neutrality);
      const state = projectLedger(b.build(), { collectErrors: true });
      expect(state.invalid.map((entry) => entry.error.code)).toEqual([
        "cost_adjustment_requires_neutrality",
      ]);
    }
  });

  it("is refused when the cash exceeds the cost: the law only says the value goes down", () => {
    const { b } = merger("1000.01", true);
    const state = projectLedger(b.build(), { collectErrors: true });
    expect(state.invalid.map((entry) => entry.error.code)).toEqual([
      "cost_adjustment_exceeds_cost",
    ]);
    // Rolled back whole: S is still there, T never appeared, no cash came in.
    expect(state.lots.get("stock_s")?.open.map((lot) => lot.quantity.toString())).toEqual(["10"]);
    expect(state.lots.get("stock_t")?.open ?? []).toEqual([]);
  });
});

describe("a return of share premium or contributions (H2)", () => {
  // Lot 1: 10 S at 10 (100). Lot 2: 10 S at 2 (20). 3 € per share, 60 €, by
  // units 30 to each lot. Lot 1 goes down to 70; lot 2 to zero, and the 10 €
  // left over are movable capital income in box 0029 (art. 25.1.e).
  // Selling the 20 at 10 in 2028: 200 − (70 + 0) = +130.
  const ledger = () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2027-01-11", "10", "10");
    buy(b, "stock_s", "2027-02-01", "10", "2");
    const action = b.corporateAction({
      kind: "capital_return",
      asset_id: "stock_s",
      effective_date: "2027-06-01",
      effects: [cash("60")],
    });
    const sale = sell(b, "stock_s", "2028-05-10", "20", "10");
    return { events: b.build(), action, sale };
  };

  it("lowers each lot by units down to zero and declares the excess as a dividend", () => {
    const { events, action } = ledger();
    const report = reportOf(events, 2027);
    expect(report.capital_gains.lines).toEqual([]);
    expect(
      report.movable_capital.dividends.map((line) => [line.kind, text(line.gross_eur_rounded)]),
    ).toEqual([["capital_return", "10"]]);
    expect(report.movable_capital.dividends[0]?.criteria).toContain("26");
    expect(report.withholdings.lines).toEqual([]);
    const { report: full, chain } = taxYearWithChain(events, 2027, { today: "2035-01-01" });
    const box = boxesOf(full, chain).entries.find((entry) => entry.concept === "rcm.dividends");
    expect(text(box?.exact_eur)).toBe("10");
    const state = projectLedger(events);
    expect(state.income.map((entry) => entry.event_id)).toEqual([action.id]);
  });

  it("leaves the lowered cost for the sale", () => {
    const { events, sale } = ledger();
    const line = lineOf(reportOf(events, 2028), sale.id);
    expect(text(line.cost_eur)).toBe("70");
    expect(text(line.computable_eur_rounded)).toBe("130");
    expect(line.criteria).toContain("26");
  });

  // 60 USD at 1.2 USD/EUR = 50 €, 25 € to each lot; lot 2 (20 €) leaves 5 €
  // over. The excess keeps its currency: 5/50 of the 60 USD received, 6 USD.
  it("keeps the currency of the cash in the income it declares", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2027-01-11", "10", "10");
    buy(b, "stock_s", "2027-02-01", "10", "2");
    b.corporateAction({
      kind: "capital_return",
      asset_id: "stock_s",
      effective_date: "2027-06-01",
      effects: [cash("60", "acc_a", "USD", "1.2")],
    });
    const [line] = reportOf(b.build(), 2027).movable_capital.dividends;
    expect([text(line?.gross.amount), line?.gross.amount.currency, line?.gross.fx_rate]).toEqual([
      "6",
      "USD",
      "1.2",
    ]);
    expect(text(line?.gross_eur_rounded)).toBe("5");
  });

  it("is refused on a fund: in a collective investment undertaking the law is another (art. 94.1)", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "fund_f", "2027-01-11", "10", "10");
    b.corporateAction({
      kind: "capital_return",
      asset_id: "fund_f",
      effective_date: "2027-06-01",
      effects: [cash("6")],
    });
    const state = projectLedger(b.build(), { collectErrors: true });
    expect(state.invalid.map((entry) => entry.error.code)).toEqual(["capital_return_needs_stock"]);
  });

  // Art. 25.1.e LIRPF lowers the cost "hasta su anulación" only for shares of
  // an EU regulated market; for the rest the premium is income up to the
  // difference in equity, which needs a figure Atlas does not hold.
  it.each([
    ["outside the EU", "XNYS", "not_eu"],
    ["with no market written", undefined, "market_missing"],
    ["with a market Atlas does not know", "XXXX", "market_unknown"],
    ["with a blank market", " ", "market_missing"],
  ])("is refused on a share %s (art. 25.1.e)", (_name, market, reason) => {
    const b = taxBuilder(HAND_SETTINGS);
    b.asset("stock_u", {
      asset_type: "stock",
      transferable: false,
      ...(market === undefined ? {} : { market }),
    });
    buy(b, "stock_u", "2027-01-11", "10", "10");
    b.corporateAction({
      kind: "capital_return",
      asset_id: "stock_u",
      effective_date: "2027-06-01",
      effects: [cash("30")],
    });
    const state = projectLedger(b.build(), { collectErrors: true });
    expect(state.invalid.map((entry) => [entry.error.code, entry.error.details.reason])).toEqual([
      ["capital_return_needs_eu_listed", reason],
    ]);
    expect(state.lots.get("stock_u")?.open.map((lot) => text(lot.cost_eur))).toEqual(["100"]);
  });

  // The FIFO is global, so the cash of acc_a lowers the lots bought from acc_b
  // too: a return that names only some holders is likely a mistake.
  it("warns when it does not name every account holding the asset", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2027-01-11", "10", "10");
    b.buy({
      account_id: "acc_b",
      asset_id: "stock_s",
      value_date: "2027-02-01",
      quantity: "10",
      unit_price: "10",
    });
    const action = b.corporateAction({
      kind: "capital_return",
      asset_id: "stock_s",
      effective_date: "2027-06-01",
      effects: [cash("30")],
    });
    const warnings = projectLedger(b.build()).warnings.filter(
      (entry) => entry.code === "capital_return_partial_accounts",
    );
    expect(warnings.map((entry) => [entry.event_id, entry.details])).toEqual([
      [action.id, { asset_id: "stock_s", accounts: ["acc_b"] }],
    ]);
  });

  it("is refused for an account that holds nothing of the asset", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2027-01-11", "10", "10");
    b.corporateAction({
      kind: "capital_return",
      asset_id: "stock_s",
      effective_date: "2027-06-01",
      effects: [cash("60", "acc_b")],
    });
    const state = projectLedger(b.build(), { collectErrors: true });
    expect(state.invalid.map((entry) => entry.error.code)).toEqual(["insufficient_position"]);
    expect(state.income).toEqual([]);
    // acc_a was not named, but the refused event leaves no warning behind.
    expect(state.warnings.map((entry) => entry.code)).not.toContain(
      "capital_return_partial_accounts",
    );
  });
});

describe("a spin-off with fractions sold and cash (art. 81.2 LIS)", () => {
  // 10 S for 1,000 €; a spin-off hands over 3.5 T carrying 40 % of the cost
  // (400). 0.5 T are sold at 200 € and 30 € compensate: 400 − 30 = 370 for
  // 3.5 T, the fraction costs 370 / 7 = 52.86 and gains 47.14; 317.14 left.
  const carve = {
    op: "carve_out" as const,
    to_asset_id: "stock_t",
    ratio: "0.35",
    cost_share: "0.4",
  };
  const sold = {
    op: "forced_sale" as const,
    asset_id: "stock_t",
    per_account: [{ account_id: "acc_a", quantity: "0.5" }],
    unit_price: "200",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2027-02-26",
  };
  const compensation = cash("30", "acc_a", "EUR", "1", "stock_t");

  it.each([
    ["the fractions first", [carve, sold, compensation]],
    ["the cash first", [carve, compensation, sold]],
  ] as const)("gives the same figures with %s", (_name, effects) => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2027-01-11", "10", "100");
    b.corporateAction({
      kind: "spin_off",
      asset_id: "stock_s",
      effective_date: "2027-03-01",
      neutrality_regime: true,
      effects: [...effects],
    });
    const events = b.build();
    const [line] = reportOf(events, 2027).capital_gains.lines;
    expect(line?.computable_eur_rounded.centsText()).toBe("47.14");
    const open = projectLedger(events).lots.get("stock_t")?.open ?? [];
    expect(open.map((lot) => lot.cost_eur.roundToCents().centsText())).toEqual(["317.14"]);
  });
});

describe("cash in a foreign currency (criterion #4, first in the currency)", () => {
  // 10 S at 100 USD at 1 USD/EUR: 1,000 USD, 1,000 €. A return of 100 USD at
  // 2 USD/EUR (50 €). The lot keeps 900 USD and 950 €. Sold in 2028 at 100 USD
  // at 2: (1,000 − 900) / 2 = 50 €.
  const ledger = (currency: string, amount: string) => {
    const b = taxBuilder(HAND_SETTINGS);
    const usd = { currency: "USD", fx_rate: "1" } as const;
    b.buy({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2027-01-11",
      quantity: "10",
      unit_price: "100",
      ...usd,
    });
    b.corporateAction({
      kind: "capital_return",
      asset_id: "stock_s",
      effective_date: "2027-06-01",
      effects: [cash(amount, "acc_a", currency, currency === "USD" ? "2" : "1")],
    });
    const sale = b.sell({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2028-05-10",
      quantity: "10",
      unit_price: "100",
      currency: "USD",
      fx_rate: "2",
    });
    return { events: b.build(), sale };
  };

  it("lowers the cost in the currency by the amount in that currency", () => {
    const { events, sale } = ledger("USD", "100");
    const line = lineOf(reportOf(events, 2028), sale.id);
    expect(text(line.computable_eur_rounded)).toBe("50");
    expect(projectLedger(events).warnings.map((entry) => entry.code)).not.toContain(
      "cost_adjustment_currency_mismatch",
    );
  });

  // 1,200 USD at 2 on a lot of 1,000 USD: the lot goes to zero and the 200 USD
  // over (100 €) are income. 600 USD at 0.5 (1,200 €) on the same lot: 400 USD
  // left, and its cost in euros stops at zero; sold at 1,000 USD at 2 it gains
  // (1,000 − 400) / 2 = 300 € first in the currency.
  it.each([
    ["1200", "2", "0", "100", undefined],
    ["600", "0.5", "400", undefined, "300"],
  ])("never lowers a lot below zero: %s USD at %s", (amount, rate, cost, income, gain) => {
    const b = taxBuilder(HAND_SETTINGS);
    b.buy({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2027-01-11",
      quantity: "10",
      unit_price: "100",
      currency: "USD",
      fx_rate: "1",
    });
    b.corporateAction({
      kind: "capital_return",
      asset_id: "stock_s",
      effective_date: "2027-06-01",
      effects: [cash(amount, "acc_a", "USD", rate)],
    });
    const before = projectLedger(b.build());
    const [lot] = before.lots.get("stock_s")?.open ?? [];
    expect([text(lot?.cost), text(lot?.cost_eur)]).toEqual([cost, "0"]);
    const dividends = reportOf(b.build(), 2027).movable_capital.dividends;
    expect(dividends.map((line) => text(line.gross_eur_rounded))).toEqual(
      income === undefined ? [] : [income],
    );
    if (gain !== undefined) {
      const sale = b.sell({
        account_id: "acc_a",
        asset_id: "stock_s",
        value_date: "2028-05-10",
        quantity: "10",
        unit_price: "100",
        currency: "USD",
        fx_rate: "2",
      });
      expect(text(lineOf(reportOf(b.build(), 2028), sale.id).computable_eur_rounded)).toBe(gain);
    }
  });

  // 50 € on a lot in USD: no source says at which rate euros lower a cost in
  // dollars. The lot splits by the factor in euros, as before (−5 %), and the
  // output says the criterion is open: (1,000 − 950) / 2 = 25 €.
  it("warns when the cash is in another currency than the lot", () => {
    const { events, sale } = ledger("EUR", "50");
    const line = lineOf(reportOf(events, 2028), sale.id);
    expect(text(line.computable_eur_rounded)).toBe("25");
    const warnings = projectLedger(events).warnings.filter(
      (entry) => entry.code === "cost_adjustment_currency_mismatch",
    );
    expect(warnings.map((entry) => entry.details)).toEqual([
      { asset_id: "stock_s", currency: "EUR", lot_currency: "USD" },
    ]);
  });
});

describe("an exchange with fractions sold and cash (the order of the effects)", () => {
  // 10 S for 1,000 € become 3.5 T; 0.5 T are sold at 200 € and 30 € compensate
  // the exchange. The cash lowers what is received first (art. 80.3 LIS):
  // 1,000 − 30 = 970 for 3.5 T. The fraction costs 970 / 7 = 138.57 and loses
  // 100 − 138.57 = −38.57; the 3 T left keep 831.43.
  const sold = {
    op: "forced_sale" as const,
    asset_id: "stock_t",
    per_account: [{ account_id: "acc_a", quantity: "0.5" }],
    unit_price: "200",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2027-02-26",
  };
  const convert = { op: "convert" as const, to_asset_id: "stock_t", ratio: "0.35" };
  const compensation = cash("30", "acc_a", "EUR", "1", "stock_t");

  it.each([
    ["merger", [convert, sold, compensation]],
    ["merger", [convert, compensation, sold]],
    ["issuer_restructuring", [convert, sold, compensation]],
    ["issuer_restructuring", [convert, compensation, sold]],
  ] as const)("gives the same figures in a %s whatever the order", (kind, effects) => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2027-01-11", "10", "100");
    b.corporateAction({
      kind,
      asset_id: "stock_s",
      effective_date: "2027-03-01",
      neutrality_regime: true,
      effects: [...effects],
    });
    const events = b.build();
    const [line] = reportOf(events, 2027).capital_gains.lines;
    expect(line?.computable_eur_rounded.centsText()).toBe("-38.57");
    const open = projectLedger(events).lots.get("stock_t")?.open ?? [];
    expect(open.map((lot) => lot.cost_eur.roundToCents().centsText())).toEqual(["831.43"]);
  });
});
