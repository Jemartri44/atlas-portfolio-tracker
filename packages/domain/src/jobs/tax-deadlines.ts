// The deadlines of the income tax the monthly reminder says, from the table of
// each campaign (`tax/income-tax-deadlines.ts`) and what the ledger records of
// its payment. It rides on the reminder, which always arrives on the first days
// of the month: once per period, no job of its own. Dates only: no figure.
//
// - **June**: the end of the campaign of the year before and of its direct
//   debit, unless the ledger already says it is filed: a filing of the Renta of
//   that year, or a payment or a refund of it;
// - **November**: the second instalment, only if the first of that year was
//   paid and the second was not.
//
// A year whose order nobody has read says so, and never a date.

import { type CivilDate, yearOf } from "../dates/civil-date.js";
import type { Filing } from "../projections/filings.js";
import type { TaxPayment } from "../projections/state.js";
import { incomeTaxDeadlines } from "../tax/income-tax-deadlines.js";

export type TaxDeadlineFacts =
  | {
      readonly kind: "filing";
      readonly year: number;
      readonly filing_end: CivilDate;
      /** Absent once it has gone. */
      readonly direct_debit_end?: CivilDate;
    }
  | {
      readonly kind: "second_instalment";
      readonly year: number;
      readonly due: CivilDate;
      /** Absent once it has gone. */
      readonly direct_debit_end?: CivilDate;
    }
  | {
      readonly kind: "unverified";
      readonly year: number;
      readonly deadline: "filing" | "second_instalment";
    };

export const taxDeadlineFacts = (
  today: CivilDate,
  payments: readonly Pick<TaxPayment, "tax_year" | "instalment">[],
  filings: readonly Pick<Filing, "model" | "tax_year">[],
): TaxDeadlineFacts[] => {
  const year = yearOf(today) - 1;
  const month = today.slice(5, 7);
  const ofYear = payments.filter((payment) => payment.tax_year === year);
  const filed =
    ofYear.length > 0 ||
    filings.some((filing) => filing.model === "renta" && filing.tax_year === year);
  const row = incomeTaxDeadlines(year);
  if (month === "06" && !filed) {
    if (row === undefined) {
      return [{ kind: "unverified", year, deadline: "filing" }];
    }
    return today > row.filing_end
      ? []
      : [
          {
            kind: "filing",
            year,
            filing_end: row.filing_end,
            ...(today > row.direct_debit_end ? {} : { direct_debit_end: row.direct_debit_end }),
          },
        ];
  }
  const owesSecond =
    ofYear.some((payment) => payment.instalment === "first") &&
    !ofYear.some((payment) => payment.instalment === "second");
  if (month === "11" && owesSecond) {
    if (row === undefined) {
      return [{ kind: "unverified", year, deadline: "second_instalment" }];
    }
    return today > row.second_instalment
      ? []
      : [
          {
            kind: "second_instalment",
            year,
            due: row.second_instalment,
            ...(today > row.second_direct_debit_end
              ? {}
              : { direct_debit_end: row.second_direct_debit_end }),
          },
        ];
  }
  return [];
};
