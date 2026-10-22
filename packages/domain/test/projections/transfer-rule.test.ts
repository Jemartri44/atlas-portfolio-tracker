import { describe, expect, it } from "vitest";
import { type ProjectionError, ValidationError } from "../../src/errors.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { simulateTransfer } from "../../src/projections/simulate-transfer.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const transferFields = (from: string, to: string) => ({
  from_account_id: "acc_fund",
  from_asset_id: from,
  quantity_out: "2",
  nav_out: "1",
  value_date_out: "2027-03-03",
  to_account_id: "acc_fund",
  to_asset_id: to,
  quantity_in: "2",
  nav_in: "1",
  value_date_in: "2027-03-05",
});

const withEtfs = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.asset("ast_etf_a", { asset_type: "etf" });
  b.asset("ast_etf_b", { asset_type: "etf" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_etf_a", quantity: "5", unit_price: "100" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "5", unit_price: "100" });
  return b;
};

const failure = (b: LedgerBuilder): ProjectionError => {
  try {
    projectLedger(b.build());
  } catch (error) {
    return error as ProjectionError;
  }
  throw new Error("expected the projection to fail");
};

describe("transfers only defer tax between funds (art. 94.1.a LIRPF)", () => {
  it("rejects an ETF to ETF transfer even when both are flagged transferable", () => {
    const b = withEtfs();
    b.transfer(transferFields("ast_etf_a", "ast_etf_b"));
    const error = failure(b);
    expect(error.code).toBe("not_transferable");
    expect(error.details).toMatchObject({ asset_id: "ast_etf_a", asset_type: "etf" });
  });

  it("rejects a fund moved into an ETF and a request towards it", () => {
    let b = withEtfs();
    b.transfer(transferFields("ast_world", "ast_etf_b"));
    expect(failure(b).details).toMatchObject({ asset_id: "ast_etf_b", role: "to" });
    b = withEtfs();
    b.transferRequested({
      from_account_id: "acc_fund",
      from_asset_id: "ast_etf_a",
      to_account_id: "acc_fund",
      to_asset_id: "ast_world",
      quantity_out: "1",
      requested_date: "2027-03-01",
    });
    expect(failure(b).code).toBe("not_transferable");
  });

  it("still accepts fund to money-market and custody moves of an ETF", () => {
    const b = withEtfs();
    b.asset("ast_mm", { asset_class: "fixed_income", asset_type: "money_market" });
    b.transfer(transferFields("ast_world", "ast_mm"));
    b.transfer({ ...transferFields("ast_etf_a", "ast_etf_a"), to_account_id: "acc_etf" });
    expect(() => projectLedger(b.build())).not.toThrow();
  });

  it("blocks transfers recorded after tax_residence leaves Spain, not before", () => {
    const build = (transferDay: string): LedgerBuilder => {
      const b = new LedgerBuilder();
      catalogue(b);
      b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "5", unit_price: "100" });
      b.recordedAt("2027-01-10");
      b.settings(mergeSettings(DEFAULT_SETTINGS, { tax_residence: "PT" }));
      b.recordedAt(transferDay);
      b.transfer(transferFields("ast_world", "ast_bonds"));
      return b;
    };
    expect(() => projectLedger(build("2027-01-09").build())).not.toThrow();
    expect(failure(build("2027-01-11")).code).toBe("transfer_not_resident");
  });

  it("warns, without failing, when the catalogue flags a non-fund as transferable", () => {
    const state = projectLedger(withEtfs().build());
    const codes = state.warnings.filter((w) => w.code === "transferable_not_fund");
    expect(codes.map((w) => w.details.asset_id)).toEqual(["ast_etf_a", "ast_etf_b"]);
  });

  it("refuses to simulate a transfer into an ETF or out of Spanish residence", () => {
    const b = withEtfs();
    const state = projectLedger(b.build());
    const input = {
      from_asset_id: "ast_world",
      to_asset_id: "ast_etf_b",
      date: "2027-12-31",
      settings: DEFAULT_SETTINGS,
    };
    expect(() => simulateTransfer(state, input)).toThrowError(ValidationError);
    expect(() =>
      simulateTransfer(state, {
        ...input,
        to_asset_id: "ast_bonds",
        settings: mergeSettings(DEFAULT_SETTINGS, { tax_residence: "FR" }),
      }),
    ).toThrowError(/tax_residence is FR/);
  });
});
