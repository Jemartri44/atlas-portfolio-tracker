// A `Notifier` that writes each mail to a folder (feature 016, E1): for the
// tests and for the captures of the mails, never for production — it lives
// under `test/` and is named `test-only-`, so the guardian of the doubles
// keeps it out of `jobs.zip` (`tests/jobs-package.test.ts`, mutant 10). The
// folder is the session scratchpad, never the repository.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MailMessage, Notifier, NotifierResult } from "@atlas/domain/jobs";

export class TestOnlyFileNotifier implements Notifier {
  private count = 0;

  constructor(private readonly folder: string) {}

  async send(message: MailMessage): Promise<NotifierResult> {
    await mkdir(this.folder, { recursive: true });
    this.count += 1;
    const name = `${String(this.count).padStart(3, "0")}.txt`;
    await writeFile(join(this.folder, name), `Asunto: ${message.subject}\n\n${message.body}`);
    return { ok: true };
  }
}
