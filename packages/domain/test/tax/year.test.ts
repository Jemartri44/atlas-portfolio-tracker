// The tax year as a whole (feature 009): the year a disposal falls in, the
// carry-forward and its anchor, the refusals, the doubtful criteria and the
// notes. The wash-sale rule has its own file.

import { describe, expect, it } from "vitest";
import type { DomainError } from "../../src/errors.js";
import { Money } from "../../src/money/money.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { taxReportJson } from "../../src/tax/json.js";
import { taxYear } from "../../src/tax/year.js";
import { buy, lineOf, reportOf, sell, taxBuilder, text, transfer } from "./helpers.js";

const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return (error as DomainError).code;
  }
  return "no error";
};

describe("the year a disposal belongs to (criterion #1)", () => {
  it("a sale on 30 December settled on 2 January: a stock in the first year, a fund in the second", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-06-01", "10", "100");
    buy(b, "fund_f", "2027-06-01", "10", "100");
    const stock = b.sell({
      account_id: "acc_a",
      asset_id: "stock_s",
      trade_date: "2027-12-30",
      value_date: "2028-01-03",
      quantity: "10",
      unit_price: "110",
      fx_rate_date: "2027-12-30",
    });
    const fund = b.sell({
      account_id: "acc_a",
      asset_id: "fund_f",
      trade_date: "2027-12-30",
      value_date: "2028-01-03",
      quantity: "10",
      unit_price: "110",
      fx_rate_date: "2028-01-03",
    });
    const y2027 = reportOf(b.build(), 2027);
    const y2028 = reportOf(b.build(), 2028);
    expect(y2027.capital_gains.lines.map((l) => l.event_id)).toEqual([stock.id]);
    expect(y2028.capital_gains.lines.map((l) => l.event_id)).toEqual([fund.id]);
  });
});

describe("the carry-forward", () => {
  it("a loss of 2027 with no gains until 2032 expires at the end of 2031, and the report says so", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "90");
    buy(b, "stock_t", "2027-09-01", "10", "100");
    sell(b, "stock_t", "2032-06-01", "10", "120");
    const y2030 = reportOf(b.build(), 2030);
    expect(
      y2030.compensation.pending.map((p) => [p.origin_year, text(p.amount_eur), p.expires_after]),
    ).toEqual([[2027, "-100", 2031]]);
    const y2031 = reportOf(b.build(), 2031);
    expect(y2031.compensation.expired.map((p) => [p.origin_year, text(p.amount_eur)])).toEqual([
      [2027, "-100"],
    ]);
    expect(y2031.notes.find((n) => n.code === "tax_loss_expires")?.details).toEqual({
      origin_year: 2027,
      category: "capital_gain",
      amount_eur: "-100",
    });
    const y2032 = reportOf(b.build(), 2032);
    expect(text(y2032.base_eur)).toBe("200");
    expect(y2032.compensation.steps).toEqual([]);
  });

  it("anchors the carry-forward on what was declared and shows the difference", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "90");
    buy(b, "stock_t", "2028-01-10", "10", "100");
    sell(b, "stock_t", "2028-06-01", "10", "120");
    const filed = [
      {
        year: 2027,
        pending: [
          {
            origin_year: 2027,
            category: "capital_gain" as const,
            amount_eur: Money.parse("-60", "EUR"),
          },
        ],
      },
    ];
    const report = taxYear(b.build(), 2028, { today: "2035-01-01", filed });
    // Declared −60 instead of the computed −100: 200 − 60 = 140.
    expect(text(report.base_eur)).toBe("140");
    const anchored = taxYear(b.build(), 2027, { today: "2035-01-01", filed });
    expect(anchored.anchor?.computed.map((p) => text(p.amount_eur))).toEqual(["-100"]);
    expect(anchored.anchor?.declared.map((p) => text(p.amount_eur))).toEqual(["-60"]);
  });

  it("chains through years with no figures, and a year before the first one is simply empty", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2029-06-01", "10", "120");
    expect(text(reportOf(b.build(), 2029).base_eur)).toBe("200");
    expect(text(reportOf(b.build(), 2026).base_eur)).toBe("0");
    expect(text(reportOf(b.build(), 2028).base_eur)).toBe("0");
  });
});

