// The warnings of the other jobs (feature 016; `contracts/mail.md` §2), sent
// by `dispatch_findings` once per streak. Each code has its sentence; a code
// the redaction does not know is never sent as free text — the dispatch
// leaves it out and says so. No amounts, ever: what a finding carries are
// counts, dates, a source and a task, never an asset, a symbol, an ISIN, an
// account or an amount (§8.2 B2).

import type { MailMessage } from "../../ports/notifier.js";
import type { Finding } from "../run-record.js";

/** The task names, as the mail says them. */
const TASKS: Readonly<Record<string, string>> = {
  ecb_update: "la descarga del histórico del BCE",
  prices_update: "la descarga de los precios de cierre",
  monthly_backup: "el volcado mensual",
  quarterly_integrity: "la comprobación de integridad",
};

type Redaction = (finding: Finding, since: string) => { subject: string; lines: string[] };

const REDACTIONS: Readonly<Record<string, Redaction>> = {
  task_failed: (finding, since) => ({
    subject: `[Atlas] Aviso: tarea ${finding.subject}`,
    lines: [
      `Ha fallado ${TASKS[finding.subject] ?? `la tarea ${finding.subject}`} (desde el ${since}).`,
      "Se volverá a intentar en su próxima ejecución. Si el aviso se repite, mira el registro de la tarea en jobs/.",
    ],
  }),
};

/** The codes the redaction knows. */
export const NOTICE_CODES: readonly string[] = Object.keys(REDACTIONS);

/** The mail of a streak, or nothing when its code is not one the redaction knows. */
export const noticeMail = (
  finding: Finding,
  since: string,
  origin: string,
): MailMessage | undefined => {
  const redaction = Object.hasOwn(REDACTIONS, finding.code) ? REDACTIONS[finding.code] : undefined;
  if (redaction === undefined) {
    return undefined;
  }
  const { subject, lines } = redaction(finding, since);
  return { subject, body: [...lines, "", `Abre Atlas: ${origin}`, ""].join("\n") };
};
