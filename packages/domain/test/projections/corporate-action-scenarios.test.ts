// Corporate actions crossed with the rest of a ledger: purchases and sales
// before and after the effective date, several accounts, fractions, a sale
// recorded late, annulments, and the tax consequences. The unit rows of
// data-schema.md §8.5 are in `corporate-actions.test.ts`; here the figures are
// worked out by hand for the whole sequence.

import { describe, expect, it } from "vitest";
import { cashBalances } from "../../src/projections/cash.js";
import { integrity } from "../../src/projections/integrity.js";
import { fiscalLots, openQuantity } from "../../src/projections/lots.js";
import { physicalPositions } from "../../src/projections/positions.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { LedgerState } from "../../src/projections/state.js";
import type { Effect, LedgerEvent } from "../../src/schema/events.js";
import { checkInvalid } from "../../src/usecases/record-event.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { buy, lineOf, reportOf, sell, taxBuilder, text } from "../tax/helpers.js";

const openLots = (state: LedgerState, asset: string) =>
  fiscalLots(state, asset)
    .filter((lot) => !lot.closed)
    .map((lot) => `${lot.quantity}@${lot.cost_eur.amount} on ${lot.acquisition_date}`);

const positions = (state: LedgerState): string[] =>
  physicalPositions(state).map((p) => `${p.account_id}|${p.asset_id}=${p.quantity}`);

const gains = (state: LedgerState): string[] =>
  state.gains.map(
    (g) =>
      `${g.account_id}:${g.quantity}@${g.proceeds_eur.amount}-${g.cost_eur.amount}=${g.gain_eur_rounded.amount}`,
  );

const cash = (state: LedgerState): string[] =>
  cashBalances(state)
    .map((c) => `${c.account_id}=${c.balance.amount}`)
    .sort();

const forcedSale = (
  per_account: { account_id: string; quantity: string }[],
  unit_price: string,
  date: string,
): Effect => ({
  op: "forced_sale",
  per_account,
  unit_price,
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: date,
});

describe("a split between purchases and sales in two accounts", () => {
  /**
   * Account A buys 10 at 100 and B buys 10 at 120; A sells 4 at 130 before the
   * split; the 4:1 split of 1 March; A buys 5 at 50 and B sells 30 at 40
   * after it. FIFO runs over the asset, not the account: B's 30 units take
   * the 24 left of A's first lot (25 € each) and 6 of its own (30 € each).
   */
  const ledger = (earlySaleRecordedLate: boolean): LedgerEvent[] => {
    const b = taxBuilder();
    b.buy({ account_id: "acc_a", asset_id: "stock_s", value_date: "2027-01-11" });
    b.buy({
      account_id: "acc_b",
      asset_id: "stock_s",
      value_date: "2027-02-01",
      unit_price: "120",
    });
    const early = () =>
      b.sell({
        account_id: "acc_a",
        asset_id: "stock_s",
        value_date: "2027-02-15",
        quantity: "4",
        unit_price: "130",
      });
    if (!earlySaleRecordedLate) {
      early();
    }
    b.corporateAction({
      kind: "split",
      asset_id: "stock_s",
      effective_date: "2027-03-01",
      effects: [{ op: "scale", ratio: "4" }],
    });
    b.buy({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2027-03-10",
      quantity: "5",
      unit_price: "50",
    });
    b.sell({
      account_id: "acc_b",
      asset_id: "stock_s",
      value_date: "2027-04-01",
      quantity: "30",
      unit_price: "40",
    });
    if (earlySaleRecordedLate) {
      early();
    }
    return b.build();
  };

  it.each([
    ["in order", false],
    ["with the sale before the split recorded after everything else", true],
  ])("gives the same lots, positions and gains %s", (_, late) => {
    const state = projectLedger(ledger(late));
    expect(state.invalid).toEqual([]);
    expect(gains(state)).toEqual(["acc_a:4@520-400=120", "acc_b:30@1200-780=420"]);
    expect(openLots(state, "stock_s")).toEqual(["34@1020 on 2027-02-01", "5@250 on 2027-03-10"]);
    expect(positions(state)).toEqual(["acc_a|stock_s=29", "acc_b|stock_s=10"]);
    expect(integrity(state)).toEqual([]);
  });

  it("refuses to annul what later events stand on, and lets the last sale go", () => {
    const b = taxBuilder();
    const first = b.buy({ account_id: "acc_a", asset_id: "stock_s", value_date: "2027-01-11" });
    const split = b.corporateAction({
      kind: "split",
      asset_id: "stock_s",
      effective_date: "2027-03-01",
      effects: [{ op: "scale", ratio: "4" }],
    });
    const last = b.sell({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2027-04-01",
      quantity: "30",
      unit_price: "40",
    });
    const events = b.build();
    const annul = (id: string): ReturnType<typeof checkInvalid> => {
      const reversal = new LedgerBuilder(1000).reversal(id);
      return checkInvalid(events, reversal, {});
    };
    expect(() => annul(split.id)).toThrow(/less than 30/);
    expect(() => annul(first.id)).toThrow(/holds 0 of stock_s, less than 30/);
    expect(annul(last.id).affected).toEqual([]);
  });
});

