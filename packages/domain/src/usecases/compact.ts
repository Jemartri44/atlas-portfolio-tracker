// compact (data-schema.md §5, ADR-0006, feature 003): the only operation that
// rewrites the ledger. Two steps so that an interactive client can confirm in
// between and a non-interactive one does not have to: `planCompact` inspects
// (and refuses a ledger with invalid events); `compactLedger` re-checks the
// etag, is a no-op without outdated lines, verifies that the rewritten text
// projects to the same snapshot and only then asks the store to archive the
// original and replace the content. Archives are never overwritten: on a name
// collision the suffix -2, -3… is tried.

import type { CivilDate } from "../dates/civil-date.js";
import { todayInMadrid } from "../dates/madrid.js";
import { ArchiveExistsError, CompactRejectedError, ConflictError } from "../errors.js";
import {
  checkFilingFingerprints,
  type FingerprintCheck,
  resealFilings,
} from "../filings/fingerprint.js";
import { systemUlid } from "../ids/ulid.js";
import type { Clock } from "../ports/clock.js";
import type { LedgerStore } from "../ports/ledger-store.js";
import { projectLedger } from "../projections/project-ledger.js";
import { snapshotDiff, snapshotOf } from "../projections/snapshot.js";
import type { FilingFingerprintWaivedEvent, TaxReturnFiledEvent } from "../schema/events.js";
import { decodeLine, encodeLine, parseLine } from "../schema/line.js";

export interface CompactDeps {
  store: LedgerStore;
  clock: Clock;
}

export interface VersionCount {
  version: number;
  lines: number;
}

/** A filing whose fingerprint `planCompact` could not verify, and why. */
export interface UnverifiedFiling {
  filing_id: string;
  reason: "lines" | "digest" | "unreadable";
}

/** What the caller may accept, by name, so that the ledger can be compacted at all. */
export interface CompactOptions {
  /**
   * Filings whose fingerprint the user accepts as **unverifiable**, one by
   * one. Never a blanket `--force`: accepting one leaves every other one
   * protected, and each acceptance is recorded in the ledger (ADR-0025).
   */
  acceptUnverified?: readonly string[];
}

export interface CompactPlan {
  /** Etag of the ledger inspected; `compactLedger` refuses to run on another. */
  etag: string;
  lines: number;
  /** Lines per schema_version found, ascending. */
  versions: VersionCount[];
  targetVersion: number;
  /** Lines below the target version; zero means nothing to compact. */
  outdated: number;
  /** `ledger-<YYYY-MM-DD>-v<n>.jsonl`; a suffix is added on collision. */
  archiveName: string;
  /**
   * Filings whose fingerprint does not verify, so the caller can name them
   * before deciding. Empty is the normal case and the fast path.
   */
  unverified: UnverifiedFiling[];
}

export type CompactResult =
  | {
      status: "nothing_to_compact";
      lines: number;
      versions: VersionCount[];
      targetVersion: number;
    }
  | {
      status: "compacted";
      archiveName: string;
      linesBefore: number;
      linesAfter: number;
      versions: VersionCount[];
      targetVersion: number;
      etag: string;
      /**
       * The waivers that **are now in the ledger**, known only once the
       * rewrite has gone through: an interface says "it is recorded" from
       * here, never before (review of feature 011, decision (g)).
       */
      waived: UnverifiedFiling[];
    };

const MAX_ARCHIVE_ATTEMPTS = 99;

/**
 * The line that records a waiver. It says **which** filing and **why**, and
 * the why is **the real reason of the check, passed through as it is**: `lines`,
 * `digest` or `unreadable`. It used to be a ternary that folded everything that
 * was not `unreadable` into `digest`, so a `lines` case wrote for ever, in a
 * file that only grows, a reason that was false (review of feature 011; the
 * third time a ternary bit in this round). It also carries what the fingerprint
 * declared, which after resealing the ledger holds nowhere else, and its
 * `recorded_at` is when the user gave it for good.
 */
const waiverEvent = (
  check: FingerprintCheck,
  version: number,
  at: Date,
  sequence: number,
): FilingFingerprintWaivedEvent => ({
  schema_version: version,
  id: systemUlid(at, sequence),
  recorded_at: at.toISOString(),
  type: "filing_fingerprint_waived",
  filing_id: check.filing_id,
  // Only broken checks reach here, so the reason is always there.
  reason: check.reason as FilingFingerprintWaivedEvent["reason"],
  declared_schema_version: check.declared_schema_version,
  declared_lines: check.declared_lines,
});

export const archiveNameFor = (date: CivilDate, version: number, attempt = 1): string =>
  `ledger-${date}-v${version}${attempt === 1 ? "" : `-${attempt}`}.jsonl`;

