// The two warnings of January that touch the fiscal path (feature 016, E4;
// `docs/specification.md` §9.5), in a module of their own: **nothing here
// reaches a price** — not the closes of `prices/`, not `reference.ts`, not the
// door of the quotes (`tests/jobs-access.test.ts`). At most once each.
//
// - `tax_return_ready`: the report of the year before, from the ledger alone,
//   said by how many notes and criteria in dispute it carries; **never a
//   figure, whatever the switch** (Q10) — this module does not even read it.
//   The notes of the ECB check are the ones `atlas tax` shows: the rates of
//   the ledger contrasted with the history of the bucket, which moves no
//   figure (ADR-0029, point 8).
// - `informative_thresholds`: the 720 and the 721 of the year before, with the
//   function the models use, from **manual valuations only** (mutant 31), in a
//   neutral text (questions §13); only when there is something to do.

import { checkLedgerRates, DEFAULT_LOCAL_CONFIG } from "@atlas/domain/ecb";
import {
  informativeFacts,
  informativeMail,
  type JobTask,
  taxReturnFacts,
  taxReturnMail,
} from "@atlas/domain/jobs";
import { readCloudEcbHistory } from "../ecb-history.js";
import type { TaskResult, TaskRunner } from "../run.js";
import { originOf, sendOnce } from "./send.js";

export const taxReturnReady: TaskRunner = async (context): Promise<TaskResult> => {
  const ledger = await context.ledger();
  const year = Number(context.today.slice(0, 4)) - 1;
  if (!ledger.ok) {
    return sendOnce(
      context,
      taxReturnMail({ ok: false, year, code: ledger.code }, originOf(context)),
    );
  }
  const history = await readCloudEcbHistory(context.deps.objects).catch(() => undefined);
  const check = checkLedgerRates(
    history,
    ledger.state,
    ledger.events,
    DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days,
    context.today,
  );
  const facts = taxReturnFacts({
    events: ledger.events,
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
};

export const informativeThresholds: TaskRunner = async (context): Promise<TaskResult> => {
  const ledger = await context.ledger();
  if (!ledger.ok && ledger.code === "ledger_absent") {
    // Nothing recorded, nothing to declare.
    return { state: "done", outcome: { code: "informative_nothing_to_do" } };
  }
  const year = Number(context.today.slice(0, 4)) - 1;
  const facts = ledger.ok
    ? informativeFacts({ events: ledger.events, today: context.today })
    : { year, invalid: true, models: [] };
  const mail = informativeMail(facts, originOf(context));
  const counts = { models: facts.models.length, invalid: facts.invalid ? 1 : 0 };
  return mail === undefined
    ? { state: "done", outcome: { code: "informative_nothing_to_do", counts } }
    : sendOnce(context, mail, counts);
};

export const FISCAL_RUNNERS: Readonly<Partial<Record<JobTask, TaskRunner>>> = {
  tax_return_ready: taxReturnReady,
  informative_thresholds: informativeThresholds,
};
