// The average balance of the fourth quarter, fixed to the cent on ledgers that
// stress the day-by-day reading of the cash (voided events, accounts recorded
// late, country and activity changes, several currencies, period boundaries) and
// on the synthetic ledger. The figures were taken before the cash was read in
// one pass instead of one projection per day, and must not move.

import { describe, expect, it } from "vitest";
import { quarterAverages } from "../../src/informative/balances.js";
import { accountsAt } from "../../src/informative/holdings.js";
import { generateLedger } from "../../src/synth/scenario.js";
import { handScenarios, type Scenario } from "./balances-scenarios.js";

type Row = [
  scenario: string,
  year: number,
  key: string,
  average: string,
  days: number,
  from: string,
];

const EXPECTED: Row[] = [
  ["reversals", 2027, "acc_ib|EUR", "22022.8260869565", 92, "2027-10-01"],
  ["reversals", 2028, "acc_ib|EUR", "23100", 92, "2028-10-01"],
  ["late accounts", 2027, "acc_dec|EUR", "60000", 92, "2027-10-01"],
  ["late accounts", 2027, "acc_late|EUR", "27717.3913043478", 92, "2027-10-01"],
  ["late accounts", 2027, "acc_nov|EUR", "7000", 50, "2027-11-12"],
  ["late accounts", 2028, "acc_dec|EUR", "60000", 92, "2028-10-01"],
  ["late accounts", 2028, "acc_late|EUR", "25000", 92, "2028-10-01"],
  ["late accounts", 2028, "acc_nov|EUR", "7000", 92, "2028-10-01"],
  ["country and activity", 2027, "acc_closed_early|EUR", "0", 92, "2027-10-01"],
  ["country and activity", 2027, "acc_moves|EUR", "60000", 92, "2027-10-01"],
  ["country and activity", 2027, "acc_toggles|EUR", "9260.8695652174", 92, "2027-10-01"],
  ["country and activity", 2028, "acc_closed_early|EUR", "0", 92, "2028-10-01"],
  ["country and activity", 2028, "acc_moves|EUR", "61000", 92, "2028-10-01"],
  ["country and activity", 2028, "acc_toggles|EUR", "12000", 92, "2028-10-01"],
  ["country and activity", 2029, "acc_closed_early|EUR", "0", 92, "2029-10-01"],
  ["country and activity", 2029, "acc_moves|EUR", "61000", 92, "2029-10-01"],
  ["country and activity", 2029, "acc_toggles|EUR", "12000", 92, "2029-10-01"],
  ["several currencies", 2027, "acc_multi|EUR", "31847.8260869565", 92, "2027-10-01"],
  ["several currencies", 2027, "acc_multi|USD", "13090.5869565217", 92, "2027-10-01"],
  ["several currencies", 2028, "acc_multi|EUR", "39999", 92, "2028-10-01"],
  ["several currencies", 2028, "acc_multi|USD", "15385", 92, "2028-10-01"],
  ["period boundaries", 2027, "acc_dec31|EUR", "300", 1, "2027-12-31"],
  ["period boundaries", 2027, "acc_edge|EUR", "1150.8152173913", 92, "2027-10-01"],
  ["period boundaries", 2027, "acc_emptied|EUR", "0", 92, "2027-10-01"],
  ["period boundaries", 2028, "acc_dec31|EUR", "300", 92, "2028-10-01"],
  ["period boundaries", 2028, "acc_edge|EUR", "1225", 92, "2028-10-01"],
  ["period boundaries", 2028, "acc_emptied|EUR", "0", 92, "2028-10-01"],
  ["synthetic", 2026, "acc_bucket|EUR", "100", 92, "2026-10-01"],
  ["synthetic", 2026, "acc_bucket|USD", "1457.6236956522", 92, "2026-10-01"],
  ["synthetic", 2026, "acc_ibkr|EUR", "99.4456521739", 92, "2026-10-01"],
  ["synthetic", 2026, "acc_ibkr|USD", "130.68", 92, "2026-10-01"],
  ["synthetic", 2026, "acc_mi|EUR", "6902.914673913", 92, "2026-10-01"],
  ["synthetic", 2027, "acc_bucket|EUR", "2667.5586956522", 92, "2027-10-01"],
  ["synthetic", 2027, "acc_bucket|USD", "1060.0179891287", 92, "2027-10-01"],
  ["synthetic", 2027, "acc_ibkr2|USD", "574.42", 92, "2027-10-01"],
  ["synthetic", 2027, "acc_ibkr|EUR", "97", 92, "2027-10-01"],
  ["synthetic", 2027, "acc_ibkr|USD", "321.82", 92, "2027-10-01"],
  ["synthetic", 2027, "acc_mi|EUR", "8777.853301087", 92, "2027-10-01"],
  ["synthetic", 2028, "acc_bucket|EUR", "2574.9", 92, "2028-10-01"],
  ["synthetic", 2028, "acc_bucket|USD", "997.6449999972", 92, "2028-10-01"],
  ["synthetic", 2028, "acc_ibkr2|USD", "574.42", 92, "2028-10-01"],
  ["synthetic", 2028, "acc_ibkr|EUR", "94", 92, "2028-10-01"],
  ["synthetic", 2028, "acc_ibkr|USD", "321.82", 92, "2028-10-01"],
  ["synthetic", 2028, "acc_mi|EUR", "10533.3497428261", 92, "2028-10-01"],
];

const SCENARIOS: Scenario[] = [
  ...handScenarios(),
  { name: "synthetic", events: generateLedger({ seed: 1 }), years: [2026, 2027, 2028] },
];

const averagesOf = (scenario: Scenario, year: number): Row[] => {
  const { accounts } = accountsAt(scenario.events, `${year}-12-31`);
  return [...quarterAverages(scenario.events, year, accounts)]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, entry]) => [
      scenario.name,
      year,
      key,
      entry.average.amount.toString(),
      entry.days,
      entry.from,
    ]);
};

describe("quarterAverages keeps its figures", () => {
  it.each(SCENARIOS)("$name", (scenario) => {
    const got = scenario.years.flatMap((year) => averagesOf(scenario, year));
    expect(got).toEqual(EXPECTED.filter(([name]) => name === scenario.name));
  });
});
