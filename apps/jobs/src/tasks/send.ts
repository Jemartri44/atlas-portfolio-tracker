// How the tasks of the mail function send (feature 016): the `Notifier` of
// the function — only the mail family has one (§8.2 B2) — and its origin, the
// one link a mail may carry. And **at most once** for a periodic warning
// (§8.1 P10): the record is marked `sending` right before the mail goes, so a
// cut after that is closed as unknown and never sent again. Nothing here
// reads the switch of the amounts (§8.2 M2) nor reaches a price.

import type { MailMessage, Notifier } from "@atlas/domain/jobs";
import type { TaskContext, TaskResult } from "../run.js";

export const notifierOf = (context: TaskContext): Notifier => {
  const notifier = context.deps.notifier;
  if (notifier === undefined) {
    throw new RangeError("a mail task without a notifier");
  }
  return notifier;
};

export const originOf = (context: TaskContext): string => context.deps.config.mail?.origin ?? "";

/** Sends a periodic warning at most once: `sending` first, then the mail, then the outcome. */
export const sendOnce = async (
  context: TaskContext,
  mail: MailMessage,
  counts: Readonly<Record<string, number>> = {},
): Promise<TaskResult> => {
  await context.markSending();
  const sent = await notifierOf(context).send(mail);
  if (sent.ok) {
    return { state: "done", outcome: { code: "mail_sent", counts } };
  }
  return {
    // SES said no before accepting: nothing went, and the next run tries again.
    state: sent.code === "mail_send_unknown" ? "send_unknown" : "send_failed",
    outcome: { code: sent.code, counts },
  };
};
