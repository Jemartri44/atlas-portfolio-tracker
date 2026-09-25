// The validation of a unit, as the application writes it (§6.3 (V1)).

import { describe, expect, it } from "vitest";
import type {
  AssetCreatedEvent,
  BuyEvent,
  LedgerEvent,
  SellEvent,
} from "../../src/schema/events.js";
import { evaluateUnit } from "../../src/sync/evaluate.js";
import { baseLedger, byTradeDate, correction, device, reorderable } from "./helpers.js";

const failureOf = (base: readonly LedgerEvent[], unit: readonly LedgerEvent[]) => {
  const check = evaluateUnit(base, unit);
  if (check.ok) {
    throw new Error("accepted");
  }
  return check.failure;
};

describe("evaluateUnit", () => {
  const { events } = baseLedger();
  const buy = events[events.length - 1] as BuyEvent;

  it("accepts a buy of 10, a sale of 10 and the buy corrected to 12, which the reversal alone would break (V1)", () => {
    const b = device(100);
    const sale = b.sell({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10" });
    const pair = correction(b, buy, { quantity: "12" });
    expect(evaluateUnit([...events, sale], pair).ok).toBe(true);
    // The reversal alone is exactly what the application never writes.
    const alone = failureOf([...events, sale], [pair[0]]);
    expect(alone).toEqual({
      member: "other",
      domain_code: "dependent_events",
      affected: [{ id: sale.id, code: "insufficient_position" }],
    });
  });

  it("names the correction when it is the member that fails (case 10)", () => {
    const b = device(200);
    const sold = b.sell({ account_id: "acc_fund", asset_id: "ast_world", quantity: "1" });
    const pair = correction(b, sold as SellEvent, { quantity: "11" });
    expect(failureOf([...events, sold], pair)).toEqual({
      member: "correction",
      member_index: 1,
      domain_code: "insufficient_position",
    });
  });

  it("names a third event the pair leaves invalid, with its code", () => {
    const b = device(300);
    const sale = b.sell({ account_id: "acc_fund", asset_id: "ast_world", quantity: "8" });
    const pair = correction(b, buy, { quantity: "5" });
    expect(failureOf([...events, sale], pair)).toEqual({
      member: "other",
      domain_code: "dependent_events",
      affected: [{ id: sale.id, code: "insufficient_position" }],
    });
  });

  it("names the reversal when it is the one that fails", () => {
    const b = device(400);
    const first = b.reversal(buy.id);
    const pair = correction(b, buy, { quantity: "5" });
    expect(failureOf([...events, first], pair)).toMatchObject({
      member: "reversal",
      member_index: 0,
    });
  });

  it("refuses a line with the id of another as the projection does (duplicate_id)", () => {
    const b = device(500);
    const deposit = b.deposit({ account_id: "acc_fund" });
    const twin = { ...deposit, amount: "999" };
    expect(failureOf([...events, deposit], [twin])).toEqual({
      member: "line",
      member_index: 0,
      domain_code: "duplicate_id",
    });
  });

  it("refuses an ISIN that another asset already has", () => {
    const b = device(600);
    const first = b.asset("ast_isin_a", { isin: "IE00B4L5Y983" }) as AssetCreatedEvent;
    const second = b.asset("ast_isin_b", { isin: "IE00B4L5Y983" }) as AssetCreatedEvent;
    expect(failureOf([...events, first], [second])).toMatchObject({
      member: "line",
      domain_code: "duplicate_isin",
    });
  });

  it("says a settings change that leaves events invalid apart (newly_invalid_events)", () => {
    const { builder, events: reordered } = reorderable();
    const change = builder.settings(byTradeDate);
    expect(failureOf(reordered, [change])).toMatchObject({
      member: "other",
      domain_code: "newly_invalid_events",
    });
  });
});
