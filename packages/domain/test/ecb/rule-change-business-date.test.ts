import { describe, expect, it } from "vitest";
import { readEcbZipCsv } from "../../src/ecb/history.js";
import { rateCorrections, ruleChangeRates } from "../../src/ecb/rule-change.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../../src/settings/settings.js";
import { ecbFixture } from "../fixtures-path.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

describe("ruleChangeRates (ecb/rule-change.ts)", () => {
  it("never names a rate of business date: a change of the fiscal rule does not move it", () => {
    const history = readEcbZipCsv(ecbFixture("eurofxref-hist.csv"));
    const b = new LedgerBuilder();
    catalogue(b);
    b.asset("ast_us", { asset_type: "stock", currency: "USD", transferable: false });
    const dividend = b.dividend({
      account_id: "acc_etf",
      asset_id: "ast_us",
      value_date: "2026-01-06",
      gross: "10",
      currency: "USD",
      fx_rate: "1.1169",
      fx_rate_date: "2026-01-02",
    });
    const next = mergeSettings(DEFAULT_SETTINGS, {
      fiscal_date_rule: { ...DEFAULT_SETTINGS.fiscal_date_rule, stock: "value_date" },
    } as Partial<Settings>);
    const events = b.build();
    const impact = ruleChangeRates(history, events, DEFAULT_SETTINGS, next, 30);
    expect(impact.lines.some((line) => line.event_id === dividend.id)).toBe(false);
    // Where the branch matters: the chain of `atlas fx correct` reads the same fiscal points, and a
    // rate of business date is never one to correct — here its date, the 2nd, is not the one of the
    // official rate of its value date, the 6th, and it is left alone.
    const state = projectLedger(events, { collectErrors: true });
    expect(rateCorrections(history, state, events, 30).map((line) => line.event_id)).not.toContain(
      dividend.id,
    );
  });
});
