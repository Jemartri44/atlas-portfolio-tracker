// The rule of `Settings.transfer_max_days` (ADR-0010, decision (c) of prompt
// 007). It had existed since phase 1 with nobody reading it.

import { describe, expect, it } from "vitest";
import { pendingTransfers, transferWatch } from "../../src/projections/pending.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/settings.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const settingsWith = (maxDays?: number): Settings =>
  maxDays === undefined ? DEFAULT_SETTINGS : { ...DEFAULT_SETTINGS, transfer_max_days: maxDays };

/** A ledger with one open transfer request placed on `requested_date`. */
const ledgerWithRequest = (requestedDate = "2027-06-01") => {
  const b = new LedgerBuilder();
  catalogue(b);
  const request = b.transferRequested({
    from_account_id: "acc_fund",
    from_asset_id: "ast_world",
    to_account_id: "acc_fund",
    to_asset_id: "ast_bonds",
    quantity_out: "10",
    requested_date: requestedDate,
  });
  return { builder: b, request };
};

describe("transferWatch", () => {
  it("warns when a request has been open for more than transfer_max_days", () => {
    const { builder, request } = ledgerWithRequest("2027-06-01");
    const state = projectLedger(builder.build());

    const watch = transferWatch(state, "2027-06-30", settingsWith(15));

    expect(watch.date).toBe("2027-06-30");
    expect(watch.rows).toHaveLength(1);
    expect(watch.rows[0]?.overdue).toBe(true);
    expect(watch.rows[0]?.max_days).toBe(15);
    expect(watch.rows[0]?.days_open).toBe(29);
    expect(watch.warnings.map((warning) => warning.code)).toEqual(["transfer_overdue"]);
    expect(watch.warnings[0]?.event_id).toBe(request.id);
    expect(watch.warnings[0]?.details).toMatchObject({
      request_id: request.id,
      days_open: 29,
      max_days: 15,
      requested_date: "2027-06-01",
      stage: "requested",
      from_asset_id: "ast_world",
      to_asset_id: "ast_bonds",
    });
    expect(watch.warnings[0]?.message).toContain("29 days");
  });

  /**
   * The days are counted to the date **asked**, not to today: the whole point
   * of ADR-0016 is that asking on 30/06/2027 answers what was known that day.
   */
  it("counts the days to the date asked, so the same request is fine on an earlier date", () => {
    const { builder } = ledgerWithRequest("2027-06-01");
    const state = projectLedger(builder.build());

    const early = transferWatch(state, "2027-06-10", settingsWith(15));
    expect(early.rows[0]?.overdue).toBe(false);
    expect(early.rows[0]?.days_open).toBe(9);
    expect(early.warnings).toEqual([]);

    expect(transferWatch(state, "2027-06-30", settingsWith(15)).warnings).toHaveLength(1);
  });

  /**
   * "More than N days" means the day the limit falls on is still within the
   * limit. With `>=` a limit of 15 would fire on day 15.
   */
  it("does not warn exactly on the limit, and warns the day after", () => {
    const { builder } = ledgerWithRequest("2027-06-01");
    const state = projectLedger(builder.build());

    const onLimit = transferWatch(state, "2027-06-16", settingsWith(15));
    expect(onLimit.rows[0]?.days_open).toBe(15);
    expect(onLimit.rows[0]?.overdue).toBe(false);
    expect(onLimit.warnings).toEqual([]);

    const dayAfter = transferWatch(state, "2027-06-17", settingsWith(15));
    expect(dayAfter.rows[0]?.days_open).toBe(16);
    expect(dayAfter.rows[0]?.overdue).toBe(true);
    expect(dayAfter.warnings).toHaveLength(1);
  });

  /** Constitution IV and V: an unset parameter is not a default of zero. */
  it("does not evaluate the rule at all when transfer_max_days is not configured", () => {
    const { builder } = ledgerWithRequest("2020-01-01");
    const state = projectLedger(builder.build());

    const watch = transferWatch(state, "2027-06-30", settingsWith());

    expect(watch.rows).toHaveLength(1);
    expect(watch.rows[0]?.overdue).toBeUndefined();
    expect(watch.rows[0]?.max_days).toBeUndefined();
    expect(watch.warnings).toEqual([]);
  });

  /**
   * A redeemed request is money that has left the origin fund and has not
   * arrived anywhere: it is the dangerous state, and exactly the transfer worth
   * chasing.
   */
  it("keeps counting a request that is already redeemed", () => {
    const { builder, request } = ledgerWithRequest("2027-06-01");
    builder.transferRequestUpdated({
      request_id: request.id,
      stage: "redeemed",
      date: "2027-06-03",
    });
    const state = projectLedger(builder.build());

    const watch = transferWatch(state, "2027-06-30", settingsWith(15));

    expect(watch.rows[0]?.stage).toBe("redeemed");
    expect(watch.rows[0]?.overdue).toBe(true);
    expect(watch.warnings[0]?.details.stage).toBe("redeemed");
  });

  it("ignores a cancelled request, however old it is", () => {
    const { builder, request } = ledgerWithRequest("2027-06-01");
    builder.transferRequestUpdated({
      request_id: request.id,
      stage: "cancelled",
      date: "2027-06-03",
    });
    const state = projectLedger(builder.build());

    const watch = transferWatch(state, "2028-06-30", settingsWith(15));

    expect(watch.rows).toEqual([]);
    expect(watch.warnings).toEqual([]);
  });

  it("warns once per overdue request and leaves the ones in time alone", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const old = b.transferRequested({
      from_account_id: "acc_fund",
      from_asset_id: "ast_world",
      to_account_id: "acc_fund",
      to_asset_id: "ast_bonds",
      quantity_out: "10",
      requested_date: "2027-01-01",
    });
    b.transferRequested({
      from_account_id: "acc_fund",
      from_asset_id: "ast_bonds",
      to_account_id: "acc_fund",
      to_asset_id: "ast_world",
      amount_eur: "500",
      requested_date: "2027-06-28",
    });
    const state = projectLedger(b.build());

    const watch = transferWatch(state, "2027-06-30", settingsWith(15));

    expect(watch.rows).toHaveLength(2);
    expect(watch.rows.filter((row) => row.overdue === true)).toHaveLength(1);
    expect(watch.warnings).toHaveLength(1);
    expect(watch.warnings[0]?.details.request_id).toBe(old.id);
  });

  /** The wrapper adds the rule; it does not change what the query underneath says. */
  it("returns the same rows pendingTransfers returns", () => {
    const { builder } = ledgerWithRequest("2027-06-01");
    const state = projectLedger(builder.build());

    const plain = pendingTransfers(state, "2027-06-30");
    const watched = transferWatch(state, "2027-06-30", settingsWith(15)).rows;

    expect(watched.map((row) => row.request_id)).toEqual(plain.map((row) => row.request_id));
    expect(watched.map((row) => row.days_open)).toEqual(plain.map((row) => row.days_open));
  });

  it("says nothing on a ledger with no transfer requests", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const state = projectLedger(b.build());

    expect(transferWatch(state, "2027-06-30", settingsWith(15))).toEqual({
      date: "2027-06-30",
      rows: [],
      warnings: [],
    });
  });
});
