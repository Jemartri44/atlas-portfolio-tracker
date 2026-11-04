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

/** The years of the picker, each saying whether its return is filed and still stands. */
export const yearChoices = (
  gains: readonly { fiscal_date: string }[],
  filings: readonly { model: string; tax_year: number; superseded_by?: unknown }[],
  current: number,
): { year: number; filed: boolean }[] =>
  yearsOf(gains, filings, current).map((year) => ({
    year,
    filed: filings.some(
      (filing) =>
        filing.model === "renta" && filing.tax_year === year && filing.superseded_by === undefined,
    ),
  }));