describe("a reverse split with cash in lieu across two accounts", () => {
  /**
   * A holds 10 and B holds 7, bought at 100. One for four leaves 2,5 and 1,75;
   * the fractions 0,5 and 0,75 are paid at 400. The fractions are taken from
   * the first lot, whoever holds them, so the cash in lieu books no gain.
   */
  const events = (after: (b: LedgerBuilder) => void = () => undefined): LedgerEvent[] => {
    const b = taxBuilder();
    b.buy({ account_id: "acc_a", asset_id: "stock_s", value_date: "2027-01-11" });
    b.buy({
      account_id: "acc_b",
      asset_id: "stock_s",
      value_date: "2027-01-12",
      quantity: "7",
    });
    b.corporateAction({
      kind: "reverse_split",
      asset_id: "stock_s",
      effective_date: "2027-05-03",
      effects: [
        { op: "scale", ratio: "1/4" },
        forcedSale(
          [
            { account_id: "acc_a", quantity: "0.5" },
            { account_id: "acc_b", quantity: "0.75" },
          ],
          "400",
          "2027-05-03",
        ),
      ],
    });
    after(b);
    return b.build();
  };

  it("sells afterwards from the lot the fractions came out of", () => {
    const state = projectLedger(
      events((b) =>
        b.sell({
          account_id: "acc_a",
          asset_id: "stock_s",
          value_date: "2027-06-10",
          quantity: "1",
          unit_price: "500",
        }),
      ),
    );
    expect(state.invalid).toEqual([]);
    expect(gains(state).at(-1)).toBe("acc_a:1@500-400=100");
    expect(openLots(state, "stock_s")).toEqual([
      "0.25@100 on 2027-01-11",
      "1.75@700 on 2027-01-12",
    ]);
    expect(integrity(state)).toEqual([]);
  });

  it("books no cash in lieu when the holding divides exactly", () => {
    const b = taxBuilder();
    b.buy({ account_id: "acc_a", asset_id: "stock_s", value_date: "2027-01-11", quantity: "8" });
    b.corporateAction({
      kind: "reverse_split",
      asset_id: "stock_s",
      effective_date: "2027-05-03",
      effects: [{ op: "scale", ratio: "1/4" }],
    });
    const state = projectLedger(b.build());
    expect(positions(state)).toEqual(["acc_a|stock_s=2"]);
    expect(openLots(state, "stock_s")).toEqual(["2@800 on 2027-01-11"]);
    expect(state.gains).toEqual([]);
  });
});

