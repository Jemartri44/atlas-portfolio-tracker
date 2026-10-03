// @vitest-environment happy-dom
//
// M1 of feature 020 (E3), the contribution of the month: with the amounts
// hidden, the card still says where the money goes — each asset's share of the
// part that goes to the core, and the two parts of the amount as shares of it.
// The shares are computed in decimal and rounded once, when they are shown; a
// share of nothing is no share.

import {
  type ContributionPlan,
  contributionPlan,
  Money,
  projectLedger,
  settingsAt,
} from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { formatPercent } from "../src/format/number.js";
import { store } from "../src/ledger/state.js";
import Cartera from "../src/routes/cartera/index.jsx";
import { contributionView } from "../src/view-models/core/index.js";
import { goldenEvents } from "./helpers/golden.js";
import { show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const DATE = "2029-01-10";

const goldenPlan = (): ContributionPlan => {
  const state = projectLedger(goldenEvents(), { asOf: DATE });
  return contributionPlan(state, { date: DATE, settings: settingsAt(state, DATE).settings });
};

const eur = (amount: string): Money => Money.parse(amount, "EUR");

describe("the shares of the contribution of the month", () => {
  it("are the allocation over the core part, and the parts over the amount, to the full decimal", () => {
    const plan = goldenPlan();
    const view = contributionView(plan);
    const shares = view.rows.map((row) => row.sharePct);
    expect(shares.every((share) => share !== undefined)).toBe(true);
    // The allocations add up to the core part, so their shares add up to 100.
    const total = shares.reduce((sum, share) => sum + Number(share), 0);
    expect(total).toBeCloseTo(100, 6);
    expect(Number(view.corePct) + Number(view.bucketPct)).toBeCloseTo(100, 6);
  });

  it("round once, half-up, when shown: 1,005 is «1,01 %»", () => {
    const plan: ContributionPlan = {
      ...goldenPlan(),
      amount_eur: eur("1000"),
      bucket_budget_eur: eur("0"),
      core_amount_eur: eur("1000"),
      rows: [
        { ...goldenPlan().rows[0], allocation_eur: eur("10.05") } as ContributionPlan["rows"][0],
      ],
    };
    const view = contributionView(plan);
    expect(view.rows[0]?.sharePct).toBe("1.005");
    expect(formatPercent(view.rows[0]?.sharePct, { decimals: 2 })).toBe("1,01 %");
  });

  it("are computed in decimal, not in floating point: 0,07 of 1 is exactly 7", () => {
    const plan: ContributionPlan = {
      ...goldenPlan(),
      amount_eur: eur("1"),
      bucket_budget_eur: eur("0"),
      core_amount_eur: eur("1"),
      rows: [
        { ...goldenPlan().rows[0], allocation_eur: eur("0.07") } as ContributionPlan["rows"][0],
      ],
    };
    expect(contributionView(plan).rows[0]?.sharePct).toBe("7");
  });

  it("do not exist over nothing: a zero core part gives no share per asset", () => {
    const plan: ContributionPlan = { ...goldenPlan(), core_amount_eur: eur("0") };
    const view = contributionView(plan);
    expect(view.rows.every((row) => row.sharePct === undefined)).toBe(true);
  });

  it("do not exist without an amount: no share of the parts", () => {
    const plan: ContributionPlan = { ...goldenPlan(), amount_eur: eur("0") };
    const view = contributionView(plan);
    expect(view.corePct).toBeUndefined();
    expect(view.bucketPct).toBeUndefined();
  });
});

describe("the card of the contribution with the privacy mode on", () => {
  it("puts a share in front of every hidden amount of the split", async () => {
    store.setPrivacy(true);
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    const card = [...host.querySelectorAll("section.card")].find((section) =>
      text(section.querySelector("h2")).startsWith("Aportación de"),
    );
    const rows = [
      ...(card?.querySelectorAll('ul[aria-label="Reparto de la aportación"] > li') ?? []),
    ];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(text(row)).toMatch(/\d[\d.]*(?:,\d+)?\s%/);
      expect(row.querySelector(".mask")).not.toBeNull();
    }
    const kpis = [...(card?.querySelectorAll(".kpi") ?? [])].slice(1);
    for (const kpi of kpis) {
      expect(text(kpi.querySelector("dd .share"))).toMatch(/%$/);
    }
  });

  it("keeps the amounts and the shares with the mode off", async () => {
    const host = await show(`/cartera?fecha=${DATE}`, Cartera);
    const row = host.querySelector('ul[aria-label="Reparto de la aportación"] > li');
    expect(text(row)).toMatch(/%/);
    expect(row?.querySelector(".mask")).toBeNull();
  });
});
