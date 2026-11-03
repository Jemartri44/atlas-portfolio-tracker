// The savings income recorded outside the portfolio, as its card lists it:
// apart from the boxes, because the payer already reports it and the return
// brings it in the user's tax data.

import type { Money } from "@atlas/domain";
import type { TaxYearReport } from "@atlas/domain/fiscal";
import { formatDate } from "../../format/date.js";

export interface ExternalIncomeRow {
  key: string;
  date: string;
  kind: string;
  payer?: string;
  gross_eur: Money;
  withholding_eur: Money;
}

export interface ExternalIncomeView {
  year: number;
  rows: ExternalIncomeRow[];
  gross_eur: Money;
  withholding_eur: Money;
}

const KINDS = { dividend: "Dividendo", interest: "Interés" } as const;

/** Undefined when the year has none: the card is then not shown. */
export const externalIncomeView = (report: TaxYearReport): ExternalIncomeView | undefined => {
  const external = report.external_income;
  if (external === undefined || external.lines.length === 0) {
    return undefined;
  }
  return {
    year: report.year,
    rows: external.lines.map((line) => ({
      key: line.event_id,
      date: formatDate(line.fiscal_date),
      kind: KINDS[line.kind],
      ...(line.payer === undefined ? {} : { payer: line.payer }),
      gross_eur: line.gross_eur,
      withholding_eur: line.withholding_eur,
    })),
    gross_eur: external.gross_eur,
    withholding_eur: external.withholding_eur,
  };
};
