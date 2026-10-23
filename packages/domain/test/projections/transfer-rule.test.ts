import { describe, expect, it } from "vitest";
import type { ValidationError } from "../../src/errors.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { simulateTransfer } from "../../src/projections/simulate-transfer.js";
import { DEFAULT_SETTINGS, mergeSettings } from "../../src/settings/settings.js";
import { checkInvalid } from "../../src/usecases/record-event.js";
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

const codesOf = (b: LedgerBuilder): string[] =>
  projectLedger(b.build()).warnings.map((warning) => warning.code);

/** What recording the last event of the builder would answer: the error, or `undefined`. */
const recording = (b: LedgerBuilder): ValidationError | undefined => {
  const events = b.build();
  try {
    checkInvalid(events.slice(0, -1), events[events.length - 1] as never, {});
  } catch (error) {
    return error as ValidationError;
  }
  return undefined;
};

const residence = (value: string | undefined, transferDay: string): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "5", unit_price: "100" });
  b.recordedAt("2027-01-10");
  b.settings(mergeSettings(DEFAULT_SETTINGS, value === undefined ? {} : { tax_residence: value }));
  b.recordedAt(transferDay);
  b.transfer(transferFields("ast_world", "ast_bonds"));
  return b;
};

describe("transfers only defer tax between funds (art. 94.1.a LIRPF)", () => {
  it("replays an ETF to ETF transfer with a warning, and refuses to record it", () => {
    const b = withEtfs();
    b.transfer(transferFields("ast_etf_a", "ast_etf_b"));
    expect(codesOf(b)).toContain("transfer_not_between_funds");
    const error = recording(b);
    expect(error?.code).toBe("not_transferable");
    expect(error?.details).toMatchObject({ asset_id: "ast_etf_a", asset_type: "etf" });
  });

  it("does the same for a fund moved into an ETF and for a request towards it", () => {
    let b = withEtfs();
    b.transfer(transferFields("ast_world", "ast_etf_b"));
    expect(recording(b)?.details).toMatchObject({ asset_id: "ast_etf_b", role: "to" });
    b = withEtfs();
    b.transferRequested({
      from_account_id: "acc_fund",
      from_asset_id: "ast_etf_a",
      to_account_id: "acc_fund",
      to_asset_id: "ast_world",
      quantity_out: "1",
      requested_date: "2027-03-01",
    });
    expect(codesOf(b)).toContain("transfer_not_between_funds");
    expect(recording(b)?.code).toBe("not_transferable");
  });

  it("accepts fund to money-market, and custody moves and requests of an ETF", () => {
    const b = withEtfs();
    b.asset("ast_mm", { asset_class: "fixed_income", asset_type: "money_market" });
    b.transfer(transferFields("ast_world", "ast_mm"));
    b.transfer({ ...transferFields("ast_etf_a", "ast_etf_a"), to_account_id: "acc_etf" });
    b.transferRequested({
      from_account_id: "acc_fund",
      from_asset_id: "ast_etf_a",
      to_account_id: "acc_etf",
      to_asset_id: "ast_etf_a",
      quantity_out: "1",
      requested_date: "2027-03-01",
    });
    expect(codesOf(b).filter((code) => code.startsWith("transfer_not"))).toEqual([]);
    expect(recording(b)).toBeUndefined();
  });

  it("warns on replay and refuses to record once tax_residence is not Spain", () => {
    expect(codesOf(residence("PT", "2027-01-11"))).toContain("transfer_not_resident");
    expect(recording(residence("PT", "2027-01-11"))?.code).toBe("transfer_not_resident");
    expect(codesOf(residence("PT", "2027-01-09"))).not.toContain("transfer_not_resident");
  });

  it("reads Spain whatever its spelling, and blank or missing as Spain", () => {
    for (const value of ["es", " ES ", "", undefined]) {
      expect(codesOf(residence(value, "2027-01-11"))).not.toContain("transfer_not_resident");
    }
  });

  it("applies the residence to a pending request too", () => {
    const b = residence("FR", "2027-01-11");
    b.transferRequested({
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      to_account_id: "acc_fund",
      to_asset_id: "ast_bonds",
      quantity_out: "1",
      requested_date: "2027-01-12",
    });
    expect(recording(b)?.code).toBe("transfer_not_resident");
  });

  it("warns once for a request and the transfer that completes it", () => {
    const b = withEtfs();
    const request = b.transferRequested({
      from_account_id: "acc_fund",
      from_asset_id: "ast_etf_a",
      to_account_id: "acc_fund",
      to_asset_id: "ast_etf_b",
      quantity_out: "2",
      requested_date: "2027-03-01",
    });
    b.transfer({ ...transferFields("ast_etf_a", "ast_etf_b"), request_id: request.id });
    const warned = projectLedger(b.build()).warnings.filter((warning) =>
      warning.code.startsWith("transfer_not"),
    );
    expect(warned.map((warning) => [warning.code, warning.event_id])).toEqual([
      ["transfer_not_between_funds", request.id],
    ]);
  });

  it("still warns on the transfer when its request did not (the rule changed in between)", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "5", unit_price: "100" });
    b.recordedAt("2027-01-09");
    const request = b.transferRequested({
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      to_account_id: "acc_fund",
      to_asset_id: "ast_bonds",
      quantity_out: "2",
      requested_date: "2027-01-10",
    });
    b.recordedAt("2027-01-10");
    b.settings(mergeSettings(DEFAULT_SETTINGS, { tax_residence: "PT" }));
    b.recordedAt("2027-01-12");
    const transfer = b.transfer({
      ...transferFields("ast_world", "ast_bonds"),
      request_id: request.id,
    });
    const warned = projectLedger(b.build()).warnings.filter((warning) =>
      warning.code.startsWith("transfer_not"),
    );
    expect(warned.map((warning) => [warning.code, warning.event_id])).toEqual([
      ["transfer_not_resident", transfer.id],
    ]);
  });

  it("warns once when the catalogue flags a non-fund as transferable, not on each update", () => {
    const b = withEtfs();
    b.assetUpdated({
      asset_id: "ast_etf_a",
      asset_type: "etf",
      book: "core",
      asset_class: "equity",
      name: "renamed",
      currency: "EUR",
      transferable: true,
      active: true,
    });
    const flagged = projectLedger(b.build()).warnings.filter(
      (warning) => warning.code === "transferable_not_fund",
    );
    expect(flagged.map((warning) => warning.details.asset_id)).toEqual(["ast_etf_a", "ast_etf_b"]);
    b.asset("ast_gold2", { asset_type: "etc", transferable: false });
    b.assetUpdated({
      asset_id: "ast_gold2",
      asset_type: "etc",
      book: "core",
      asset_class: "equity",
      name: "now flagged",
      currency: "EUR",
      transferable: true,
      active: true,
    });
    expect(
      projectLedger(b.build()).warnings.filter(
        (warning) => warning.code === "transferable_not_fund",
      ),
    ).toHaveLength(3);
  });

  it("refuses to simulate a transfer from or into an ETF, or out of Spanish residence", () => {
    const state = projectLedger(withEtfs().build());
    const input = {
      from_asset_id: "ast_world",
      to_asset_id: "ast_etf_b",
      date: "2027-12-31",
      settings: DEFAULT_SETTINGS,
    };
    const codeOf = (extra: object): unknown => {
      try {
        simulateTransfer(state, { ...input, ...extra });
      } catch (error) {
        return (error as ValidationError).code;
      }
      return undefined;
    };
    expect(codeOf({})).toBe("not_transferable");
    expect(codeOf({ from_asset_id: "ast_etf_a", to_asset_id: "ast_world" })).toBe(
      "not_transferable",
    );
    expect(() =>
      simulateTransfer(state, {
        ...input,
        to_asset_id: "ast_bonds",
        settings: mergeSettings(DEFAULT_SETTINGS, { tax_residence: "FR" }),
      }),
    ).toThrowError(/tax_residence is FR/);
  });
});
