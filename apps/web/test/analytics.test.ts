// The presentation layer of Núcleo and Cubo, as pure functions over the golden
// ledger. No DOM: what is tested here is the mapping, and above all **that the
// figures are the ones the domain gives at the date asked**.

import {
  bucketPositions,
  bucketStats,
  bucketTheses,
  contributionPlan,
  coreWeights,
  costSummary,
  netWorth,
  netWorthSeries,
  projectLedger,
  settingsAt,
  simulateTransfer,
} from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { nameIndex } from "../src/format/names.js";
import {
  bucketPositionsView,
  bucketReportView,
  thesesView,
} from "../src/view-models/bucket/index.js";
import {
  contributionView,
  costsView,
  transferView,
  weightsView,
} from "../src/view-models/core/index.js";
import { openOrderOptions, openTransferOptions } from "../src/view-models/options.js";
import { netWorthPlot, pointsIn, secondsOf, windowOf } from "../src/view-models/series.js";
import { goldenEvents } from "./helpers/golden.js";

const EVENTS = goldenEvents();

/** The ledger cut at a date, exactly as the screens read it (ADR-0016). */
const at = (date: string) => {
  const state = projectLedger(EVENTS, { collectErrors: true, asOf: date });
  return { state, settings: settingsAt(state, date).settings, names: nameIndex(state) };
};

const FULL = "2027-01-31";
const PARTIAL = "2027-06-30";

describe("Núcleo: weights", () => {
  it("carries the figures of coreWeights, with the names of the catalogue", () => {
    const { state, settings, names } = at(FULL);
    const view = weightsView(coreWeights(state, FULL, settings), names);

    const equity = view.classes.find((row) => row.assetClass === "equity");
    const domain = coreWeights(state, FULL, settings).by_class.find(
      (row) => row.asset_class === "equity",
    );
    expect(equity?.label).toBe("Renta variable");
    expect(equity?.weightPct).toBe(domain?.weight_pct?.toString());
    expect(equity?.targetPct).toBe("55");
    // Unrounded: rounding happens once, when the figure is shown (ADR-0005).
    // `atlas weights --date 2027-01-31` prints the same number as 8014.16.
    expect(view.total.amount.toString()).toBe("8014.158644594");
    expect(view.total.roundToCents().amount.toString()).toBe("8014.16");
    expect(view.partial).toBe(false);
    // Names, never identifiers (V7 of the 006).
    expect(view.classes.flatMap((row) => row.rows).map((row) => row.name)).toContain(
      "World Index Fund",
    );
  });

  /**
   * The defence against the blocking defect of feature 004: the quantities have
   * to come from the ledger **cut at the date**, not from the end of it. Two
   * different dates must give two different tables.
   */
  it("reads different quantities at different dates", () => {
    const early = at("2026-12-31");
    const late = at("2028-12-31");
    const quantityOf = (context: ReturnType<typeof at>, date: string, asset: string) =>
      weightsView(coreWeights(context.state, date, context.settings), context.names)
        .classes.flatMap((row) => row.rows)
        .find((row) => row.assetId === asset)?.quantity;

    expect(quantityOf(early, "2026-12-31", "ast_world")).toBe("26.9016");
    expect(quantityOf(late, "2028-12-31", "ast_world")).toBe("127.4196");
  });

  it("marks the rows the domain flagged, and does not decide it again", () => {
    const { state, settings, names } = at(FULL);
    const weights = coreWeights(state, FULL, settings);
    const view = weightsView(weights, names);

    const flagged = new Set(
      weights.warnings
        .filter((warning) => warning.code === "deviation_above_threshold")
        .map((warning) => warning.details.asset_id),
    );
    const marked = view.classes
      .flatMap((row) => row.rows)
      .filter((row) => row.offTarget)
      .map((row) => row.assetId);

    expect(new Set(marked)).toEqual(flagged);
  });

  it("says what is missing, by name, when the core is partial", () => {
    const { state, settings, names } = at(PARTIAL);
    const view = weightsView(coreWeights(state, PARTIAL, settings), names);

    expect(view.partial).toBe(true);
    expect(view.missing).toContain("Small Cap Index Fund");
    expect(view.classes.every((row) => row.weightPct === undefined)).toBe(true);
  });
});

