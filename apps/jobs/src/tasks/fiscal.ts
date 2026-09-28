// The two warnings of January that touch the fiscal path (feature 016, E4;
// `docs/specification.md` §9.5), in a module of their own: **nothing here
// reaches a price**. Each runs over a view of the bucket that reaches only
// `ledger/` and `reference/ecb/` (`scopedObjects`; review of PR #109, avisos
// N3), and the module takes from the packages only what the guardian of
// `tests/jobs-access.test.ts` lists. At most once each, and **never for a
// January gone** (the handler closes it `expired`, avisos B1).
//
// - `tax_return_ready`: the report of the year before the period's, from the
//   ledger alone, said by how many notes and criteria in dispute it carries;
//   **never a figure, whatever the switch** (Q10) — this module does not even
//   read it. The notes of the ECB check are the ones `atlas tax` shows, with
//   the one staleness of the cloud (`CLOUD_ECB_STALE_DAYS`, Q11); they move no
//   figure (ADR-0029, point 8).
// - `informative_thresholds`: the 720 and the 721 of that year, with the
//   function the models use, from **manual valuations only** (mutant 31), in a
//   neutral text (questions §13); only when there is something to do.
//
// **A passing failure is never spent on a mail** (avisos B2 and N1): a ledger
// or a history of the ECB that could not be read now closes the run `failed`,
// and the next day tries again. On the last day of January, what still could
// not be checked is said neutrally, with its code. Only a ledger with invalid
// events is said as such.

import { checkLedgerRates } from "@atlas/domain/ecb";
import {
  frequencyOf,
  informativeFacts,
  informativeMail,
  type JobTask,
  lastDayOfWindow,
  ledgerFailureKind,
  taxReturnFacts,
  taxReturnMail,
} from "@atlas/domain/jobs";
import { CLOUD_ECB_STALE_DAYS, readCloudEcbHistory } from "../ecb-history.js";
import type { TaskContext, TaskResult, TaskRunner } from "../run.js";
import { scopedObjects } from "../scoped-objects.js";
import { originOf, sendOnce } from "./send.js";

/** What the fiscal warnings may read of the bucket: the ledger and the history of the ECB. */
export const FISCAL_SCOPE: readonly string[] = ["ledger/", "reference/ecb/"];

/** The runner, over a view of the bucket that reaches nothing else. */
const inScope =
  (runner: TaskRunner): TaskRunner =>
  (context) =>
    runner({
      ...context,
      deps: { ...context.deps, objects: scopedObjects(context.deps.objects, FISCAL_SCOPE) },
    });

/** The fiscal year: the one before the year of the period, never of the day. */
const yearOf = (context: TaskContext): number => Number(context.period) - 1;

/** Whether today is the last day of January the warning may still go out. */
const lastDay = (context: TaskContext): boolean =>
  lastDayOfWindow(frequencyOf(context.task, context.frequencies.frequencies), context.today);

/** Tried again tomorrow: nothing sent. */
const retry = (code: string): TaskResult => ({ state: "failed", outcome: { code } });

export const taxReturnReady: TaskRunner = inScope(async (context): Promise<TaskResult> => {
  const year = yearOf(context);
  const cannot = (code: string): Promise<TaskResult> =>
    sendOnce(context, taxReturnMail({ ok: false, year, code }, originOf(context)));
  const ledger = await context.ledger();
  if (!ledger.ok) {
    return ledgerFailureKind(ledger.code) === "transient" && !lastDay(context)
      ? retry(ledger.code)
      : cannot(ledger.code);
  }
  let history: Awaited<ReturnType<typeof readCloudEcbHistory>>;
  try {
    history = await readCloudEcbHistory(context.deps.objects);
  } catch {
    // «No history» is not «could not read it»: the notes would be fewer, unsaid.
    return lastDay(context) ? cannot("ecb_unavailable") : retry("ecb_unavailable");
  }
  const check = checkLedgerRates(
    history,
    ledger.state,
    ledger.events,
    CLOUD_ECB_STALE_DAYS,
    context.today,
  );
  const facts = taxReturnFacts({
    events: ledger.events,
    year,
    today: context.today,
    rateFindings:
      check.kind === "unchecked"
        ? []
        : check.findings.flatMap((finding) =>
            finding.event_ids.map((event_id) => ({ event_id, code: finding.code })),
          ),
  });
  return sendOnce(
    context,
    taxReturnMail(facts, originOf(context)),
    facts.ok ? { notes: facts.notes, disputed: facts.disputed } : {},
  );
});

export const informativeThresholds: TaskRunner = inScope(async (context): Promise<TaskResult> => {
  const year = yearOf(context);
  const ledger = await context.ledger();
  let facts: Parameters<typeof informativeMail>[0];
  if (ledger.ok) {
    facts = informativeFacts({ events: ledger.events, year, today: context.today });
  } else {
    const kind = ledgerFailureKind(ledger.code);
    if (kind === "absent") {
      // Nothing recorded, nothing to declare.
      return { state: "done", outcome: { code: "informative_nothing_to_do" } };
    }
    if (kind === "transient" && !lastDay(context)) {
      return retry(ledger.code);
    }
    facts =
      kind === "invalid"
        ? { year, invalid: true, models: [] }
        : { year, invalid: false, models: [], unavailable: ledger.code };
  }
  const mail = informativeMail(facts, originOf(context));
  const counts = { models: facts.models.length, invalid: facts.invalid ? 1 : 0 };
  return mail === undefined
    ? { state: "done", outcome: { code: "informative_nothing_to_do", counts } }
    : sendOnce(context, mail, counts);
});

export const FISCAL_RUNNERS: Readonly<Partial<Record<JobTask, TaskRunner>>> = {
  tax_return_ready: taxReturnReady,
  informative_thresholds: informativeThresholds,
};
