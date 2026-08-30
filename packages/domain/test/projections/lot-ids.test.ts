import { describe, expect, it } from "vitest";
import { Money } from "../../src/money/money.js";
import { Quantity } from "../../src/money/quantity.js";
import { fiscalLots, openLot } from "../../src/projections/lots.js";
import { createEmptyState } from "../../src/projections/state.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";

const lot = (asset_id: string, source_event_id: string) => ({
  asset_id,
  acquisition_date: "2027-01-10",
  quantity: Quantity.parse("1"),
  cost_eur: Money.parse("100", "EUR"),
  source_event_id,
  position: 0,
});

describe("lot ids", () => {
  it("are numbered per source event across assets, so one event never repeats an id", () => {
    const state = createEmptyState(DEFAULT_SETTINGS);
    expect(openLot(state, lot("ast_a", "01E")).id).toBe("01E#0");
    expect(openLot(state, lot("ast_b", "01E")).id).toBe("01E#1");
    expect(openLot(state, lot("ast_a", "01E")).id).toBe("01E#2");
    expect(openLot(state, lot("ast_a", "01F")).id).toBe("01F#0");
    // fiscalLots lists per asset in insertion order: ast_a (#0, #2, then 01F#0) and ast_b (#1).
    expect(fiscalLots(state).map((entry) => entry.id)).toEqual([
      "01E#0",
      "01E#2",
      "01F#0",
      "01E#1",
    ]);
  });
});
