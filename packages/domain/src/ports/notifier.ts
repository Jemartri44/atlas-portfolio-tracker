// The port that sends mail (feature 016; `CLAUDE.md`, ports). It receives a
// message **already written** — a subject and a plain-text body — and answers
// with a result that has a code. **It never receives the recipient**: the
// adapter puts it, read from SSM (ADR-0028, row 17; ADR-0034, row 12), so
// nothing of the domain or of the redaction can ever write to another address
// (mutant 3). A transient failure is a failure with its code, never a mail
// taken as sent (§8.1 P10).

export interface MailMessage {
  /** ASCII, with the period of the job (Q5). */
  readonly subject: string;
  /** Plain text, Spanish, no HTML, nothing remote. */
  readonly body: string;
}

export const NOTIFIER_FAILURES = [
  // The parameter of the recipient is not in SSM.
  "mail_recipient_missing",
  // It is there, and it is not one mail address.
  "mail_recipient_invalid",
  // SSM did not answer (a throttling, a 5xx, the network).
  "mail_recipient_unavailable",
  // SES refused the mail: it was not sent.
  "mail_send_failed",
  // The request went and no answer came back: it may have been sent.
  "mail_send_unknown",
] as const;

export type NotifierFailure = (typeof NOTIFIER_FAILURES)[number];

export type NotifierResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: NotifierFailure };

export interface Notifier {
  send(message: MailMessage): Promise<NotifierResult>;
}