describe("Núcleo: contribution", () => {
  it("keeps the bucket budget apart from the core amount", () => {
    const { state, settings, names } = at(FULL);
    const view = contributionView(contributionPlan(state, { date: FULL, settings }), names);

    expect(view.amount.amount.toString()).toBe("600");
    expect(view.bucketBudget.amount.toString()).toBe("60");
    expect(view.coreAmount.amount.toString()).toBe("540");
    expect(view.fromSettings).toBe(true);
    // The split adds up to the core amount, exactly (business rule 2).
    const sum = view.rows
      .map((row) => Number(row.allocation.amount.toString()))
      .reduce((total, value) => total + value, 0);
    expect(sum).toBeCloseTo(540, 6);
  });

  it("refuses, with its code, when a core asset held has no price", () => {
    const { state, settings } = at(PARTIAL);
    expect(() => contributionPlan(state, { date: PARTIAL, settings })).toThrow(
      expect.objectContaining({ code: "missing_manual_prices" }),
    );
  });
});

describe("Núcleo: transfer simulator", () => {
  it("shows the weights before and after, and never calls it taxable", () => {
    const { state, settings, names } = at(FULL);
    const view = transferView(
      simulateTransfer(state, {
        from_asset_id: "ast_mm",
        to_asset_id: "ast_world",
        quantity: "5",
        date: FULL,
        settings,
      }),
      names,
    );

    expect(view.fromName).toBe("Money Market Fund");
    expect(view.toName).toBe("World Index Fund");
    const world = view.rows.find((row) => row.assetId === "ast_world");
    expect(world?.role).toBe("to");
    expect(Number(world?.weightAfterPct)).toBeGreaterThan(Number(world?.weightBeforePct));
    const mm = view.rows.find((row) => row.assetId === "ast_mm");
    expect(Number(mm?.weightAfterPct)).toBeLessThan(Number(mm?.weightBeforePct));
  });
});

describe("Núcleo: costs", () => {
  it("shows the standalone charges apart from the commissions of a trade", () => {
    const { state, settings, names } = at("2027-12-31");
    const view = costsView(costSummary(state, EVENTS, "2027-12-31", settings, "2027-12-31"), names);

    expect(view.standalone.rows.length).toBeGreaterThan(0);
    expect(view.standalone.rows[0]?.name).not.toMatch(/^acc_/);
    // The two are never added together.
    expect(view.core.fees.amount.toString()).not.toBe(view.standalone.core.amount.toString());
  });
});

