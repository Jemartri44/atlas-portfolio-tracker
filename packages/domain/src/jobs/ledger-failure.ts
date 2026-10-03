// What a ledger that does not load means for a warning (review of PR #109,
// avisos B2 and N1). The code comes from the reader of the jobs:
//
// - `transient`: it could not be read now (S3 throttled, erred or denied).
//   The warning is retried the next day, never spent on a text that is not
//   true; on the last day of its window it says it could not be checked.
// - `invalid`: it reads, and has invalid events. Said as such.
// - `content`: its bytes do not decode (a line, a newer schema). Said by code.
// - `absent`: there is no ledger: nothing to warn of.

export type LedgerFailureKind = "transient" | "invalid" | "content" | "absent";

export const ledgerFailureKind = (code: string): LedgerFailureKind => {
  switch (code) {
    case "ledger_unavailable":
    case "ledger_unreadable":
      return "transient";
    case "ledger_invalid":
      return "invalid";
    case "ledger_absent":
      return "absent";
    default:
      return "content";
  }
};
