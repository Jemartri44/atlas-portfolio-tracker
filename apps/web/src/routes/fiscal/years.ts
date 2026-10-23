import { yearOf } from "@atlas/domain";

/**
 * The years worth offering: from the first one with figures or with a return
 * to the current one, newest first. A ledger dated ahead of today —which
 * happens while a year is being caught up on— keeps its own years in the list
 * instead of falling off the end of it.
 */
export const yearsOf = (
  gains: readonly { fiscal_date: string }[],
  filings: readonly { tax_year: number }[],
  current: number,
): number[] => {
  const years = [
    ...gains.map((gain) => yearOf(gain.fiscal_date)),
    ...filings.map((filing) => filing.tax_year),
  ];
  const first = Math.min(...years, current - 1);
  const last = Math.max(...years, current);
  return Array.from({ length: last - first + 1 }, (_, index) => last - index);
};