describe("Cubo", () => {
  it("gives each position its weight inside the bucket, never against the core", () => {
    const date = "2028-12-31";
    const { state, settings, names } = at(date);
    const view = bucketPositionsView(bucketPositions(state, date, settings), names);

    const priced = view.rows.filter((row) => row.value !== undefined);
    expect(priced.length).toBeGreaterThan(0);
    if (!view.partial) {
      const sum = priced.reduce((total, row) => total + Number(row.weightPct ?? 0), 0);
      expect(sum).toBeCloseTo(100, 6);
    }
  });

  it("does not compute a weight inside the bucket while the bucket total is partial", () => {
    const date = "2027-12-31";
    const { state, settings, names } = at(date);
    const view = bucketPositionsView(bucketPositions(state, date, settings), names);

    expect(view.partial).toBe(true);
    expect(view.rows.every((row) => row.weightPct === undefined)).toBe(true);
  });

  /**
   * The definition that was got wrong once: the latent term is the **latent
   * gain**, not the value of the position. A thesis matching the index exactly
   * would otherwise show a difference equal to everything invested.
   */
  it("consumes the result against the index instead of recomputing it", () => {
    const date = "2027-12-31";
    const { state, settings, names } = at(date);
    const domain = bucketTheses(state, date, settings);
    const view = thesesView(domain, names);

    for (const thesis of domain.rows) {
      const row = view.rows.find((entry) => entry.thesisId === thesis.thesis_id);
      expect(row?.vsIndex?.amount.toString()).toBe(thesis.result_vs_index_eur?.amount.toString());
      expect(row?.unrealized?.amount.toString()).toBe(thesis.unrealized_eur?.amount.toString());
    }
  });

  it("says a comparison is missing and why, instead of printing a zero", () => {
    const date = "2027-12-31";
    const { state, settings, names } = at(date);
    const view = thesesView(bucketTheses(state, date, settings), names);

    const missing = view.rows.filter((row) => row.vsIndex === undefined);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((row) => row.gap !== undefined)).toBe(true);
  });

  it("carries the statistics and the control rules, with the unmeasured ones named", () => {
    const date = "2028-12-31";
    const { state, settings, names } = at(date);
    const view = bucketReportView(bucketStats(state, EVENTS, date, settings, date), names);

    expect(view.stats.closedTheses).toBeGreaterThan(0);
    expect(view.stats.fees.amount.toString()).not.toBe("");
    // Either it was measured, or the reason is there. Never both absent.
    expect(
      view.controls.weightPct !== undefined || view.controls.weightUnavailable !== undefined,
    ).toBe(true);
  });
});

describe("the series, as uPlot eats them", () => {
  it("turns an absent block into a null and counts what can be drawn", () => {
    const { names } = at("2028-12-31");
    const plot = netWorthPlot(netWorthSeries(EVENTS, { to: "2028-12-31", max_points: 40 }), names);

    expect(plot.x.length).toBe(plot.rows.length);
    expect(plot.values).toHaveLength(3);
    expect(plot.values[0]?.some((value) => value === null)).toBe(true);
    expect(plot.drawn).toBeLessThan(plot.total);
    expect(plot.missing).toContain("No se interpola");
  });

  it("agrees with netWorth at every date it draws", () => {
    const series = netWorthSeries(EVENTS, { to: "2028-12-31", max_points: 12 });
    for (const point of series.points) {
      const { state, settings } = at(point.date);
      const worth = netWorth(state, point.date, settings);
      expect(point.core_eur?.amount.toString()).toBe(
        worth.core.partial ? undefined : worth.core.total_eur.amount.toString(),
      );
    }
  });

  it("counts the points inside a range, which is what disables a button", () => {
    const last = secondsOf("2028-12-31");
    const x = ["2027-06-30", "2028-11-30", "2028-12-31"].map(secondsOf);

    expect(pointsIn(x, windowOf("TODO", last))).toBe(3);
    expect(pointsIn(x, windowOf("1A", last))).toBe(2);
    expect(pointsIn(x, windowOf("1M", last))).toBe(2);
  });
});

describe("the option hints of the forms", () => {
  /**
   * A form is filled against the **whole** ledger, which can hold an event dated
   * ahead of today: a purchase with next week's value date is normal. The age of
   * an open order or request is then negative, and "-780 días" is not an age,
   * it is a subtraction shown by mistake.
   */
  it("never prints a negative age", () => {
    const state = projectLedger(EVENTS, { collectErrors: true });
    const early = "2026-09-18";

    for (const hint of [
      ...openOrderOptions(state, early).map((option) => option.hint ?? ""),
      ...openTransferOptions(state, early).map((option) => option.hint ?? ""),
    ]) {
      expect(hint).not.toMatch(/-\d+ días/);
      expect(hint.length).toBeGreaterThan(0);
    }
  });

  it("still says how old something is when it is genuinely open", () => {
    const state = projectLedger(EVENTS, { collectErrors: true });
    const hints = openTransferOptions(state, "2029-01-31").map((option) => option.hint ?? "");
    expect(hints.some((hint) => /\d+ días/.test(hint))).toBe(true);
  });
});
