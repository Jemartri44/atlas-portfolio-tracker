// The tasks of the mail function (feature 016, E1; §8.2 B2): **the only
// function that sends**. It composes and decides nothing: the domain writes
// every mail (`reminderMail`, `noticeMail`), says what a retry does and when a
// streak is sent. This file is also **the one reader of the switch of the
// amounts** (§8.2 M2): it reads `/atlas/<env>/mail/amounts` and hands the
// redaction the value already understood (`amountsSwitch`: only `on` is on).
// The architecture test holds that no other module names that parameter.
//
// - `monthly_reminder` — always, at least once: a refusal or an unknown fate
//   of SES leaves the period open, and the next run sends it again with the
//   period in its subject.
// - `dispatch_findings` — the warnings the other jobs left in their records,
//   once per streak, at most once each: a streak is marked `sending` before
//   its mail goes, and a cut after that never sends it again.

import { readWebSignIn, TokenRegistry } from "@atlas/adapters/aws";
import type { JobsStore } from "@atlas/adapters/aws-jobs";
import { type CivilDate, contributionPlan, DomainError } from "@atlas/domain";
import {
  type AmountsSwitch,
  amountsSwitch,
  conditionsOf,
  type Finding,
  frequencyOf,
  type JobTask,
  noticeIn,
  noticeMail,
  noticeStep,
  ownFindings,
  PRODUCER_TASKS,
  type ProducerFindings,
  periodOf,
  previousPeriod,
  producerOf,
  reminderFacts,
  reminderMail,
} from "@atlas/domain/jobs";
import { readReference } from "../reference.js";
import type { TaskContext, TaskResult, TaskRunner } from "../run.js";

/** Reads the switch of the amounts: the only place. A failure of SSM leaves it off. */
const amountsOf = async (context: TaskContext): Promise<AmountsSwitch> => {
  try {
    return amountsSwitch(
      await context.deps.parameters.get(`${context.deps.config.ssmPrefix}mail/amounts`),
    );
  } catch {
    return "off";
  }
};

const notifierOf = (context: TaskContext) => {
  const notifier = context.deps.notifier;
  if (notifier === undefined) {
    throw new RangeError("a mail task without a notifier");
  }
  return notifier;
};

const origin = (context: TaskContext): string => context.deps.config.mail?.origin ?? "";

/** The contribution of the month, or the code of why it could not be computed. */
const planOf = async (context: TaskContext) => {
  const ledger = await context.ledger();
  if (!ledger.ok) {
    return { plan: { failure: ledger.code }, counts: {} };
  }
  const reference = await readReference(context.deps.objects, ledger.state).catch(() => ({
    counts: { price_files: 0, ecb_history: 0 },
  }));
  try {
    const plan = contributionPlan(ledger.state, {
      date: context.today,
      settings: ledger.settings,
      ...("external" in reference && reference.external !== undefined
        ? { external: reference.external }
        : {}),
    });
    return { plan, counts: reference.counts };
  } catch (error) {
    return {
      plan: {
        failure:
          error instanceof DomainError && /^[a-z][a-z0-9_]{0,63}$/.test(error.code)
            ? error.code
            : "contribution_failed",
      },
      counts: reference.counts,
    };
  }
};

export const monthlyReminder: TaskRunner = async (context): Promise<TaskResult> => {
  const { deps } = context;
  const [{ plan, counts }, webSignIn, tokens, amounts] = await Promise.all([
    planOf(context),
    readWebSignIn(deps.objects)
      .then((read) => read.date)
      .catch(() => "unreadable" as const),
    new TokenRegistry(deps.parameters, deps.config.ssmPrefix, {})
      .list()
      .then((records) => records.map((entry) => entry.read))
      .catch(() => "unavailable" as const),
    amountsOf(context),
  ]);
  const now = deps.now();
  const facts = reminderFacts({
    period: context.period,
    today: context.today,
    nowMs: now.getTime(),
    plan,
    webSignIn,
    tokens,
    idleWarningDays: deps.config.mail?.idleWarningDays ?? 150,
  });
  const sent = await notifierOf(context).send(reminderMail(facts, amounts, origin(context)));
  const summary = {
    ...counts,
    split: facts.contribution.ok ? 1 : 0,
    amounts: amounts === "on" ? 1 : 0,
  };
  // At least once (§8.1 P10): an unknown fate is sent again next time, never taken as sent.
  return sent.ok
    ? { state: "done", outcome: { code: "mail_sent", counts: summary } }
    : { state: "send_failed", outcome: { code: sent.code, counts: summary } };
};

/** What the last record of a producer says, with where it comes from. */
interface Said {
  readonly findings: readonly Finding[];
  readonly period: string;
  readonly outcome?: string;
}

