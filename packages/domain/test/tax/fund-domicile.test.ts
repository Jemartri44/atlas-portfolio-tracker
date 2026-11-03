// The window of a fund by its domicile (criterion #2), worked out by hand.
//
// Two funds, the same operations: 100 units bought at 10 on 05/01/2026, sold
// at 6 on 10/03/2026 (a loss of 100 × (6 − 10) = −400 each) and 100 units
// bought back at 6 on 10/06/2026, three months after the sale.
//
// - `fund_es` (ISIN ES…): two months (V0011-00, V2067-06), window
//   [10/01/2026, 10/05/2026]. The repurchase of 10/06 is outside it, so the
//   −400 count in 2026: `2:fund_es_2m`.
// - `fund_ie` (ISIN IE…): a year (art. 33.5.g), window [10/03/2025,
//   10/03/2027]. The repurchase is inside it and covers the 100 units sold, so
//   the −400 are deferred whole: `2:fund_1y`.
//
// Base of 2026: −400 + 0 is a negative balance, so the base is 0 and −400 are
// carried until 2030. The other reading of each fund, measured apart:
// - the Spanish one on a year defers its −400 too: pending +400, deferred −400;
// - the Irish one on two months computes its −400: pending −400, deferred +400.

import { describe, expect, it } from "vitest";
import type { LedgerEvent } from "../../src/schema/events.js";
import type { Settings } from "../../src/settings/settings.js";
import { taxYear } from "../../src/tax/year.js";
import { buy, HAND_SETTINGS, sell, taxBuilder, text } from "./helpers.js";

/** Nothing rides a default: the domicile rule is written down. */
const BY_DOMICILE: Settings = {
  ...HAND_SETTINGS,
  wash_sale_window: { ...HAND_SETTINGS.wash_sale_window, fund: "by_domicile" },
};

const ledger = (): LedgerEvent[] => {
  const b = taxBuilder(BY_DOMICILE);
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

describe("§6.5 — the window of a fund by its domicile", () => {
  const report = taxYear(ledger(), 2026, { today: "2028-01-01" });
  const line = (asset: string) =>
    report.capital_gains.lines.find((entry) => entry.asset_id === asset);

  it("computes the loss of the Spanish fund: two months, the repurchase falls outside", () => {
    expect(text(line("fund_es")?.own_eur)).toBe("-400");
    expect(text(line("fund_es")?.deferred_eur)).toBe("0");
    expect(line("fund_es")?.criteria).toContain("2:fund_es_2m");
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
    expect(text(stake("2:fund_es_2m")?.pending_difference_eur)).toBe("400");
    expect(text(stake("2:fund_es_2m")?.deferred_difference_eur)).toBe("-400");
    expect(text(stake("2:fund_1y")?.pending_difference_eur)).toBe("-400");
    expect(text(stake("2:fund_1y")?.deferred_difference_eur)).toBe("400");
  });
});
