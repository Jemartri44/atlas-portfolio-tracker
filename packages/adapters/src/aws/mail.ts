// The `Notifier` of SES (feature 016, E1, block 3), written against a narrow
// interface of its own, `MailSender`, which the thin adapter of the SDK
// implements (`sdk-ses.ts`) and the tests simulate — as the 015 did with S3
// and SSM. The SDK plugs in only in the composition of the jobs.
//
// **It puts the recipient itself**: read from SSM on every send
// (`/atlas/<env>/mail/recipient`, a `String` that Terraform writes from
// `terraform.tfvars`, ADR-0034, row 12), never taken from the message, so
// nothing of the domain can write to another address (mutant 3). A recipient
// that is not one mail address does not send. **It never reads the switch of
// the amounts** (§8.2 M2): the composition of the mail task does.
//
// Every failure is a code, never a mail taken as sent: SSM that does not
// answer, a parameter missing or not an address, SES that refuses (it was not
// sent) and SES that does not answer (it may have been sent).

import {
  isMailAddress,
  type MailMessage,
  type Notifier,
  type NotifierResult,
} from "@atlas/domain/jobs";
import type { ParameterStore } from "./parameter-store.js";

export interface OutgoingMail {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

/** What sends a plain-text mail: the SDK of SES v2, or a double. */
export interface MailSender {
  sendText(mail: OutgoingMail): Promise<void>;
}

/** SES answered no: the mail was **not** sent, and sending it again is safe. */
export class MailRefused extends Error {
  override readonly name = "MailRefused";
  constructor(readonly reason: string) {
    super("the mail was refused");
  }
}

/** No answer came back from SES: the mail **may** have been sent. */
export class MailUnknown extends Error {
  override readonly name = "MailUnknown";
  constructor(readonly reason: string) {
    super("the fate of the mail is unknown");
  }
}

export const recipientParameter = (ssmPrefix: string): string => `${ssmPrefix}mail/recipient`;

export interface SesNotifierDeps {
  readonly sender: MailSender;
  readonly parameters: ParameterStore;
  /** `/atlas/<env>/`. */
  readonly ssmPrefix: string;
  /** The verified sender, from the configuration of the function. */
  readonly from: string;
}

const failure = (code: Exclude<NotifierResult, { ok: true }>["code"]): NotifierResult => ({
  ok: false,
  code,
});

export const sesNotifier = (deps: SesNotifierDeps): Notifier => ({
  send: async (message: MailMessage): Promise<NotifierResult> => {
    let to: string | undefined;
    try {
      to = await deps.parameters.get(recipientParameter(deps.ssmPrefix));
    } catch {
      return failure("mail_recipient_unavailable");
    }
    if (to === undefined) {
      return failure("mail_recipient_missing");
    }
    if (!isMailAddress(to)) {
      return failure("mail_recipient_invalid");
    }
    try {
      await deps.sender.sendText({
        from: deps.from,
        to,
        subject: message.subject,
        body: message.body,
      });
    } catch (error) {
      return failure(error instanceof MailRefused ? "mail_send_failed" : "mail_send_unknown");
    }
    return { ok: true };
  },
});
