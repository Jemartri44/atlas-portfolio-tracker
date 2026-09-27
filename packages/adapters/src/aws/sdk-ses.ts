// The thin adapter of `MailSender` over `@aws-sdk/client-sesv2` (feature 016,
// E1; §8.1 P8, authorised by the user). **The only file with the SES client**
// (architecture test), and it sends **one** command, `SendEmail`, with simple
// content: a subject and a plain-text body, both in UTF-8, to one recipient
// (`questions.md` §1.5). The IAM condition of ADR-0034, row 12, applies to it
// (`ses:SendEmail`, `ses:FromAddress`, `ses:Recipients`; §1.1).
//
// What an error means, read by its name and status and never by its message
// (`sdk-errors.ts`):
// - an answer of SES with a 4xx — a message rejected, an identity not
//   verified, the sending paused, a throttling — is a refusal: **not sent**;
// - a 5xx, the network, a timeout or anything else: **unknown**, since the
//   request may have reached SES. The warnings are sent at most once, so an
//   unknown fate is never retried as if nothing had happened.

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { MailRefused, type MailSender, MailUnknown, type OutgoingMail } from "./mail.js";
import { factsOf } from "./sdk-errors.js";

/** What the adapter sends: the client of the SDK, or a simulated one with the same call. */
export interface SesSender {
  send(command: SendEmailCommand): Promise<unknown>;
}

const reasonOf = (name: string): string => (/^[A-Za-z]{1,64}$/.test(name) ? name : "unknown");

export class SdkMailSender implements MailSender {
  constructor(private readonly client: SesSender) {}

  async sendText(mail: OutgoingMail): Promise<void> {
    try {
      await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: mail.from,
          Destination: { ToAddresses: [mail.to] },
          Content: {
            Simple: {
              Subject: { Data: mail.subject, Charset: "UTF-8" },
              Body: { Text: { Data: mail.body, Charset: "UTF-8" } },
            },
          },
        }),
      );
    } catch (error) {
      const { name, status } = factsOf(error);
      if (status !== undefined && status >= 400 && status < 500) {
        throw new MailRefused(reasonOf(name));
      }
      throw new MailUnknown(status === undefined ? reasonOf(name) : `status_${status}`);
    }
  }
}

/** The sender of production: the client of SES v2 with the credentials of the role. */
export const productionMailSender = (): MailSender => new SdkMailSender(new SESv2Client({}));
