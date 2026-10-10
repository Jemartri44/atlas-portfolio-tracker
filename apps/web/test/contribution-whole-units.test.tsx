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
import { ContributionCard } from "../src/routes/cartera/ContributionCard.jsx";
import Cartera from "../src/routes/cartera/index.jsx";
import { contributionView } from "../src/view-models/core/index.js";
import { totalLeftover, unitPricesOf, wholeUnitsFor } from "../src/view-models/core/whole-units.js";
import { goldenEvents, goldenText } from "./helpers/golden.js";
import { openLedger, show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const DATE = "2029-01-10";
/**
 * The golden ledger with every asset bought by the unit (the funds of the
 * fixture would show no figure) and no staleness limit (every price of the
 * fixture is old at the date of the card).
 */
const asEtfs = (): string =>
  goldenText()
    .split("\n")
    .map((line) => {
      if (line.length === 0) {
        return line;
      }
      const event = JSON.parse(line);
      delete event.settings?.stale_price_days;
      return JSON.stringify(event).replace(/"asset_type":"[a-z_]+"/g, '"asset_type":"etf"');
    })
    .join("\n");

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
    await openLedger(asEtfs());
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
    await openLedger(asEtfs());
    store.setPrivacy(true);
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    const line = host.querySelector("[data-testid=whole-units]");
    expect(line?.querySelectorAll(".mask").length).toBe(2);
    store.setPrivacy(false);
  });
});

const row = (id: string, price: Partial<PriceLookup> | undefined): CoreWeightRow =>
  ({
    asset_id: id,
    ...(price === undefined
      ? {}
      : {
          price: {
            currency: "EUR",
            stale: false,
            unit_value_eur: eur("10"),
            ...price,
          },
        }),
  }) as unknown as CoreWeightRow;

describe("unitPricesOf (fail safe)", () => {
  const types = new Map([
    ["a", "etf"],
    ["b", "stock"],
    ["c", "etc"],
    ["d", "etp"],
    ["f", "fund"],
    ["m", "money_market"],
    ["k", "crypto"],
  ]);

  it("keeps an exact, fresh price in euros of an asset bought by the unit", () => {
    const prices = unitPricesOf(
      ["a", "b", "c", "d"].map((id) => row(id, {})),
      types,
    );
    expect([...prices.keys()]).toEqual(["a", "b", "c", "d"]);
  });

  it("drops funds, money-market funds and crypto, which take fractions", () => {
    expect(
      unitPricesOf(
        ["f", "m", "k"].map((id) => row(id, {})),
        types,
      ).size,
    ).toBe(0);
  });

  it("drops a stale price, an approximated one, a foreign currency and a missing value", () => {
    const rows = [
      row("a", { stale: true }),
      row("b", { approximate: true }),
      row("c", { currency: "USD" }),
      row("d", { unit_value_eur: undefined }),
      row("a", undefined),
    ];
    expect(unitPricesOf(rows, types).size).toBe(0);
  });

  it("drops an asset the catalogue does not type", () => {
    expect(unitPricesOf([row("zz", {})], types).size).toBe(0);
  });
});

describe("the total with an idle row", () => {
  it("is not cancelled by an idle row without a price", () => {
    const plan = goldenPlan();
    const active = plan.rows.filter((r) => !r.allocation_eur.isZero());
    const idle = {
      ...(plan.rows[0] as ContributionPlan["rows"][0]),
      asset_id: "ast_idle",
      allocation_eur: eur("0"),
    };
    const prices = new Map(active.map((r) => [r.asset_id, eur("37")] as const));
    const view = contributionView({ ...plan, rows: [...plan.rows, idle] }, undefined, prices);
    expect(view.rows.at(-1)?.idle).toBe(true);
    expect(view.wholeLeftover).toBeDefined();
  });
});

describe("the card, further", () => {
  it("masks the total phrase with the privacy mode on and shows it with it off", async () => {
    const plan = goldenPlan();
    const prices = new Map(plan.rows.map((r) => [r.asset_id, eur("37")] as const));
    const view = contributionView(plan, undefined, prices);
    expect(view.wholeLeftover).toBeDefined();
    const screen = () => <ContributionCard view={view} error={undefined} />;
    store.setPrivacy(true);
    const masked = await show("/", screen);
    const note = masked.querySelector("[data-testid=whole-leftover]");
    expect(text(note)).toContain("sobrarían");
    expect(note?.querySelector(".mask")).not.toBeNull();
    store.setPrivacy(false);
    const shown = await show("/", screen);
    const open = shown.querySelectorAll("[data-testid=whole-leftover]");
    expect(open[open.length - 1]?.querySelector(".mask")).toBeNull();
  });

  it("names the units of each asset, not a fixed word", async () => {
    await openLedger(asEtfs());
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    const lines = [...host.querySelectorAll("[data-testid=whole-units]")].map((l) => text(l));
    expect(lines.every((l) => /(part\.|acc\.|uds\.)/.test(l))).toBe(true);
  });

  it("shows no figure when the assets are funds, which take fractions", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    expect(host.querySelector("[data-testid=whole-units]")).toBeNull();
    expect(host.querySelector("[data-testid=whole-leftover]")).toBeNull();
  });
});
