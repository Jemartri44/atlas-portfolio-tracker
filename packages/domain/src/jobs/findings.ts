// What the daily jobs of the cloud leave for the mail (feature 016, E2; §8.2
// B1 and B2): each finding with its code and a subject **of a closed list**,
// and counts — never an asset, a symbol, an ISIN, a currency or a rate. The
// mail function sends them once per streak; nothing else sends.
//
// - The ECB: an update that would overwrite a published rate (it is kept
//   apart and the history in force stays: ADR-0029, point 2), a TARGET
//   calendar in disagreement, a history in force that does not match its
//   manifest and could not be undone, and that history rebuilt from the
//   official ZIP (review of PR #106, B1 (b)).
// - The prices: a source at its threshold of consecutive failures (only
//   `unavailable`, `rate_limited`, `blocked` and `invalid_response` count,
//   ADR-0031, third amendment, §5), correspondences the cloud leaves out
//   because nobody contrasted them (Q1), and theses of the bucket past their
//   expected horizon — `horizon_exceeded`, the one rule that exists (§8.2 B1);
//   the condition of invalidation is free text and never a warning; and files
//   of closes that do not read, by how many (round 3 of the review of PR #106).

import type { EcbRebuildResult, EcbUpdateResult } from "../ecb/update-history.js";
import type { UpdateReport } from "../quotes/cascade.js";
import type { PriceStatus } from "../quotes/status.js";
import type { ProducerFindings } from "./notices.js";
import type { Finding } from "./run-record.js";

/** Every code each producer may leave, with the closed list of its subjects. */
export const PRODUCER_FINDINGS: ProducerFindings = {
  ecb_update: {
    ecb_update_rejected: ["ecb"],
    ecb_calendar_mismatch: ["ecb"],
    ecb_history_damaged: ["ecb"],
    ecb_history_rebuilt: ["ecb"],
    ecb_rebuilt_unverified: ["ecb"],
  },
  prices_update: {
    source_failing: ["eodhd", "alpha_vantage"],
    currency_unchecked: ["eodhd", "alpha_vantage"],
    thesis_horizon_exceeded: ["bucket"],
    prices_file_unreadable: ["prices"],
  },
  // E4: only when something failed or differs.
  monthly_backup: {
    backup_object_differs: ["backup"],
    backup_ecb_inconsistent: ["backup"],
    backup_positions_missing: ["backup"],
  },
  quarterly_integrity: {
    integrity_errors: ["integrity"],
    restore_rehearsal_differs: ["integrity"],
    ledger_size_above_threshold: ["integrity"],
  },
};

/**
 * What an update of the ECB history leaves: a rejection, or a calendar that
 * disagrees; and what a rebuild of a damaged one leaves: the rebuild, or the
 * damage still there when the ZIP could not be had.
 */
export const ecbFindings = (result: EcbUpdateResult | EcbRebuildResult): Finding[] => {
  if (result.kind === "rejected") {
    // An update kept apart (it has `kept`), or a rebuild whose ZIP contradicts
    // the last readable generation (R2-N1), which asks for someone.
    return "kept" in result
      ? [{ code: "ecb_update_rejected", subject: "ecb", counts: { conflicts: result.total } }]
      : [{ code: "ecb_history_damaged", subject: "ecb", counts: { conflicts: result.total } }];
  }
  if (result.kind === "zip_unavailable") {
    return [{ code: "ecb_history_damaged", subject: "ecb" }];
  }
  const calendar: Finding[] =
    result.calendar.length === 0
      ? []
      : [
          {
            code: "ecb_calendar_mismatch",
            subject: "ecb",
            counts: { days: result.calendar.length },
          },
        ];
  if (result.kind !== "rebuilt") {
    return calendar;
  }
  return [
    { code: "ecb_history_rebuilt", subject: "ecb", counts: { days: result.days } },
    ...(result.verified ? [] : [{ code: "ecb_rebuilt_unverified", subject: "ecb" }]),
    ...calendar,
  ];
};

const SOURCES = ["eodhd", "alpha_vantage"] as const;

/** What a download of the closes leaves; `theses` is how many open theses passed their horizon. */
export const pricesFindings = (input: {
  readonly report: UpdateReport;
  readonly status: PriceStatus;
  readonly threshold: number;
  readonly theses: number;
}): Finding[] => {
  const failing: Finding[] = SOURCES.filter((source) => input.report.failing.includes(source)).map(
    (source) => ({
      code: "source_failing",
      subject: source,
      counts: {
        consecutive_failures: input.status.sources[source]?.consecutive_failures ?? 0,
        threshold: input.threshold,
      },
    }),
  );
  const unchecked: Finding[] = SOURCES.flatMap((source) => {
    const assets = input.report.assets.filter(
      (asset) => asset.unchecked?.includes(source) === true,
    );
    return assets.length === 0
      ? []
      : [{ code: "currency_unchecked", subject: source, counts: { assets: assets.length } }];
  });
  const theses: Finding[] =
    input.theses === 0
      ? []
      : [{ code: "thesis_horizon_exceeded", subject: "bucket", counts: { theses: input.theses } }];
  // A file of closes that does not read is never silent (round 3 of the
  // review of PR #106): said by how many, under an opaque subject of the
  // closed list — never the asset, which is not a closed list.
  const unreadable = input.report.assets.filter((asset) => asset.outcome === "unreadable").length;
  const files: Finding[] =
    unreadable === 0
      ? []
      : [{ code: "prices_file_unreadable", subject: "prices", counts: { files: unreadable } }];
  return [...failing, ...unchecked, ...theses, ...files];
};
