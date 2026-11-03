// The port that sends mail (`CLAUDE.md`, ports). It receives a message
// **already written** — a subject, a plain-text body and the same mail in
// HTML (`jobs/mail/layout.ts`) — and answers with a
// result that has a code. **It never receives the recipient**: the adapter puts
// it, read from SSM (ADR-0028, row 17; ADR-0034, row 12), so nothing of the
// domain or of the redaction can ever write to another address. A transient
// failure is a failure with its code, never a mail taken as sent.

export interface MailMessage {
  /** ASCII, with the period of the job. */
  readonly subject: string;
  /** Plain text, Spanish: the fallback of the HTML, with the same content. */
  readonly body: string;
  /** Inline styles only, nothing remote, one link to the origin (`jobs/mail/layout.ts`). */
  readonly html: string;
}

export type NotifierFailure =
  // The parameter of the recipient is not in SSM.
  | "mail_recipient_missing"
  // It is there, and it is not one mail address.
  | "mail_recipient_invalid"
  // SSM did not answer (a throttling, a 5xx, the network).
  | "mail_recipient_unavailable"
  // SES refused the mail: it was not sent.
  | "mail_send_failed"
  // The request went and no answer came back: it may have been sent.
  | "mail_send_unknown";

export type NotifierResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: NotifierFailure };

export interface Notifier {
  send(message: MailMessage): Promise<NotifierResult>;
}
