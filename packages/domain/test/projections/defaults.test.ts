// The cross-cutting acceptance criterion of feature 008 (ADR-0021): **none of
// the nine provisions changes a figure the system already computed**.
//
// Every one of them is either optional with a default that is today's
// behaviour, or a type of event that did not exist. So a ledger that carries
// the new fields and the same ledger without them have to project to the very
// same state — and that is what is asserted here, on the whole snapshot rather
// than on a handful of numbers, because the whole snapshot is what `compact`
// and `check --deep` compare.
//
// The one exception is written into the test: `income_eur` on a grant adds an
// entry to `in_kind_income`, which is the point of recording it. It adds
// nothing anywhere else.

import { describe, expect, it } from "vitest";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { snapshotDiff, snapshotOf } from "../../src/projections/snapshot.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

/**
 * A ledger touching everything the feature can reach: the catalogue, a
 * standalone fee, a forced sale and a grant, plus the settings.
 */
const ledger = (decorated: boolean): LedgerEvent[] => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.asset("ast_fork", { asset_type: "crypto", asset_class: "crypto", transferable: false });
  // The settings are the same in both: what a `settings_changed` records is
  // what was written (ADR-0022), so varying it would move `settings_history`
  // for a reason that has nothing to do with the calculations. The setting's
  // own default is the second test.
  b.settings(DEFAULT_SETTINGS);
  b.deposit({ account_id: "acc_fund", amount: "5000" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
  b.fee({ account_id: "acc_fund", ...(decorated ? { fee_kind: "custody" as const } : {}) });
  b.corporateAction({
    kind: "fund_liquidation",
    asset_id: "ast_world",
    effective_date: "2027-06-01",
    ...(decorated ? { neutrality_regime: true } : {}),
    effects: [
      {
        op: "forced_sale",
        per_account: [
          {
            account_id: "acc_fund",
            quantity: "all",
            ...(decorated ? { withholding: "0" } : {}),
          },
        ],
        unit_price: "120",
        currency: "EUR",
        fx_rate: "1",
        fx_rate_date: "2027-06-01",
      },
    ],
  });
  b.corporateAction({
    kind: "crypto_fork",
    asset_id: "ast_bonds",
    effective_date: "2027-07-01",
    effects: [
      {
        op: "grant",
        asset_id: "ast_fork",
        per_account: [{ account_id: "acc_fund", quantity: "10" }],
        unit_cost: "0",
        currency: "EUR",
        fx_rate: "1",
        fx_rate_date: "2027-07-01",
        acquisition_date: "2027-07-01",
      },
    ],
  });
  return b.build();
};

describe("the provisions of ADR-0021 change nothing by default", () => {
  it("projects a ledger with the new event fields exactly like one without them", () => {
    const plain = snapshotOf(projectLedger(ledger(false)));
    const decorated = snapshotOf(projectLedger(ledger(true)));
    expect(snapshotDiff(plain, decorated)).toEqual([]);
    expect(JSON.stringify(decorated)).toBe(JSON.stringify(plain));
  });

  it("reads every default as today's behaviour when the settings say nothing", () => {
    const { income_category: _absent, ...bare } = DEFAULT_SETTINGS;
    const b = new LedgerBuilder();
    catalogue(b);
    b.settings(bare as never);
    b.deposit({ account_id: "acc_fund", amount: "5000" });
    b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const withDefaults = new LedgerBuilder();
    catalogue(withDefaults);
    withDefaults.settings(DEFAULT_SETTINGS);
    withDefaults.deposit({ account_id: "acc_fund", amount: "5000" });
    withDefaults.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const bareState = snapshotOf(projectLedger(b.build()));
    const fullState = snapshotOf(projectLedger(withDefaults.build()));
    // Only the recorded settings differ, because the ledger keeps what was
    // written (ADR-0022); everything computed from them is identical.
    expect(snapshotDiff(bareState, fullState)).toEqual(["fiscal_settings", "settings_history"]);
    expect(JSON.stringify(bareState.lots)).toBe(JSON.stringify(fullState.lots));
    expect(JSON.stringify(bareState.gains)).toBe(JSON.stringify(fullState.gains));
    expect(JSON.stringify(bareState.cash)).toBe(JSON.stringify(fullState.cash));
    expect(JSON.stringify(bareState.warnings)).toBe(JSON.stringify(fullState.warnings));
  });

  it("records the income of a grant, and that is the only thing it adds", () => {
    const withIncome = new LedgerBuilder();
    catalogue(withIncome);
    withIncome.asset("ast_fork", {
      asset_type: "crypto",
      asset_class: "crypto",
      transferable: false,
    });
    withIncome.corporateAction({
      kind: "crypto_fork",
      asset_id: "ast_world",
      effective_date: "2027-07-01",
      effects: [
        {
          op: "grant",
          asset_id: "ast_fork",
          per_account: [{ account_id: "acc_fund", quantity: "10" }],
          unit_cost: "0",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-07-01",
          acquisition_date: "2027-07-01",
          income_eur: "420.50",
          income_base: "general",
        },
      ],
    });
    const events = withIncome.build();
    const silent = events.map((event) =>
      event.type === "corporate_action"
        ? { ...event, effects: [{ ...event.effects[0], income_eur: undefined }] }
        : event,
    ) as LedgerEvent[];
    const loud = snapshotOf(projectLedger(events));
    const quiet = snapshotOf(projectLedger(silent));
    expect(snapshotDiff(quiet, loud)).toEqual(["in_kind_income"]);
  });
});