describe("what the engine refuses", () => {
  it("a year before 2018, or a ledger with figures before it (A13)", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2016-01-11", "10", "100");
    sell(b, "stock_s", "2016-06-01", "10", "90");
    expect(codeOf(() => reportOf(b.build(), 2017))).toBe("tax_year_unsupported");
    expect(codeOf(() => reportOf(b.build(), 2020))).toBe("tax_year_unsupported");
    expect(codeOf(() => reportOf(taxBuilder().build(), 2020.5))).toBe("tax_year_unsupported");
  });

  it("a ledger with invalid events: the answer is what to repair (Q11)", () => {
    const b = taxBuilder();
    const oversold = sell(b, "stock_s", "2027-06-01", "10", "90");
    try {
      reportOf(b.build(), 2027);
      expect.unreachable();
    } catch (error) {
      expect((error as DomainError).code).toBe("tax_ledger_invalid");
      expect((error as DomainError).details).toMatchObject({
        count: 1,
        invalid: [{ id: oversold.id, type: "sell", code: "insufficient_position" }],
      });
    }
  });
});

describe("categories of income (ADR-0021)", () => {
  it("with the default, every disposal is a capital gain", () => {
    const b = taxBuilder();
    buy(b, "etc_e", "2027-01-11", "10", "100");
    sell(b, "etc_e", "2027-06-01", "10", "120");
    const report = reportOf(b.build(), 2027);
    expect(report.capital_gains.lines.map((l) => l.category)).toEqual(["capital_gain"]);
    expect(report.movable_capital.transmissions).toEqual([]);
  });

  it("an ETC set to movable capital goes to movable capital income and offsets as such", () => {
    const b = taxBuilder({ ...DEFAULT_SETTINGS, income_category: { etc: "movable_capital" } });
    buy(b, "etc_e", "2027-01-11", "10", "100");
    sell(b, "etc_e", "2027-06-01", "10", "80");
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-09-01", "10", "150");
    const report = reportOf(b.build(), 2027);
    expect(report.movable_capital.transmissions.map((l) => text(l.computable_eur_rounded))).toEqual(
      ["-200"],
    );
    expect(text(report.movable_capital.balance_eur)).toBe("-200");
    // −200 of movable capital against 500 of gains: at most 25 %, 125.
    expect(report.compensation.steps.map((s) => text(s.amount_eur))).toEqual(["125"]);
    expect(text(report.base_eur)).toBe("375");
  });

  it("a release of a loss of the other category is integrated where the loss came from", () => {
    const b = taxBuilder({ ...DEFAULT_SETTINGS, income_category: { etc: "movable_capital" } });
    buy(b, "etc_e", "2027-01-11", "10", "100");
    const loss = sell(b, "etc_e", "2027-02-01", "10", "90");
    buy(b, "etc_e", "2027-02-10", "10", "90");
    b.corporateAction({
      kind: "issuer_restructuring",
      asset_id: "etc_e",
      effective_date: "2027-03-01",
      effects: [{ op: "convert", to_asset_id: "fund_f", ratio: "1" }],
    });
    const sale = sell(b, "fund_f", "2027-06-01", "10", "95");
    const report = reportOf(b.build(), 2027);
    expect(text(lineOf(report, loss.id).deferred_eur)).toBe("-100");
    const line = lineOf(report, sale.id);
    expect(line.category).toBe("capital_gain");
    expect(text(line.released_eur)).toBe("0");
    expect(text(report.movable_capital.foreign_releases_eur)).toBe("-100");
    expect(text(report.movable_capital.balance_eur)).toBe("-100");
    expect(text(report.capital_gains.balance_eur)).toBe("50");
    expect(report.notes.map((n) => n.code)).toContain("tax_release_category_differs");
  });
});

describe("double taxation (#16)", () => {
  const dividend = (country: string | undefined, rates?: Record<string, string>) => {
    const b = taxBuilder({
      ...DEFAULT_SETTINGS,
      ...(rates === undefined ? {} : { treaty_withholding_pct: rates }),
    });
    buy(b, "stock_s", "2027-01-11", "10", "100");
    b.dividend({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2027-06-15",
      fx_rate_date: "2027-06-15",
      gross: "100",
      withholding_origin: "10",
      ...(country === undefined ? {} : { source_country: country }),
    });
    return reportOf(b.build(), 2027);
  };

  it("deducts all of it when the foreign tax is under the treaty limit", () => {
    const [line] = dividend("DE", { DE: "15" }).double_taxation.lines;
    expect([text(line?.deductible_eur), text(line?.not_deductible_eur)]).toEqual(["10", "0"]);
  });

  it("computes nothing for a country without a treaty rate, and says so", () => {
    const report = dividend("CH", { US: "15" });
    expect(report.double_taxation.lines[0]?.deductible_eur).toBeUndefined();
    expect(report.notes.find((n) => n.code === "tax_treaty_rate_missing")?.details).toEqual({
      country: "CH",
      foreign_tax_eur: "10",
    });
  });

  it("computes nothing for a dividend that does not say which country paid it", () => {
    const report = dividend(undefined);
    expect(report.notes.map((n) => n.code)).toContain("tax_dividend_without_country");
    expect(text(report.double_taxation.deductible_eur)).toBe("0");
  });
});

