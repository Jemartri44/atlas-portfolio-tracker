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
import type { Clock } from "../ports/clock.js";
import type { LedgerStore } from "../ports/ledger-store.js";
import { projectLedger } from "../projections/project-ledger.js";
import { snapshotDiff, snapshotOf } from "../projections/snapshot.js";
import { decodeLine, encodeLine, parseLine } from "../schema/line.js";

export interface CompactDeps {
  store: LedgerStore;
  clock: Clock;
}

export interface VersionCount {
  version: number;
  lines: number;
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
    };

const MAX_ARCHIVE_ATTEMPTS = 99;

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
  };
};

export const compactLedger = async (
  { store }: CompactDeps,
  plan: CompactPlan,
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
  const before = snapshotOf(projectLedger(events, { collectErrors: true }));
  const rewritten = events.map(encodeLine).map((line) => decodeLine(line, store.schema).event);
  const after = snapshotOf(projectLedger(rewritten, { collectErrors: true }));
  const keys = snapshotDiff(before, after);
  if (keys.length > 0) {
    throw new CompactRejectedError("projection_changed", { keys });
  }
  const base = plan.archiveName.replace(/\.jsonl$/, "");
  for (let attempt = 1; ; attempt += 1) {
    const archiveName = attempt === 1 ? plan.archiveName : `${base}-${attempt}.jsonl`;
    try {
      const replaced = await store.replace(events, etag, archiveName);
      return {
        status: "compacted",
        archiveName,
        linesBefore: lines.length,
        linesAfter: events.length,
        versions: plan.versions,
        targetVersion: plan.targetVersion,
        etag: replaced.etag,
      };
    } catch (error) {
      if (!(error instanceof ArchiveExistsError) || attempt >= MAX_ARCHIVE_ATTEMPTS) {
        throw error;
      }
    }
  }
};
