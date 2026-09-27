// The warnings the mail function sends for the other jobs (feature 016, §8.2
// B2): **once per streak**, never once a day. A streak is a condition — a code
// and a subject — present in the last closed record of the job that found it;
// it opens when it appears, is sent once, and closes when the condition is no
// longer there. If it comes back, it is another streak.
//
// Each streak lives in `jobs/mail/notices/<code>--<subject>.json`, written
// only by the mail function. Sending and noting are two steps, so the notice
// is first marked `sending` (conditionally) and then `sent`: a cut between
// them leaves `sending`, and the retry marks it `send_unknown` **without
// sending again** (at most once, §8.1 P10).

import { type CivilDate, isCivilDate } from "../dates/civil-date.js";
import { type JobTask, PRODUCER_TASKS } from "./catalog.js";
import { type Finding, type RunRecord, SUBJECT_SHAPE } from "./run-record.js";
import { CODE_SHAPE, hasKeys, isInstantText, strictJsonObject } from "./strict.js";

export const NOTICE_FORMAT = 1;
export const NOTICES_PREFIX = "jobs/mail/notices/";

export const NOTICE_STATES = [
  "open",
  "sending",
  "sent",
  "send_failed",
  "send_unknown",
  "closed",
] as const;
export type NoticeState = (typeof NOTICE_STATES)[number];

export interface Notice {
  readonly notice_format: 1;
  readonly code: string;
  readonly subject: string;
  readonly streak_since: CivilDate;
  readonly state: NoticeState;
  readonly at: string;
}

/** The key of a streak, or nothing when its code or subject could not name a key safely. */
export const noticeKey = (code: string, subject: string): string | undefined =>
  CODE_SHAPE.test(code) && SUBJECT_SHAPE.test(subject)
    ? `${NOTICES_PREFIX}${code}--${subject}.json`
    : undefined;

export type ReadNotice =
  | { readonly ok: true; readonly notice: Notice }
  | { readonly ok: false; readonly code: "notice_unreadable" };

export const parseNotice = (text: string, code: string, subject: string): ReadNotice => {
  const value = strictJsonObject(text);
  const readable =
    value !== undefined &&
    hasKeys(value, ["notice_format", "code", "subject", "streak_since", "state", "at"]) &&
    value.notice_format === NOTICE_FORMAT &&
    value.code === code &&
    value.subject === subject &&
    isCivilDate(value.streak_since) &&
    (NOTICE_STATES as readonly unknown[]).includes(value.state) &&
    isInstantText(value.at);
  return readable
    ? { ok: true, notice: value as unknown as Notice }
    : { ok: false, code: "notice_unreadable" };
};

export const serializeNotice = (notice: Notice): string => `${JSON.stringify(notice)}\n`;

export type NoticeStep =
  | { readonly kind: "open_and_send" }
  | { readonly kind: "send" }
  | { readonly kind: "close_unknown" }
  | { readonly kind: "close" }
  | { readonly kind: "nothing" };

/**
 * What to do with a streak, given whether its condition is present in the
 * last closed record of its job. `present` is `undefined` when that job has no
 * closed record to say it: then nothing is opened nor closed.
 */
export const noticeStep = (
  notice: Notice | undefined,
  present: boolean | undefined,
): NoticeStep => {
  if (present === undefined) {
    return { kind: "nothing" };
  }
  if (!present) {
    return notice !== undefined && notice.state !== "closed"
      ? { kind: "close" }
      : { kind: "nothing" };
  }
  switch (notice?.state) {
    case undefined:
    case "closed":
      return { kind: "open_and_send" };
    case "open":
    case "send_failed":
      return { kind: "send" };
    case "sending":
      return { kind: "close_unknown" };
    default:
      return { kind: "nothing" };
  }
};

/** A notice in a new state; a new streak starts on `today`. */
export const noticeIn = (
  finding: Pick<Finding, "code" | "subject">,
  state: NoticeState,
  at: string,
  streakSince: CivilDate,
): Notice => ({
  notice_format: NOTICE_FORMAT,
  code: finding.code,
  subject: finding.subject,
  streak_since: streakSince,
  state,
  at,
});

/**
 * The codes the mail function fabricates itself from a record — that a job
 * failed, that its record cannot be read — with the task as subject. **A
 * record can never bring them in its findings** (review of PR #104, privacy
 * B1): a finding `task_failed` with an ISIN as subject would put it in a mail.
 */
export const FABRICATED_CODES: readonly string[] = ["task_failed", "record_unreadable"];

/** What each producer may leave: its codes, each with the closed list of its subjects. */
export type ProducerFindings = Readonly<
  Partial<Record<JobTask, Readonly<Record<string, readonly string[]>>>>
>;

/**
 * The conditions a closed record of a producer says: its findings, never one
 * of the fabricated codes, and `task_failed` with the task as subject when the
 * job itself failed. `undefined` when the record does not say anything yet
 * (none, or still open).
 */
export const conditionsOf = (record: RunRecord | undefined): readonly Finding[] | undefined => {
  if (record === undefined || record.state === "claimed" || record.state === "sending") {
    return undefined;
  }
  const failed: Finding[] =
    record.state === "failed" ? [{ code: "task_failed", subject: record.task }] : [];
  const found = (record.findings ?? []).filter(
    (finding) => !FABRICATED_CODES.includes(finding.code),
  );
  return [...failed, ...found];
};

/** Whether `subject` is one of the producing tasks: the only subject a fabricated code has. */
const isProducer = (subject: string): subject is JobTask =>
  (PRODUCER_TASKS as readonly string[]).includes(subject);

/** Whether `task` may say `code` about `subject`: both in its closed lists. */
const mayFind = (
  task: JobTask,
  finding: Pick<Finding, "code" | "subject">,
  producers: ProducerFindings,
): boolean => {
  if (FABRICATED_CODES.includes(finding.code)) {
    return finding.subject === task;
  }
  const codes = producers[task];
  return (
    codes !== undefined &&
    Object.hasOwn(codes, finding.code) &&
    (codes[finding.code] as readonly string[]).includes(finding.subject)
  );
};

/** Of what a producer said, only what it may say (privacy B1): everything else is dropped. */
export const ownFindings = (
  task: JobTask,
  findings: readonly Finding[],
  producers: ProducerFindings,
): Finding[] => findings.filter((finding) => mayFind(task, finding, producers));

/** The producer a streak belongs to, by its code and subject, both in closed lists; or none. */
export const producerOf = (
  notice: Pick<Notice, "code" | "subject">,
  producers: ProducerFindings,
): JobTask | undefined => {
  if (FABRICATED_CODES.includes(notice.code)) {
    return isProducer(notice.subject) ? notice.subject : undefined;
  }
  return PRODUCER_TASKS.find((task) => mayFind(task, notice, producers));
};
