import { describe, expect, it } from "vitest";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { valuations } from "../../src/projections/valuations.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

describe("valuations(date)", () => {
  it("returns the last snapshot per account and asset on or before the date, valued in EUR", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.valuation({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      date: "2026-12-31",
      quantity: "5",
      unit_value: "210",
      currency: "USD",
      fx_rate: "1.09",
    });
    const later = b.valuation({
      account_id: "acc_etf",
      asset_id: "ast_gold",
      date: "2027-12-31",
      quantity: "3",
      unit_value: "250",
      currency: "USD",
      fx_rate: "1.25",
    });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-06-30",
      quantity: "10",
      unit_value: "120",
      currency: "EUR",
      fx_rate: "1",
    });
    const state = projectLedger(b.build());

    const end2026 = valuations(state, "2026-12-31");
    expect(end2026).toHaveLength(1);
    expect(end2026[0]?.value_eur.amount.toString()).toBe("963.3027522936");
    expect(end2026[0]?.unit_value.toString()).toBe("210");
    expect(end2026[0]?.fx_rate.toString()).toBe("1.09");

    const end2027 = valuations(state, "2027-12-31");
    expect(
      end2027.map((v) => `${v.account_id}|${v.asset_id}@${v.date}=${v.value_eur.amount}`),
    ).toEqual(["acc_etf|ast_gold@2027-12-31=600", "acc_fund|ast_world@2027-06-30=1200"]);
    expect(end2027[0]?.event_id).toBe(later.id);
    expect(valuations(state, "2026-12-30")).toEqual([]);
  });

  it("breaks ties on the same day by file position and never estimates a missing pair", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-12-31",
      quantity: "10",
      unit_value: "100",
    });
    const corrected = b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_world",
      date: "2027-12-31",
      quantity: "10",
      unit_value: "101",
    });
    b.valuation({
      account_id: "acc_fund",
      asset_id: "ast_bonds",
      date: "2028-01-05",
      quantity: "1",
      unit_value: "1",
    });
    const state = projectLedger(b.build());
    const at = valuations(state, "2027-12-31");
    expect(at).toHaveLength(1);
    expect(at[0]?.event_id).toBe(corrected.id);
    expect(at[0]?.value_eur.amount.toString()).toBe("1010");
  });
});
