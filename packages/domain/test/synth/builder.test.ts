import { describe, expect, it } from "vitest";
import type { BuyEvent } from "../../src/schema/events.js";
import { validateShape } from "../../src/schema/validate.js";
import { ScenarioBuilder } from "../../src/synth/builder.js";
import { addDays, dateOf, monthAt } from "../../src/synth/calendar.js";
import { Prng } from "../../src/synth/random.js";

const catalogue = (b: ScenarioBuilder) => {
  for (const account_id of ["acc_a", "acc_b"]) {
    b.record("2026-09-01", {
      type: "account_created",
      account_id,
      name: account_id,
      platform: "ibkr",
      book: "core",
      base_currency: "EUR",
      country: "IE",
      active: true,
    });
  }
  b.record("2026-09-01", {
    type: "asset_created",
    asset_id: "ast_gold",
    asset_type: "etc",
    book: "core",
    asset_class: "gold",
    name: "Gold",
    currency: "EUR",
    transferable: false,
    active: true,
  });
};

const buy = (b: ScenarioBuilder, account_id: string, quantity: string, date: string) =>
  b.record<BuyEvent>(date, {
    type: "buy",
    account_id,
    asset_id: "ast_gold",
    trade_date: date,
    value_date: date,
    quantity,
    unit_price: "100",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: date,
    fee: "0",
    source: "manual",
  });

describe("ScenarioBuilder", () => {
  it("completes envelope and fingerprint like recordEvent and keeps recorded_at monotonic", () => {
    const b = new ScenarioBuilder(new Prng(1));
    catalogue(b);
    const first = buy(b, "acc_a", "7", "2026-10-03");
    const late = buy(b, "acc_b", "5", "2026-09-15");
    expect(first.schema_version).toBe(1);
    expect(first.fingerprint).toMatch(/^sha256:/);
    expect(validateShape(first)).toBe(first);
    expect(first.recorded_at).toBe("2026-10-03T18:00:00.000Z");
    expect(late.recorded_at).toBe("2026-10-03T18:00:01.000Z");
    expect(late.id > first.id).toBe(true);
    expect(b.events).toHaveLength(5);
    const again = new ScenarioBuilder(new Prng(1));
    catalogue(again);
    expect(buy(again, "acc_a", "7", "2026-10-03")).toEqual(first);
  });

  it("projects what was recorded so far and reads positions, cash and picos from it", () => {
    const b = new ScenarioBuilder(new Prng(1));
    catalogue(b);
    expect(b.position("acc_a", "ast_gold").isZero()).toBe(true);
    buy(b, "acc_a", "7", "2026-10-03");
    buy(b, "acc_b", "5", "2026-10-04");
    expect(b.state()).toBe(b.state());
    expect(b.position("acc_a", "ast_gold").toString()).toBe("7");
    expect(b.cash("acc_a", "EUR")?.amount.toString()).toBe("-700");
    expect(b.cash("acc_a", "USD")).toBeUndefined();
    expect(b.picos("ast_gold", "1/4")).toEqual([
      { account_id: "acc_a", quantity: "0.75" },
      { account_id: "acc_b", quantity: "0.25" },
    ]);
    expect(b.picos("ast_gold", "2")).toEqual([]);
    expect(b.picos("ast_other", "1/4")).toEqual([]);
    b.expectWarning("same_asset_two_accounts");
    expect([...b.expectedWarnings]).toEqual(["same_asset_two_accounts"]);
    expect(b.unitsFor("500", "123.45")).toBe("4.0502");
    expect(b.unitsFor("300", "100")).toBe("3");
  });

  it("draws the day jitter inside [1, 5]", () => {
    const b = new ScenarioBuilder(new Prng(9));
    for (let i = 0; i < 50; i += 1) {
      const day = b.day();
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(5);
    }
  });
});

describe("calendar", () => {
  it("counts months from 2026-09 and adds days across month and year ends", () => {
    expect(monthAt(0)).toEqual({ year: 2026, month: 9 });
    expect(monthAt(3)).toEqual({ year: 2026, month: 12 });
    expect(monthAt(4)).toEqual({ year: 2027, month: 1 });
    expect(monthAt(27)).toEqual({ year: 2028, month: 12 });
    expect(dateOf(2027, 1, 5)).toBe("2027-01-05");
    expect(addDays("2027-12-30", 3)).toBe("2028-01-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});
