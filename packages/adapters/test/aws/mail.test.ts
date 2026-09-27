// Feature 016, E1 (R6, R7; mutant 3): the `Notifier` of SES puts the recipient
// of SSM itself, validates it, and says every failure with its own code.

import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { describe, expect, it } from "vitest";
import { MailRefused, MailUnknown, recipientParameter, sesNotifier } from "../../src/aws/mail.js";
import { SdkMailSender } from "../../src/aws/sdk-ses.js";
import { TestOnlyFakeSes } from "./test-only-fake-ses.js";
import { TestOnlyFakeSsm } from "./test-only-fake-ssm.js";

const PREFIX = "/atlas/prod/";
const MESSAGE = { subject: "[Atlas] Recordatorio mensual 2026-10", body: "Hola\n" };

const setup = (recipient: string | undefined) => {
  const ssm = new TestOnlyFakeSsm();
  if (recipient !== undefined) {
    ssm.set(recipientParameter(PREFIX), recipient);
  }
  const ses = new TestOnlyFakeSes();
  const notifier = sesNotifier({
    sender: ses,
    parameters: ssm,
    ssmPrefix: PREFIX,
    from: "atlas@example.test",
  });
  return { ssm, ses, notifier };
};

describe("the Notifier of SES (R6, R7)", () => {
  it("sends to the recipient of SSM, from the configured sender, the message as written", async () => {
    const { ses, ssm, notifier } = setup("user@example.test");
    expect(await notifier.send(MESSAGE)).toEqual({ ok: true });
    expect(ses.sent).toEqual([{ from: "atlas@example.test", to: "user@example.test", ...MESSAGE }]);
    expect(ssm.reads).toContain("/atlas/prod/mail/recipient");
  });

  it("reads the recipient on every send, never keeping an old one", async () => {
    const { ses, ssm, notifier } = setup("user@example.test");
    await notifier.send(MESSAGE);
    ssm.set(recipientParameter(PREFIX), "other@example.test");
    await notifier.send(MESSAGE);
    expect(ses.sent.map((mail) => mail.to)).toEqual(["user@example.test", "other@example.test"]);
  });

  it("never takes the recipient from the message", async () => {
    const { ses, notifier } = setup("user@example.test");
    await notifier.send({ ...MESSAGE, to: "attacker@example.test" } as never);
    expect(ses.sent.map((mail) => mail.to)).toEqual(["user@example.test"]);
  });

  it("does not send without a recipient, with one that is not an address, or when SSM fails", async () => {
    expect(await setup(undefined).notifier.send(MESSAGE)).toEqual({
      ok: false,
      code: "mail_recipient_missing",
    });
    for (const bad of [
      "",
      "user@example.test,other@example.test",
      "User <user@example.test>",
      "user@example.test\n",
    ]) {
      const { ses, notifier } = setup(bad);
      expect(await notifier.send(MESSAGE), bad).toEqual({
        ok: false,
        code: "mail_recipient_invalid",
      });
      expect(ses.attempts).toEqual([]);
    }
    const { ssm, ses, notifier } = setup("user@example.test");
    ssm.throttleNext();
    expect(await notifier.send(MESSAGE)).toEqual({ ok: false, code: "mail_recipient_unavailable" });
    expect(ses.attempts).toEqual([]);
  });

  it("says a refusal of SES as not sent, and no answer as unknown, never as sent", async () => {
    const refused = setup("user@example.test");
    refused.ses.refuseNext();
    expect(await refused.notifier.send(MESSAGE)).toEqual({ ok: false, code: "mail_send_failed" });
    const lost = setup("user@example.test");
    lost.ses.loseAfterSendingNext();
    expect(await lost.notifier.send(MESSAGE)).toEqual({ ok: false, code: "mail_send_unknown" });
  });
});

const sesError = (name: string, status?: number) =>
  Object.assign(
    new Error(`${name}: user@example.test was rejected by arn:aws:ses:eu-west-1:123456789012`),
    {
      name,
      ...(status === undefined ? {} : { $metadata: { httpStatusCode: status } }),
    },
  );

describe("the thin adapter of SES v2", () => {
  it("sends one SendEmail with simple content, text only, in UTF-8, to one recipient", async () => {
    const sent: unknown[] = [];
    const sender = new SdkMailSender({ send: async (command) => void sent.push(command) });
    await sender.sendText({
      from: "a@example.test",
      to: "b@example.test",
      subject: "S",
      body: "Cuerpo ñ",
    });
    expect(sent).toHaveLength(1);
    const command = sent[0] as SendEmailCommand;
    expect(command).toBeInstanceOf(SendEmailCommand);
    expect(command.input).toEqual({
      FromEmailAddress: "a@example.test",
      Destination: { ToAddresses: ["b@example.test"] },
      Content: {
        Simple: {
          Subject: { Data: "S", Charset: "UTF-8" },
          Body: { Text: { Data: "Cuerpo ñ", Charset: "UTF-8" } },
        },
      },
    });
  });

  it("reads a 4xx as a refusal and anything else as unknown, by name and status only", async () => {
    const outcome = async (error: unknown) => {
      const sender = new SdkMailSender({ send: () => Promise.reject(error) });
      return sender
        .sendText({ from: "a@example.test", to: "b@example.test", subject: "S", body: "B" })
        .catch((e) => e);
    };
    for (const [error, kind, reason] of [
      [sesError("MessageRejected", 400), MailRefused, "MessageRejected"],
      [sesError("TooManyRequestsException", 429), MailRefused, "TooManyRequestsException"],
      [sesError("Weird Name!", 400), MailRefused, "unknown"],
      [sesError("InternalFailure", 500), MailUnknown, "status_500"],
      [sesError("TimeoutError"), MailUnknown, "TimeoutError"],
      ["not an error", MailUnknown, "unknown"],
    ] as const) {
      const thrown = await outcome(error);
      expect(thrown).toBeInstanceOf(kind);
      expect(thrown.reason).toBe(reason);
      expect(String(thrown.message)).not.toContain("user@example.test");
      expect(String(thrown.message)).not.toContain("arn:");
    }
  });
});