describe("income in kind and exchanges without regime", () => {
  it("records a fork's income without integrating it (#8), and tags the sale of its lots", () => {
    const b = taxBuilder();
    buy(b, "coin_c", "2027-01-11", "1", "1000");
    const fork = b.corporateAction({
      kind: "crypto_fork",
      asset_id: "coin_c",
      effective_date: "2027-03-01",
      effects: [
        {
          op: "grant",
          asset_id: "coin_d",
          per_account: [{ account_id: "acc_a", quantity: "10" }],
          unit_cost: "0",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-03-01",
          acquisition_date: "2027-03-01",
          income_eur: "50",
          income_base: "general",
        },
      ],
    });
    const sale = sell(b, "coin_d", "2027-06-01", "10", "8");
    const report = reportOf(b.build(), 2027);
    expect(report.in_kind.map((l) => [l.event_id, text(l.amount_eur), l.base, l.kind])).toEqual([
      [fork.id, "50", "general", "crypto_fork"],
    ]);
    expect(
      report.notes.find((n) => n.code === "tax_in_kind_income_not_integrated")?.details,
    ).toEqual({
      income_eur: "50",
      base: "general",
    });
    expect(lineOf(report, sale.id).criteria).toContain("8");
    expect(text(report.doubtful.find((d) => d.criterion === "8")?.exposure_eur)).toBe("50");
    expect(text(report.base_eur)).toBe("80");
  });

  it("a merger with a cash leg tags #13, and without a regime the exchange is an exposure", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    const merger = b.corporateAction({
      kind: "merger",
      asset_id: "stock_s",
      effective_date: "2027-06-01",
      effects: [
        {
          op: "forced_sale",
          per_account: [{ account_id: "acc_a", quantity: "2" }],
          unit_price: "130",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-06-01",
        },
        { op: "convert", to_asset_id: "stock_t", ratio: "1" },
      ],
    });
    const report = reportOf(b.build(), 2027);
    const line = lineOf(report, merger.id);
    expect(line.criteria).toContain("13");
    const items = report.doubtful.filter((d) => d.criterion === "13");
    expect(items.map((d) => [d.measure, text(d.exposure_eur)])).toEqual([
      ["exposure", "60"],
      ["exposure", "800"],
    ]);
  });

  it("warns when the event says there is no regime and still keeps date and cost", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    const spin = b.corporateAction({
      kind: "spin_off",
      asset_id: "stock_s",
      effective_date: "2027-06-01",
      neutrality_regime: false,
      effects: [{ op: "carve_out", to_asset_id: "stock_t", ratio: "1", cost_share: "0.2" }],
    });
    const report = reportOf(b.build(), 2027);
    expect(report.notes.find((n) => n.code === "tax_neutrality_contradiction")?.event_id).toBe(
      spin.id,
    );
    expect(report.doubtful.filter((d) => d.criterion === "7")).toEqual([]);
  });

  it("a spin-off with no word on the regime is an exposure of #7", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    b.corporateAction({
      kind: "spin_off",
      asset_id: "stock_s",
      effective_date: "2027-06-01",
      effects: [{ op: "carve_out", to_asset_id: "stock_t", ratio: "1", cost_share: "0.2" }],
    });
    const report = reportOf(b.build(), 2027);
    expect(report.doubtful.map((d) => [d.criterion, text(d.exposure_eur)])).toContainEqual([
      "7",
      "200",
    ]);
  });

  it("tags the loss of a liquidated issuer with #9", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    const liquidation = b.corporateAction({
      kind: "issuer_liquidation",
      asset_id: "stock_s",
      effective_date: "2027-06-01",
      effects: [
        {
          op: "forced_sale",
          per_account: [{ account_id: "acc_a", quantity: "all" }],
          unit_price: "0",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-06-01",
        },
      ],
    });
    expect(lineOf(reportOf(b.build(), 2027), liquidation.id).criteria).toContain("9");
  });
});

