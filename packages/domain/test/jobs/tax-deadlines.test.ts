// The deadlines of the income tax in the monthly reminder: which month says which, and what the
// ledger silences. A year whose order nobody has read never gets a date.

import { describe, expect, it } from "vitest";
import { taxDeadlineFacts } from "../../src/jobs/tax-deadlines.js";
import { incomeTaxDeadlines } from "../../src/tax/income-tax-deadlines.js";

const FIRST = { tax_year: 2025, instalment: "first" } as const;
const SECOND = { tax_year: 2025, instalment: "second" } as const;
const SINGLE = { tax_year: 2025, instalment: "single" } as const;
const FILED = { model: "renta", tax_year: 2025 } as const;

describe("the table of the campaigns", () => {
  it("carries the dates of the Renta of 2025 as the order sets them, with their source", () => {
    expect(incomeTaxDeadlines(2025)).toMatchObject({
      filing_end: "2026-06-30",
      direct_debit_end: "2026-06-25",
      second_instalment: "2026-11-05",
      second_direct_debit_end: "2026-11-02",
      source: { norm: "Orden HAC/277/2026", checked: "2026-11-03" },
    });
    expect(incomeTaxDeadlines(2026)).toBeUndefined();
  });
});

describe("the deadlines of June", () => {
  it("says the end of the campaign and of the direct debit while each is open", () => {
    expect(taxDeadlineFacts("2026-06-01", [], [])).toEqual([
      { kind: "filing", year: 2025, filing_end: "2026-06-30", direct_debit_end: "2026-06-25" },
    ]);
    expect(taxDeadlineFacts("2026-06-25", [], [])[0]).toHaveProperty("direct_debit_end");
    expect(taxDeadlineFacts("2026-06-26", [], [])).toEqual([
      { kind: "filing", year: 2025, filing_end: "2026-06-30" },
    ]);
    expect(taxDeadlineFacts("2026-06-30", [], [])).toHaveLength(1);
  });

  it("stays silent once the ledger says it is filed: a filing, a payment or a refund", () => {
    expect(taxDeadlineFacts("2026-06-01", [], [FILED])).toEqual([]);
    expect(taxDeadlineFacts("2026-06-01", [SINGLE], [])).toEqual([]);
    expect(taxDeadlineFacts("2026-06-01", [FIRST], [])).toEqual([]);
  });

  it("does not take a filing of another year or of another model for it", () => {
    for (const filing of [
      { model: "renta", tax_year: 2024 },
      { model: "720", tax_year: 2025 },
    ] as const) {
      expect(taxDeadlineFacts("2026-06-01", [], [filing])).toHaveLength(1);
    }
    expect(
      taxDeadlineFacts("2026-06-01", [{ tax_year: 2024, instalment: "single" }], []),
    ).toHaveLength(1);
  });

  it("says a year nobody has read as unverified, never with a date", () => {
    expect(taxDeadlineFacts("2027-06-01", [], [])).toEqual([
      { kind: "unverified", year: 2026, deadline: "filing" },
    ]);
  });
});

describe("the second instalment in November", () => {
  it("is said only when the first was paid and the second was not", () => {
    expect(taxDeadlineFacts("2026-11-01", [FIRST], [FILED])).toEqual([
      {
        kind: "second_instalment",
        year: 2025,
        due: "2026-11-05",
        direct_debit_end: "2026-11-02",
      },
    ]);
    expect(taxDeadlineFacts("2026-11-01", [], [FILED])).toEqual([]);
    expect(taxDeadlineFacts("2026-11-01", [SINGLE], [FILED])).toEqual([]);
    expect(taxDeadlineFacts("2026-11-01", [FIRST, SECOND], [FILED])).toEqual([]);
  });

  it("drops the direct debit once it has gone, and everything after the day", () => {
    expect(taxDeadlineFacts("2026-11-03", [FIRST], [])).toEqual([
      { kind: "second_instalment", year: 2025, due: "2026-11-05" },
    ]);
    expect(taxDeadlineFacts("2026-11-05", [FIRST], [])).toHaveLength(1);
    expect(taxDeadlineFacts("2026-11-06", [FIRST], [])).toEqual([]);
  });

  it("says a year nobody has read as unverified", () => {
    expect(taxDeadlineFacts("2027-11-01", [{ tax_year: 2026, instalment: "first" }], [])).toEqual([
      { kind: "unverified", year: 2026, deadline: "second_instalment" },
    ]);
  });
});

describe("the other months", () => {
  it("say nothing", () => {
    expect(taxDeadlineFacts("2026-05-31", [], [])).toEqual([]);
    expect(taxDeadlineFacts("2026-07-01", [], [])).toEqual([]);
    expect(taxDeadlineFacts("2026-10-31", [FIRST], [])).toEqual([]);
    expect(taxDeadlineFacts("2026-12-01", [FIRST], [])).toEqual([]);
  });
});
