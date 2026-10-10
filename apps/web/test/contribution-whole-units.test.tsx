// @vitest-environment happy-dom
//
// Whole units on the contribution card: how many whole units the euros of each
// asset would buy at its unit price, and what is left. Informative only (funds
// take fractions); decimal, floor on this figure alone; no price, no figure.

import {
  type ContributionPlan,
  contributionPlan,
  Money,
  projectLedger,
  settingsAt,
} from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { store } from "../src/ledger/state.js";
import Cartera from "../src/routes/cartera/index.jsx";
import { contributionView } from "../src/view-models/core/index.js";
import { totalLeftover, wholeUnitsFor } from "../src/view-models/core/whole-units.js";
import { goldenEvents } from "./helpers/golden.js";
import { show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const DATE = "2029-01-10";
const eur = (amount: string): Money => Money.parse(amount, "EUR");

describe("wholeUnitsFor", () => {
  it("floors the division and leaves the rest: 250 at 100 is 2 units and 50", () => {
    const whole = wholeUnitsFor(eur("250"), eur("100"));
    expect(whole?.units.toString()).toBe("2");
    expect(whole?.leftover.amount.toString()).toBe("50");
  });

  it("buys nothing under one unit and leaves everything", () => {
    const whole = wholeUnitsFor(eur("99.99"), eur("100"));
    expect(whole?.units.toString()).toBe("0");
    expect(whole?.leftover.amount.toString()).toBe("99.99");
  });

  it("buys exactly one at the boundary and leaves nothing", () => {
    const whole = wholeUnitsFor(eur("100"), eur("100"));
    expect(whole?.units.toString()).toBe("1");
    expect(whole?.leftover.amount.toString()).toBe("0");
  });

  it("does not let the 10-decimal rounding of the division buy a unit it cannot pay", () => {
    // 299.99999999999 / 100 rounds to 3.0000000000 in 10 decimals.
    const whole = wholeUnitsFor(eur("299.99999999999"), eur("100"));
    expect(whole?.units.toString()).toBe("2");
    expect(whole?.leftover.amount.toString()).toBe("99.99999999999");
  });

  it("works with a unit price of many decimals, in decimal", () => {
    const whole = wholeUnitsFor(eur("10"), eur("0.3333"));
    expect(whole?.units.toString()).toBe("30");
    expect(whole?.leftover.amount.toString()).toBe("0.001");
  });

  it("gives nothing without a price, with a zero price or with a negative allocation", () => {
    expect(wholeUnitsFor(eur("100"), undefined)).toBeUndefined();
    expect(wholeUnitsFor(eur("100"), eur("0"))).toBeUndefined();
    expect(wholeUnitsFor(eur("-1"), eur("10"))).toBeUndefined();
  });
});

describe("totalLeftover", () => {
  it("adds the leftovers only when every row has its figure", () => {
    const a = wholeUnitsFor(eur("250"), eur("100"));
    const b = wholeUnitsFor(eur("30"), eur("20"));
    expect(totalLeftover([a, b])?.amount.toString()).toBe("60");
    expect(totalLeftover([a, undefined])).toBeUndefined();
    expect(totalLeftover([])).toBeUndefined();
  });
});

const goldenPlan = (): ContributionPlan => {
  const state = projectLedger(goldenEvents(), { asOf: DATE });
  return contributionPlan(state, { date: DATE, settings: settingsAt(state, DATE).settings });
};

describe("contributionView with unit prices", () => {
  it("attaches the whole units to the rows that have a price and the total when all do", () => {
    const plan = goldenPlan();
    const prices = new Map(plan.rows.map((row) => [row.asset_id, eur("37")] as const));
    const view = contributionView(plan, undefined, prices);
    for (const row of view.rows) {
      expect(row.whole).toBeDefined();
      const spent = row.whole?.units.value.mul(eur("37").amount);
      expect(spent?.add(row.whole?.leftover.amount ?? eur("0").amount).toString()).toBe(
        row.allocation.amount.toString(),
      );
    }
    expect(view.wholeLeftover).toBeDefined();
  });

  it("leaves the row without a price bare and gives no total", () => {
    const plan = goldenPlan();
    const active = plan.rows.filter((row) => !row.allocation_eur.isZero());
    expect(active.length).toBeGreaterThan(1);
    const prices = new Map([[active[0]?.asset_id as string, eur("37")]]);
    const view = contributionView(plan, undefined, prices);
    expect(view.rows.filter((row) => row.whole !== undefined)).toHaveLength(1);
    expect(view.wholeLeftover).toBeUndefined();
  });

  it("shows nothing without prices", () => {
    const view = contributionView(goldenPlan());
    expect(view.rows.every((row) => row.whole === undefined)).toBe(true);
    expect(view.wholeLeftover).toBeUndefined();
  });
});

describe("the card of the contribution, whole units", () => {
  it("says, per asset, the whole units and what is left, and that funds take fractions", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    const card = [...host.querySelectorAll("section.card")].find((section) =>
      text(section.querySelector("h2")).startsWith("Aportación de"),
    );
    const lines = [...(card?.querySelectorAll("[data-testid=whole-units]") ?? [])];
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(text(line)).toMatch(/enteras:.*part.*sobran.*€/);
    }
    expect(text(card?.querySelector("[data-testid=whole-leftover]"))).toContain(
      "los fondos admiten fracciones",
    );
  });

  it("masks the units and the leftover with the privacy mode on", async () => {
    store.setPrivacy(true);
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    const line = host.querySelector("[data-testid=whole-units]");
    expect(line?.querySelectorAll(".mask").length).toBe(2);
    store.setPrivacy(false);
  });
});
