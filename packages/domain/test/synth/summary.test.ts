import { describe, expect, it } from "vitest";
import { summarizeLedger } from "../../src/synth/summary.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

describe("summarizeLedger", () => {
  it("counts events by type and lists accounts, assets and years", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", value_date: "2027-01-10" });
    b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      trade_date: "2027-12-30",
      value_date: "2028-01-02",
    });
    b.valuation({ account_id: "acc_etf", asset_id: "ast_gold", date: "2026-12-31" });
    b.thesisOpened({ thesis_id: "t" });
    expect(summarizeLedger(b.build())).toEqual({
      events: 11,
      by_type: {
        account_created: 3,
        asset_created: 4,
        buy: 1,
        sell: 1,
        thesis_opened: 1,
        valuation: 1,
      },
      accounts: ["acc_bucket", "acc_etf", "acc_fund"],
      assets: ["ast_bonds", "ast_gold", "ast_spec", "ast_world"],
      years: [2026, 2027, 2028],
    });
    expect(summarizeLedger([])).toEqual({
      events: 0,
      by_type: {},
      accounts: [],
      assets: [],
      years: [],
    });
  });
});