describe("the other doubtful criteria", () => {
  it("#4: the currency-first method is an exposure when a lot was bought in another currency", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    b.sell({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2027-06-01",
      quantity: "10",
      unit_price: "120",
      currency: "USD",
      fx_rate: "1.2",
    });
    const item = reportOf(b.build(), 2027).doubtful.find((d) => d.criterion === "4");
    expect(item?.measure).toBe("exposure");
    expect(item?.direction).toBe("both");
    expect(text(item?.exposure_eur)).toBe("0");
  });

  it("#5: a rate older than the fiscal date is an exposure", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    const sale = b.sell({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2027-06-07",
      fx_rate_date: "2027-06-04",
      quantity: "10",
      unit_price: "120",
    });
    const report = reportOf(b.build(), 2027);
    expect(lineOf(report, sale.id).criteria).toContain("5");
    expect(text(report.doubtful.find((d) => d.criterion === "5")?.exposure_eur)).toBe("1200");
  });

  it("#2 crypto: one year by prudence, and what two months would change", () => {
    const b = taxBuilder();
    buy(b, "coin_c", "2027-01-11", "1", "1000");
    const loss = sell(b, "coin_c", "2027-03-01", "1", "800");
    buy(b, "coin_c", "2027-08-01", "1", "800");
    const report = reportOf(b.build(), 2027);
    expect(lineOf(report, loss.id).criteria).toContain("2:crypto");
    const item = report.doubtful.find((d) => d.criterion === "2:crypto");
    expect(text(item?.base_difference_eur)).toBe("0");
    expect(text(item?.pending_difference_eur)).toBe("-200");
    expect(item?.direction).toBe("conservative");
  });

  it("#15 also counts what travelled and is still pending at the end of the year", () => {
    const b = taxBuilder();
    buy(b, "fund_f", "2027-01-11", "10", "100");
    sell(b, "fund_f", "2027-02-01", "10", "90");
    buy(b, "fund_f", "2027-03-01", "10", "90");
    transfer(b, "fund_f", "fund_g", "2027-05-03", "10", "10");
    const report = reportOf(b.build(), 2027);
    expect(report.doubtful.find((d) => d.criterion === "15")).toMatchObject({
      measure: "exposure",
      event_ids: [],
    });
    expect(text(report.doubtful.find((d) => d.criterion === "15")?.exposure_eur)).toBe("100");
  });

  it("#22: when two years compete for one balance, their order is at stake", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    sell(b, "stock_s", "2027-06-01", "10", "90");
    buy(b, "stock_t", "2028-01-11", "10", "100");
    sell(b, "stock_t", "2028-06-01", "10", "90");
    buy(b, "stock_s", "2029-01-11", "10", "100");
    sell(b, "stock_s", "2029-06-01", "10", "115");
    const report = reportOf(b.build(), 2029);
    expect(report.compensation.steps.map((s) => [s.origin_year, text(s.amount_eur)])).toEqual([
      [2027, "100"],
      [2028, "50"],
    ]);
    expect(text(report.doubtful.find((d) => d.criterion === "22")?.exposure_eur)).toBe("150");
  });

  it("an alternative reading that leaves events invalid is not quantifiable, and says why", () => {
    const b = taxBuilder();
    b.buy({
      account_id: "acc_a",
      asset_id: "fund_f",
      trade_date: "2027-01-15",
      value_date: "2027-01-18",
      quantity: "10",
      unit_price: "100",
    });
    const sale = b.sell({
      account_id: "acc_a",
      asset_id: "fund_f",
      trade_date: "2027-01-14",
      value_date: "2027-01-20",
      quantity: "10",
      unit_price: "90",
      fx_rate_date: "2027-01-14",
    });
    const report = reportOf(b.build(), 2027);
    const item = report.doubtful.find((d) => d.criterion === "1");
    expect(item).toMatchObject({
      measure: "not_quantifiable",
      event_ids: [sale.id],
      direction: "conservative",
    });
    expect(item?.reason).toBe("invalid_under_alternative");
    expect(item?.invalid_count).toBe(1);
  });
});

