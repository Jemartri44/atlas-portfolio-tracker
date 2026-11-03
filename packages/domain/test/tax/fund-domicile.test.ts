// The window of a fund by its domicile (criterion #2), worked out by hand.
//
// Two funds, the same operations: 100 units bought at 10 on 05/01/2026, sold
// at 6 on 10/03/2026 (a loss of 100 × (6 − 10) = −400 each) and 100 units
// bought back at 6 on 10/06/2026, three months after the sale.
//
// - `fund_es` (ISIN ES…): two months (V0011-00, V2067-06), window
//   [10/01/2026, 10/05/2026]. The repurchase of 10/06 is outside it, so the
//   −400 count in 2026: `2:fund_admitted_2m`.
// - `fund_ie` (ISIN IE…): a year (art. 33.5.g), window [10/03/2025,
//   10/03/2027]. The repurchase is inside it and covers the 100 units sold, so
//   the −400 are deferred whole: `2:fund_1y`.
//
// Base of 2026: −400 + 0 is a negative balance, so the base is 0 and −400 are
// carried until 2030. The other reading of each fund, measured apart:
// - the Spanish one on a year defers its −400 too: pending +400, deferred −400;
// - the Irish one on two months computes its −400: pending −400, deferred +400.

import { describe, expect, it } from "vitest";
import { closedYearImpact } from "../../src/filings/closed-years.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import type { Settings } from "../../src/settings/settings.js";
import { repurchaseCalendar } from "../../src/tax/repurchase-calendar.js";
import { taxYear } from "../../src/tax/year.js";
import { buy, HAND_SETTINGS, sell, taxBuilder, text } from "./helpers.js";

/** Nothing rides a default: the domicile rule is written down. */
const BY_DOMICILE: Settings = {
  ...HAND_SETTINGS,
  wash_sale_window: { ...HAND_SETTINGS.wash_sale_window, fund: "by_domicile" },
};

const ledger = (settings: Settings = BY_DOMICILE): LedgerEvent[] => {
  const b = taxBuilder(settings);
  b.asset("fund_es", { isin: "ES0000000011" });
  b.asset("fund_ie", { isin: "IE0000000012" });
  b.deposit({ account_id: "acc_a", value_date: "2026-01-04", amount: "3200" });
  for (const fund of ["fund_es", "fund_ie"]) {
    buy(b, fund, "2026-01-05", "100", "10");
    sell(b, fund, "2026-03-10", "100", "6");
    buy(b, fund, "2026-06-10", "100", "6");
  }
  return b.build();
};

describe("the default window of a fund: two months, wherever it is domiciled", () => {
  const { fund: _fund, money_market: _moneyMarket, ...others } = HAND_SETTINGS.wash_sale_window;
  const events = ledger({ ...HAND_SETTINGS, wash_sale_window: others } as Settings);
  const report = taxYear(events, 2026, { today: "2028-01-01" });
  const irish = report.capital_gains.lines.find((entry) => entry.asset_id === "fund_ie");

  it("computes the loss of the Irish fund, and says it rests on no consultation", () => {
    expect(text(irish?.own_eur)).toBe("-400");
    expect(text(irish?.deferred_eur)).toBe("0");
    expect(irish?.criteria).toContain("2:fund_unlisted_2m");
  });

  it("computes the loss of the Spanish fund under its own criterion", () => {
    const spanish = report.capital_gains.lines.find((entry) => entry.asset_id === "fund_es");
    expect(text(spanish?.own_eur)).toBe("-400");
    expect(spanish?.criteria).toContain("2:fund_admitted_2m");
  });

  it.each(["2:fund_unlisted_2m", "2:fund_admitted_2m"])(
    "still shows the figure of a year in the doubtful section for %s",
    (criterion) => {
      const stake = report.doubtful.find((entry) => entry.criterion === criterion);
      expect(text(stake?.pending_difference_eur)).toBe("400");
      expect(text(stake?.deferred_difference_eur)).toBe("-400");
    },
  );

  it("calls the unlisted fund an aggressive reading", () => {
    const stake = report.doubtful.find((entry) => entry.criterion === "2:fund_unlisted_2m");
    expect(stake?.direction).toBe("aggressive");
  });

  it("closes the window the plan and the monthly mail warn about at two months", () => {
    const sale = repurchaseCalendar(events, "2026-04-01").blocks.find(
      (block) => block.asset_id === "fund_ie",
    )?.sales[0];
    expect(sale?.until).toBe("2026-05-10");
  });
});