describe("shares received for nothing and the two-month rule", () => {
  /** 10 bought at 100 on 11 January; 5 sold at 80 on 15 March: a loss of 100. */
  const lossLedger = () => {
    const b = taxBuilder();
    buy(b, "stock_s", "2027-01-11", "10", "100");
    const loss = sell(b, "stock_s", "2027-03-15", "5", "80");
    return { b, loss };
  };

  it("a stock dividend inside the window is not a repurchase: nothing is deferred", () => {
    const { b, loss } = lossLedger();
    b.corporateAction({
      kind: "stock_dividend",
      asset_id: "stock_s",
      effective_date: "2027-03-20",
      effects: [{ op: "scale", ratio: "1.1" }],
    });
    const events = b.build();
    const line = lineOf(reportOf(events, 2027), loss.id);
    expect(text(line.deferred_eur.roundToCents())).toBe("0");
    expect(text(line.computable_eur.roundToCents())).toBe("-100");
    const state = projectLedger(events);
    expect(openLots(state, "stock_s")).toEqual(["5.5@500 on 2027-01-11"]);
    expect(state.warnings.map((warning) => warning.code)).not.toContain(
      "wash_sale_window_repurchase",
    );
  });

  it("shares granted with a cost inside the window are: the loss is deferred in proportion", () => {
    const { b, loss } = lossLedger();
    b.corporateAction({
      kind: "stock_dividend",
      asset_id: "stock_s",
      effective_date: "2027-03-20",
      effects: [
        {
          op: "grant",
          per_account: [{ account_id: "acc_a", quantity: "2" }],
          unit_cost: "50",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-03-19",
          acquisition_date: "2027-03-20",
        },
      ],
    });
    const events = b.build();
    // 2 of the 5 units sold come back: 2/5 of the 100 € loss.
    const line = lineOf(reportOf(events, 2027), loss.id);
    expect(text(line.deferred_eur.roundToCents())).toBe("-40");
    expect(text(line.computable_eur.roundToCents())).toBe("-60");
    expect(projectLedger(events).warnings.map((warning) => warning.code)).toContain(
      "wash_sale_window_repurchase",
    );
  });

  it("shares granted with no cost are not", () => {
    const { b, loss } = lossLedger();
    b.corporateAction({
      kind: "stock_dividend",
      asset_id: "stock_s",
      effective_date: "2027-03-20",
      effects: [
        {
          op: "grant",
          per_account: [{ account_id: "acc_a", quantity: "2" }],
          unit_cost: "0",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2027-03-19",
          acquisition_date: "2027-03-20",
        },
      ],
    });
    const line = lineOf(reportOf(b.build(), 2027), loss.id);
    expect(text(line.deferred_eur.roundToCents())).toBe("0");
  });
});

describe("fractions and ratios that do not divide, and one that does", () => {
  const quantities = [
    ["acc_a", "0.333333"],
    ["acc_b", "1.5"],
    ["acc_a", "2.000001"],
    ["acc_b", "0.000007"],
  ] as const;

  it.each(["1/3", "2/7", "7/3", "1/1000000", "3"])(
    "a split of %s leaves lots and positions that add up",
    (ratio) => {
      const b = taxBuilder();
      quantities.forEach(([account_id, quantity], index) => {
        b.buy({
          account_id,
          asset_id: "stock_s",
          value_date: `2027-01-${String(10 + index)}`,
          quantity,
          unit_price: "7",
        });
      });
      b.corporateAction({
        kind: "split",
        asset_id: "stock_s",
        effective_date: "2027-03-01",
        effects: [{ op: "scale", ratio }],
      });
      const state = projectLedger(b.build());
      expect(state.invalid).toEqual([]);
      expect(integrity(state)).toEqual([]);
      const cost = fiscalLots(state, "stock_s").reduce(
        (sum, lot) => sum + Number(lot.cost_eur.amount),
        0,
      );
      // The cost is spread, never created or lost, and the units follow the ratio.
      expect(cost).toBeCloseTo(7 * 3.833341, 6);
      const [numerator, denominator = "1"] = ratio.split("/");
      const expected = (3.833341 * Number(numerator)) / Number(denominator);
      expect(Number(openQuantity(state, "stock_s").toString())).toBeCloseTo(expected, 5);
    },
  );
});

describe("a purchase recorded after the merger it predates", () => {
  it("is converted with the rest, in its own account", () => {
    const b = taxBuilder();
    b.asset("stock_new", { asset_type: "stock", transferable: false });
    b.buy({ account_id: "acc_a", asset_id: "stock_s", value_date: "2027-01-11" });
    b.corporateAction({
      kind: "merger",
      asset_id: "stock_s",
      effective_date: "2027-03-01",
      effects: [{ op: "convert", to_asset_id: "stock_new", ratio: "1/2" }],
    });
    b.buy({
      account_id: "acc_b",
      asset_id: "stock_s",
      value_date: "2027-02-01",
      quantity: "4",
      unit_price: "110",
    });
    const state = projectLedger(b.build());
    expect(state.invalid).toEqual([]);
    expect(positions(state)).toEqual(["acc_a|stock_new=5", "acc_b|stock_new=2"]);
    expect(openLots(state, "stock_new")).toEqual(["5@1000 on 2027-01-11", "2@440 on 2027-02-01"]);
    expect(openLots(state, "stock_s")).toEqual([]);
    expect(integrity(state)).toEqual([]);
  });
});
