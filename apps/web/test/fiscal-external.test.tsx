// @vitest-environment happy-dom
//
// Savings income from outside the portfolio on the fiscal screen (criterion
// #28): it is in the estimate of the quota, said apart as something the tax
// data already bring, and never in the boxes of the portfolio.

import { type LedgerEvent, projectLedger } from "@atlas/domain";
import { taxYear } from "@atlas/domain/fiscal";
import { describe, expect, it } from "vitest";
import { quotaOf } from "../src/routes/fiscal/estimates.js";
import { EstimateCards } from "../src/routes/fiscal/QuotaCard.jsx";
import { goldenEvents } from "./helpers/golden.js";
import { show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const dividend: LedgerEvent = {
  schema_version: 1,
  id: "01MZZZZZZZZZZZZZZZZZZZZZZ1",
  recorded_at: "2029-01-05T10:00:00.000Z",
  type: "external_income",
  kind: "dividend",
  value_date: "2028-06-30",
  gross_eur: "1000",
  withholding_eur: "190",
  payer: "Mi empresa SL",
  fingerprint: "sha256:external",
} as LedgerEvent;

describe("income from outside the portfolio", () => {
  it("enters the estimate, said apart, and leaves the report of the portfolio alone", async () => {
    const events = [...goldenEvents(), dividend];
    const options = { today: "2029-06-01" };
    const report = taxYear(events, 2028, options);
    // The portfolio's base is the golden one: 99.28.
    expect(report.base_eur.centsText()).toBe("99.28");
    // 99.28 + 1,000 = 1,099.28 at 19 %: 104.43 a half, 208.86 in all; 4.59 + 190 withheld.
    const estimate = quotaOf(projectLedger(events), events, report, options);
    expect(estimate.quota.quota_eur?.centsText()).toBe("208.86");
    expect(estimate.quota.withholdings_eur.centsText()).toBe("194.59");
    const host = await show("/", () => <EstimateCards estimate={estimate} />);
    const shown = text(host);
    expect(shown).toMatch(/De esa base, rendimientos de fuera de la cartera1\.000,00/);
    expect(shown).toContain("Ya vienen en tus datos fiscales");
    expect(shown).toContain("modelo 193");
    expect(shown).toContain("Mi empresa SL");
  });

  it("shows no card of its own in a year without any", async () => {
    const events = goldenEvents();
    const options = { today: "2029-06-01" };
    const estimate = quotaOf(
      projectLedger(events),
      events,
      taxYear(events, 2028, options),
      options,
    );
    const host = await show("/", () => <EstimateCards estimate={estimate} />);
    expect(text(host)).not.toContain("Rendimientos de fuera de la cartera");
    expect(text(host)).not.toContain("De esa base");
  });
});