describe("the settings of the report", () => {
  it("says which settings came from the code, when the ledger has none", () => {
    const b = taxBuilder(null);
    buy(b, "stock_s", "2027-01-11", "10", "100");
    const report = reportOf(b.build(), 2027);
    expect(report.settings.origin).toBe("default");
    expect(report.settings.from_code).toContain("fiscal_date_rule.stock");
    expect(report.settings.from_code).toContain("loss_carryforward_years");
    expect(report.notes.map((n) => n.code)).toContain("tax_settings_default_used");
    expect(report.settings_diff).toBeUndefined();
  });

  it("compares with the settings before the last change", () => {
    const b = taxBuilder();
    b.settings({ ...DEFAULT_SETTINGS, income_category: { etc: "movable_capital" } });
    buy(b, "etc_e", "2027-01-11", "10", "100");
    const sale = sell(b, "etc_e", "2027-06-01", "10", "120");
    const report = reportOf(b.build(), 2027);
    expect(report.settings_diff?.changes).toEqual([
      { event_id: sale.id, what: "category", before: "capital_gain", after: "movable_capital" },
    ]);
    expect(text(report.settings_diff?.base_before_eur)).toBe("200");
  });

  it("compares a single change with the defaults, and lists what moved in and out of the year", () => {
    const b = taxBuilder({ ...DEFAULT_SETTINGS, fiscal_date_rule: { stock: "value_date" } });
    buy(b, "stock_s", "2027-01-11", "10", "100");
    const moved = b.sell({
      account_id: "acc_a",
      asset_id: "stock_s",
      trade_date: "2027-12-30",
      value_date: "2028-01-03",
      quantity: "5",
      unit_price: "110",
      fx_rate_date: "2027-12-30",
    });
    const kept = sell(b, "stock_s", "2027-06-01", "5", "90");
    const y2027 = reportOf(b.build(), 2027);
    expect(y2027.settings_diff?.previous_origin).toBe("default");
    expect(y2027.settings_diff?.changes).toEqual([{ event_id: moved.id, what: "left" }]);
    const y2028 = reportOf(b.build(), 2028);
    expect(y2028.settings_diff?.changes).toEqual([{ event_id: moved.id, what: "entered" }]);
    expect(kept.id).not.toBe(moved.id);
  });

  it("says when the previous settings leave events invalid", () => {
    const b = taxBuilder({ ...DEFAULT_SETTINGS, fiscal_date_rule: { fund: "trade_date" } });
    b.buy({
      account_id: "acc_a",
      asset_id: "fund_f",
      trade_date: "2027-01-12",
      value_date: "2027-01-22",
      quantity: "10",
      unit_price: "100",
    });
    b.sell({
      account_id: "acc_a",
      asset_id: "fund_f",
      trade_date: "2027-01-14",
      value_date: "2027-01-20",
      quantity: "10",
      unit_price: "110",
      fx_rate_date: "2027-01-14",
    });
    const diff = reportOf(b.build(), 2027).settings_diff;
    expect(diff?.invalid_before).toBe(1);
    expect(diff?.base_before_eur).toBeUndefined();
  });

  it("notes a computable change with the figures before and after", () => {
    const b = taxBuilder();
    b.settings({ ...DEFAULT_SETTINGS, wash_sale_window: { stock: "1y" } });
    buy(b, "stock_s", "2027-01-11", "10", "100");
    const loss = sell(b, "stock_s", "2027-03-01", "10", "90");
    buy(b, "stock_s", "2027-08-01", "10", "90");
    expect(reportOf(b.build(), 2027).settings_diff?.changes).toEqual([
      { event_id: loss.id, what: "computable", before: "-100", after: "0" },
    ]);
  });
});

describe("the report as JSON", () => {
  it("writes decimals as strings and says the currency of every original amount", () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    b.sell({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2027-06-01",
      quantity: "10",
      amount: "1320",
      currency: "USD",
      fx_rate: "1.1",
    });
    const json = taxReportJson(reportOf(b.build(), 2027)) as {
      capital_gains: {
        lines: {
          proceeds: Record<string, unknown>;
          quantity: unknown;
          computable_eur_rounded: unknown;
        }[];
      };
      base_eur: unknown;
      scope: string;
    };
    const [line] = json.capital_gains.lines;
    expect(line?.proceeds).toEqual({
      amount: "1320",
      currency: "USD",
      eur: "1200",
      fx_rate: "1.1",
      fx_rate_date: "2027-06-01",
    });
    expect(line?.quantity).toBe("10");
    expect(line?.computable_eur_rounded).toBe("200");
    expect(json.base_eur).toBe("200");
    expect(json.scope).toBe("fiscal_total");
  });
});