/**
 * What the last record of a producer says: of this period, or else the one
 * before. A record that does not read is said too, as `record_unreadable` with
 * the task as subject (review of PR #104, idempotence N4) — never skipped.
 * Of a readable one, only what that producer may say (privacy B1).
 */
const latestOf = async (
  store: JobsStore,
  task: JobTask,
  context: TaskContext,
): Promise<Said | undefined> => {
  const frequency = frequencyOf(task, context.frequencies.frequencies);
  for (const period of [
    periodOf(frequency, context.today),
    previousPeriod(frequency, context.today),
  ]) {
    const read = await store.readRecord(task, period);
    if (read.kind === "unreadable") {
      return {
        findings: [{ code: "record_unreadable", subject: task }],
        period,
        outcome: read.code,
      };
    }
    const said = read.kind === "read" ? conditionsOf(read.value) : undefined;
    if (read.kind === "read" && said !== undefined) {
      return {
        findings: ownFindings(task, said, PRODUCER_FINDINGS),
        period,
        ...(read.value.outcome === undefined ? {} : { outcome: read.value.outcome.code }),
      };
    }
  }
  return undefined;
};

/** The codes each producer may leave, each with its closed list of subjects; E2 and E4 add theirs. */
const PRODUCER_FINDINGS: ProducerFindings = {};

export const dispatchFindings: TaskRunner = async (context): Promise<TaskResult> => {
  const { deps, store } = context;
  const at = () => deps.now().toISOString();
  const counts = { sent: 0, closed: 0, refused: 0, unknown: 0, ignored: 0 };
  const conditions = new Map<JobTask, Said>();
  for (const task of PRODUCER_TASKS) {
    const said = await latestOf(store, task, context);
    if (said !== undefined) {
      conditions.set(task, said);
    }
  }
  const present = (code: string, subject: string): boolean | undefined => {
    const producer = producerOf({ code, subject }, PRODUCER_FINDINGS);
    const said = producer === undefined ? undefined : conditions.get(producer);
    return said?.findings.some((finding) => finding.code === code && finding.subject === subject);
  };

  // Streaks whose condition is gone are closed.
  for (const { code, subject } of await store.notices()) {
    const read = await store.readNotice(code, subject);
    if (read.kind === "read" && noticeStep(read.value, present(code, subject)).kind === "close") {
      await store.writeNotice(
        noticeIn(read.value, "closed", at(), read.value.streak_since),
        read.etag,
      );
      counts.closed += 1;
    }
  }

  // Conditions present are sent once per streak, and only when the mail can say them.
  for (const said of conditions.values()) {
    for (const finding of said.findings) {
      const facts = (since: CivilDate) => ({
        since,
        period: said.period,
        ...(said.outcome === undefined ? {} : { outcome: said.outcome }),
      });
      if (noticeMail(finding, facts(context.today), origin(context)) === undefined) {
        counts.ignored += 1;
        continue;
      }
      const read = await store.readNotice(finding.code, finding.subject);
      if (read.kind === "unreadable") {
        counts.ignored += 1;
        continue;
      }
      const notice = read.kind === "read" ? read.value : undefined;
      const etag = read.kind === "read" ? read.etag : undefined;
      const step = noticeStep(notice, true);
      if (step.kind === "close_unknown") {
        await store.writeNotice(
          noticeIn(
            finding,
            "send_unknown",
            at(),
            (notice as { streak_since: CivilDate }).streak_since,
          ),
          etag,
        );
        counts.unknown += 1;
        continue;
      }
      if (step.kind !== "open_and_send" && step.kind !== "send") {
        continue;
      }
      const since =
        step.kind === "send" && notice !== undefined ? notice.streak_since : context.today;
      const sending = await store.writeNotice(noticeIn(finding, "sending", at(), since), etag);
      const mail = noticeMail(finding, facts(since), origin(context));
      const sent = await notifierOf(context).send(mail as NonNullable<typeof mail>);
      const state = sent.ok
        ? "sent"
        : sent.code === "mail_send_unknown"
          ? "send_unknown"
          : "send_failed";
      await store.writeNotice(noticeIn(finding, state, at(), since), sending);
      counts[state === "sent" ? "sent" : state === "send_unknown" ? "unknown" : "refused"] += 1;
    }
  }
  return { state: "done", outcome: { code: "findings_dispatched", counts } };
};

/** The tasks of the mail function built so far (E1); E4 adds the periodic warnings. */
export const MAIL_RUNNERS: Readonly<Partial<Record<JobTask, TaskRunner>>> = {
  dispatch_findings: dispatchFindings,
  monthly_reminder: monthlyReminder,
};