const versionsOf = (lines: readonly string[]): VersionCount[] => {
  const counts = new Map<number, number>();
  for (const line of lines) {
    const version = parseLine(line).schema_version as number;
    counts.set(version, (counts.get(version) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([version, count]) => ({ version, lines: count }));
};

export const planCompact = async ({ store, clock }: CompactDeps): Promise<CompactPlan> => {
  const { events, etag, lines } = await store.load();
  const state = projectLedger(events, { collectErrors: true });
  if (state.invalid.length > 0) {
    throw new CompactRejectedError("invalid_events", {
      affected: state.invalid.map((entry) => ({
        id: entry.event.id,
        type: entry.event.type,
        error: entry.error.message,
      })),
    });
  }
  const versions = versionsOf(lines);
  const targetVersion = store.schema.version;
  const outdated = versions
    .filter((entry) => entry.version < targetVersion)
    .reduce((total, entry) => total + entry.lines, 0);
  const lowest = versions[0]?.version ?? targetVersion;
  return {
    etag,
    lines: lines.length,
    versions,
    targetVersion,
    outdated,
    archiveName: archiveNameFor(todayInMadrid(clock), lowest),
    unverified: checkFilingFingerprints(lines, events, store.schema)
      .filter((check) => check.reason !== undefined)
      .map((check) => ({
        filing_id: check.filing_id,
        reason: check.reason as NonNullable<FingerprintCheck["reason"]>,
      })),
  };
};

export const compactLedger = async (
  { store, clock }: CompactDeps,
  plan: CompactPlan,
  options: CompactOptions = {},
): Promise<CompactResult> => {
  const { events, etag, lines } = await store.load();
  if (etag !== plan.etag) {
    throw new ConflictError();
  }
  if (plan.outdated === 0) {
    return {
      status: "nothing_to_compact",
      lines: lines.length,
      versions: plan.versions,
      targetVersion: plan.targetVersion,
    };
  }
  // The fingerprints of the filings are verified **before** the shape of the
  // lines changes, which is the whole reason the guarantee survives a
  // compaction: they are checked against the file as it is, and sealed again
  // over the file as it will be. A broken one stops the rewrite; recovering
  // from it is a decision of the user, not of a batch job.
  const broken = checkFilingFingerprints(lines, events, store.schema).filter(
    (check) => check.reason !== undefined,
  );
  // **The way out, and it has to be asked for by name** (ADR-0025). Refusing is
  // still what happens by default; what the user may say is "I accept that the
  // fingerprint of **this** filing cannot be verified", one at a time, staying
  // protected on every other. A blanket force would give up the whole
  // guarantee to fix one line.
  const accepted = new Set(options.acceptUnverified ?? []);
  const waived = broken.filter((check) => accepted.has(check.filing_id));
  const refused = broken.filter((check) => !accepted.has(check.filing_id));
  if (refused.length > 0) {
    // Which of the two, because **only one of them accuses anybody of
    // anything**. Two calls with the code written as a literal and never one
    // call with a ternary: the anti-drift test of the messages scans the
    // sources for `new CompactRejectedError("<code>"`, so a ternary hides
    // **both** codes from it and the translations that exist are reported as
    // dead entries (measured twice, feature 011).
    const affected = refused.map((check) => ({ id: check.filing_id, reason: check.reason }));
    if (refused.every((check) => check.reason === "unreadable")) {
      throw new CompactRejectedError("filing_fingerprint_unreadable", { affected });
    }
    throw new CompactRejectedError("filing_fingerprint_mismatch", { affected });
  }
  // The waiver travels **inside the same list** handed to `replace`, never on
  // its own: the waiver and the rewrite are all or nothing. A waiver without
  // its compaction would state a fact that did not happen, and an append-only
  // ledger could not take it back.
  const at = clock.now();
  const waivers = waived.map((check, index) => waiverEvent(check, plan.targetVersion, at, index));
  const sealed = [...resealFilings(events, plan.targetVersion), ...waivers];
  // **The one change the waiver authorises, declared before comparing.** The
  // snapshot carries the count of lines of every filing's fingerprint, and
  // resealing sets it to where the filing really sits: for a `lines` case that
  // is a change, and it made every such compaction fail with
  // `projection_changed`, leaving the ledger frozen — the thing ADR-0025
  // exists to prevent. So the reading **before** the rewrite is taken with
  // that count already set, **for the waived filings only and on that field
  // only**. The comparison is not loosened: any other change of any filing,
  // and every change of anything else, still stops the rewrite.
  const waivedIds = new Set(waived.map((check) => check.filing_id));
  const expected = events.map((event, position) =>
    waivedIds.has(event.id)
      ? {
          ...(event as TaxReturnFiledEvent),
          ledger_fingerprint: {
            ...(event as TaxReturnFiledEvent).ledger_fingerprint,
            lines: position,
          },
        }
      : event,
  );
  const before = snapshotOf(projectLedger([...expected, ...waivers], { collectErrors: true }));
  const rewritten = sealed.map(encodeLine).map((line) => decodeLine(line, store.schema).event);
  const after = snapshotOf(projectLedger(rewritten, { collectErrors: true }));
  const keys = snapshotDiff(before, after);
  if (keys.length > 0) {
    throw new CompactRejectedError("projection_changed", { keys });
  }
  const base = plan.archiveName.replace(/\.jsonl$/, "");
  for (let attempt = 1; ; attempt += 1) {
    const archiveName = attempt === 1 ? plan.archiveName : `${base}-${attempt}.jsonl`;
    try {
      const replaced = await store.replace(sealed, etag, archiveName);
      return {
        status: "compacted",
        archiveName,
        linesBefore: lines.length,
        linesAfter: sealed.length,
        versions: plan.versions,
        targetVersion: plan.targetVersion,
        etag: replaced.etag,
        waived: waivers.map((waiver) => ({ filing_id: waiver.filing_id, reason: waiver.reason })),
      };
    } catch (error) {
      if (!(error instanceof ArchiveExistsError) || attempt >= MAX_ARCHIVE_ATTEMPTS) {
        throw error;
      }
    }
  }
};