describe("§6.5 — the window of a fund by its domicile", () => {
  const report = taxYear(ledger(), 2026, { today: "2028-01-01" });
  const line = (asset: string) =>
    report.capital_gains.lines.find((entry) => entry.asset_id === asset);

  it("computes the loss of the Spanish fund: two months, the repurchase falls outside", () => {
    expect(text(line("fund_es")?.own_eur)).toBe("-400");
    expect(text(line("fund_es")?.deferred_eur)).toBe("0");
    expect(line("fund_es")?.criteria).toContain("2:fund_admitted_2m");
  });

  it("defers the loss of the Irish fund: a year, the repurchase falls inside", () => {
    expect(text(line("fund_ie")?.deferred_eur)).toBe("-400");
    expect(text(line("fund_ie")?.computable_eur_rounded)).toBe("0");
    expect(line("fund_ie")?.deferral?.window).toBe("1y");
    expect(line("fund_ie")?.criteria).toContain("2:fund_1y");
  });

  it("carries the −400 of the Spanish fund and keeps the base at zero", () => {
    expect(text(report.base_eur)).toBe("0");
    expect(report.compensation.pending.map((entry) => text(entry.amount_eur))).toEqual(["-400"]);
  });

  it("measures the other reading of each fund apart in the doubtful section", () => {
    const stake = (criterion: string) =>
      report.doubtful.find((entry) => entry.criterion === criterion);
    expect(text(stake("2:fund_admitted_2m")?.pending_difference_eur)).toBe("400");
    expect(text(stake("2:fund_admitted_2m")?.deferred_difference_eur)).toBe("-400");
    expect(text(stake("2:fund_1y")?.pending_difference_eur)).toBe("-400");
    expect(text(stake("2:fund_1y")?.deferred_difference_eur)).toBe("400");
  });
});

// A loss of 2026 on the Spanish fund computes with two months; with a year it
// would be deferred onto the repurchase of 10/10/2026 and released by its sale
// in 2027. No line of 2027 declares `2:fund_admitted_2m`, and its other
// reading moves 2027 all the same: it has to be measured there too.
describe("§6.5 — the other reading of a fund, across years", () => {
  it("measures it in the year the deferred loss would be released", () => {
    const b = taxBuilder(BY_DOMICILE);
    b.asset("fund_es", { isin: "ES0000000011" });
    b.deposit({ account_id: "acc_a", value_date: "2026-01-04", amount: "1600" });
    buy(b, "fund_es", "2026-01-05", "100", "10");
    sell(b, "fund_es", "2026-03-10", "100", "6");
    buy(b, "fund_es", "2026-10-10", "100", "6");
    sell(b, "fund_es", "2027-02-01", "100", "8");
    const report = taxYear(b.build(), 2027, { today: "2028-06-01" });
    const stake = report.doubtful.find((entry) => entry.criterion === "2:fund_admitted_2m");
    // Two months: 2026 carries −400; 2027 nets +200 against it, base 0, −200
    // left of 2026. A year: 2026 defers −400; 2027 nets +200 − 400 = −200, base
    // 0, −200 left of 2027. The totals coincide; the line of 2027 does not, and
    // that is what the measure names.
    expect(stake).toBeDefined();
    expect(stake?.event_ids.length).toBeGreaterThan(0);
  });
});

// Writing the market of a fund changes the window of every sale of it, also of
// a year already filed: the write warns, like a change of the settings.
describe("§6.5 — a fund's market rewritten after filing", () => {
  it("warns that the filed year moves", () => {
    const b = taxBuilder(BY_DOMICILE);
    const created = b.asset("fund_ie", { isin: "IE0000000012" });
    b.deposit({ account_id: "acc_a", value_date: "2026-01-04", amount: "1600" });
    buy(b, "fund_ie", "2026-01-05", "100", "10");
    sell(b, "fund_ie", "2026-03-10", "100", "6");
    buy(b, "fund_ie", "2026-06-10", "100", "6");
    b.filed({
      tax_year: 2026,
      filed_at: "2027-06-18",
      declared: { savings_base_eur: "0", pending_losses: [], deferred_losses_eur: "-400.00" },
    });
    const before = b.build();
    const { schema_version: _v, id: _id, recorded_at: _at, type: _type, ...fields } = created;
    b.assetUpdated({ ...fields, market: "XMSM" });
    const [impact] = closedYearImpact({ events: before }, { events: b.build() }, "2027-09-01");
    expect(impact?.year).toBe(2026);
    expect(impact?.by_date).toBe(false);
    expect(impact?.comparison.status).toBe("compared");
    const moved =
      impact?.comparison.status === "compared"
        ? impact.comparison.moves.map((entry) => entry.figure)
        : [];
    expect(moved).toContain("deferred");
  });
});
