// The wiring of the estimates of the fiscal screen that read more than one
// part of the ledger: the quota with the brackets in force, and the package
// of the return worded as the screen words it.

import { type LedgerEvent, type LedgerState, settingsAt } from "@atlas/domain";
import {
  rentaPackage,
  savingsQuota,
  type TaxOptions,
  type TaxYearReport,
} from "@atlas/domain/fiscal";
import { describeWarning } from "../../format/messages/warnings.js";
import type { NameIndex } from "../../format/names.js";
import { download } from "../../ledger/copy.js";
import { BLOCK_TITLES, PARTIAL_TEXTS } from "../../view-models/fiscal/index.js";
import { type QuotaView, quotaView } from "../../view-models/fiscal/quota.js";

/**
 * The estimated quota of the year, with the brackets the settings in force at
 * its close carry, if any (criterion #27); for the current year, today's.
 */
export const quotaOf = (state: LedgerState, report: TaxYearReport, today: string): QuotaView => {
  const end = `${report.year}-12-31`;
  const close = end < today ? end : today;
  return quotaView(savingsQuota(report, settingsAt(state, close).settings.savings_tax_brackets));
};

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
