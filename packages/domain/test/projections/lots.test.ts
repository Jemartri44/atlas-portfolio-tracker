import { describe, expect, it } from "vitest";
import { ProjectionError } from "../../src/errors.js";
import { Money } from "../../src/money/money.js";
import { Quantity } from "../../src/money/quantity.js";
import { consume, fiscalLots, openLot, openQuantity } from "../../src/projections/lots.js";
import { createEmptyState, type LedgerState } from "../../src/projections/state.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";

const q = (text: string) => Quantity.parse(text);
const eur = (text: string) => Money.parse(text, "EUR");

const lot = (
  state: LedgerState,
  date: string,
  quantity: string,
  cost: string,
  event: string,
  position: number,
  sourceLotId?: string,
) =>
  openLot(state, {
    asset_id: "x",
    acquisition_date: date,
    quantity: q(quantity),
    cost_eur: eur(cost),
    source_event_id: event,
    position,
    ...(sourceLotId === undefined ? {} : { source_lot_id: sourceLotId }),
  });

describe("openLot", () => {
  it("keeps open lots sorted by acquisition date, then file position", () => {
    const state = createEmptyState(DEFAULT_SETTINGS);
    lot(state, "2027-01-10", "10", "1000", "e2", 2);
    lot(state, "2027-01-10", "5", "500", "e1", 1);
    lot(state, "2026-12-01", "1", "50", "e3", 3, "e0#0");
    lot(state, "2027-02-01", "2", "200", "e3", 3);
    expect(fiscalLots(state, "x").map((l) => l.id)).toEqual(["e3#0", "e1#0", "e2#0", "e3#1"]);
    expect(fiscalLots(state, "x")[0]?.source_lot_id).toBe("e0#0");
    expect(openQuantity(state, "x").toString()).toBe("18");
    expect(openQuantity(state, "none").isZero()).toBe(true);
  });
});

describe("consume", () => {
  it("takes whole lots exactly and splits the last one proportionally", () => {
    const state = createEmptyState(DEFAULT_SETTINGS);
    lot(state, "2027-01-10", "3", "100", "e1", 1);
    lot(state, "2027-01-10", "3", "200", "e2", 2);
    const slices = consume(state, "x", q("4"), "sell1");
    expect(slices.map((s) => `${s.lot_id}:${s.quantity}:${s.cost_eur.amount}`)).toEqual([
      "e1#0:3:100",
      "e2#0:1:66.6666666667",
    ]);
    expect(slices[1]?.acquisition_date).toBe("2027-01-10");
    expect(slices[1]?.position).toBe(2);
    const [closed, open] = fiscalLots(state, "x").sort((a, b) => a.id.localeCompare(b.id));
    expect(closed?.closed).toBe(true);
    expect(closed?.quantity.isZero()).toBe(true);
    expect(closed?.consumptions).toHaveLength(1);
    expect(open?.quantity.toString()).toBe("2");
    expect(open?.cost_eur.amount.toString()).toBe("133.3333333333");
    expect(open?.original_cost_eur.amount.toString()).toBe("200");
    expect(openQuantity(state, "x").toString()).toBe("2");
  });

  it("handles many-decimal quantities without rounding the quantity", () => {
    const state = createEmptyState(DEFAULT_SETTINGS);
    lot(state, "2027-01-10", "0.123456789012345678", "10", "e1", 1);
    const [slice] = consume(state, "x", q("0.000000000000000001"), "s");
    expect(slice?.quantity.toString()).toBe("0.000000000000000001");
    expect(openQuantity(state, "x").toString()).toBe("0.123456789012345677");
  });

  it("fails loudly when the open lots do not cover the quantity", () => {
    const state = createEmptyState(DEFAULT_SETTINGS);
    lot(state, "2027-01-10", "1", "100", "e1", 1);
    expect(() => consume(state, "x", q("1.5"), "s")).toThrow(ProjectionError);
    expect(() => consume(state, "y", q("1"), "s")).toThrow(ProjectionError);
    expect(fiscalLots(state)).toHaveLength(1);
  });

  it("lists lots of every asset or of one asset", () => {
    const state = createEmptyState(DEFAULT_SETTINGS);
    lot(state, "2027-01-10", "1", "100", "e1", 1);
    openLot(state, {
      asset_id: "y",
      acquisition_date: "2027-01-10",
      quantity: q("2"),
      cost_eur: eur("50"),
      source_event_id: "e2",
      position: 2,
    });
    expect(fiscalLots(state)).toHaveLength(2);
    expect(fiscalLots(state, "y").map((l) => l.id)).toEqual(["e2#0"]);
  });
});
