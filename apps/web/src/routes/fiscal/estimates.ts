// The wiring of the estimates of the fiscal screen that read more than one
// part of the ledger: the quota with the brackets in force, and the package
// of the return worded as the screen words it.

import { type LedgerEvent, type LedgerState, settingsAt } from "@atlas/domain";
import {
  rentaPackage,
  savingsQuota,
  type TaxOptions,
  type TaxYearReport,
  taxYear,
} from "@atlas/domain/fiscal";
import { describeWarning } from "../../format/messages/warnings.js";
import type { NameIndex } from "../../format/names.js";
import { download } from "../../ledger/copy.js";
import { type ExternalIncomeView, externalIncomeView } from "../../view-models/fiscal/external.js";
import { BLOCK_TITLES, PARTIAL_TEXTS } from "../../view-models/fiscal/index.js";
import { type QuotaView, quotaView } from "../../view-models/fiscal/quota.js";

export interface Estimate {
  quota: QuotaView;
  /** The income from outside the portfolio of the year, when there is some. */
  external?: ExternalIncomeView;
}

/**
 * The estimated quota of the year, with the brackets the settings in force at
 * its close carry, if any (criterion #27); for the current year, today's. With
 * income recorded outside the portfolio that year, the year is read again with
 * it (criterion #28): the report of the portfolio stays as it is.
 */
export const quotaOf = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  report: TaxYearReport,
  options: TaxOptions,
): Estimate => {
  const end = `${report.year}-12-31`;
  const close = end < options.today ? end : options.today;
  const brackets = settingsAt(state, close).settings.savings_tax_brackets;
  const outside = state.externalIncome.some((entry) => entry.year === report.year);
  const read = outside ? taxYear(events, report.year, { ...options, external: true }) : report;
  const external = externalIncomeView(read);
  return {
    quota: quotaView(savingsQuota(read, brackets)),
    ...(external === undefined ? {} : { external }),
  };
};

/** The estimate of a year whose report could be read; none otherwise. */
export const estimateOf = (
  snapshot: { state: LedgerState; events: readonly LedgerEvent[] },
  computed: { ok: true; value: TaxYearReport } | { ok: false },
  options: TaxOptions,
): Estimate | undefined =>
  computed.ok ? quotaOf(snapshot.state, snapshot.events, computed.value, options) : undefined;

/** Downloads the package of the year as a CSV, with the words of the screen. */
export const downloadPackage = (
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
  names: NameIndex,
): void => {
  const csv = rentaPackage(events, year, options, {
    block: (block) => BLOCK_TITLES[block],
    partial: (reason) => PARTIAL_TEXTS[reason],
    note: (note) => describeWarning(note, { names, privacy: false }),
  });
  download(csv, `atlas-renta-${year}.csv`, "text/csv");
};
