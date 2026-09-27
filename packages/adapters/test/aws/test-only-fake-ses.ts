// A double of `MailSender` (feature 016, E1), for the tests only: it keeps
// every mail it was given and can be told to refuse the next one (SES said no:
// not sent) or to lose it (no answer: it may have been sent). It imitates what
// `sdk-ses.ts` makes of the answers of SES v2 (`questions.md` §1.5).

import {
  MailRefused,
  type MailSender,
  MailUnknown,
  type OutgoingMail,
} from "../../src/aws/mail.js";

export class TestOnlyFakeSes implements MailSender {
  readonly sent: OutgoingMail[] = [];
  /** Every attempt, sent or not, in order. */
  readonly attempts: OutgoingMail[] = [];
  private next: ("refuse" | "lose" | "lose-after-send")[] = [];
  /** Called before each send: a test cuts the run there. */
  beforeSend: ((mail: OutgoingMail) => void) | undefined;

  refuseNext(count = 1): void {
    this.next.push(...Array.from({ length: count }, () => "refuse" as const));
  }

  /** No answer, and the mail did **not** go. */
  loseNext(): void {
    this.next.push("lose");
  }

  /** No answer, and the mail **did** go: the case a retry must not send twice. */
  loseAfterSendingNext(): void {
    this.next.push("lose-after-send");
  }

  async sendText(mail: OutgoingMail): Promise<void> {
    this.attempts.push(mail);
    this.beforeSend?.(mail);
    const what = this.next.shift();
    if (what === "refuse") {
      throw new MailRefused("MessageRejected");
    }
    if (what === "lose") {
      throw new MailUnknown("network");
    }
    this.sent.push(mail);
    if (what === "lose-after-send") {
      throw new MailUnknown("network");
    }
  }
}
