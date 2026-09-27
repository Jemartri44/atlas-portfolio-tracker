// The warnings of the other jobs (feature 016; `contracts/mail.md` §2), sent
// by `dispatch_findings` once per streak. **Nothing of what a record says
// reaches a mail but through a closed list** (review of PR #104, privacy B1,
// N1 and N2): the subject must be one of the producing tasks, looked up with
// `Object.hasOwn`, the period must have the shape of a period and the code of
// the outcome must be one of ours; anything else is said as unknown, or no
// mail is sent at all. No amounts, ever.

import type { MailMessage } from "../../ports/notifier.js";
import { PERIOD_SHAPE } from "../periods.js";
import type { Finding } from "../run-record.js";

/** The producing tasks, as the mail says them: the closed list of subjects. */
const TASKS: Readonly<Record<string, string>> = {
  ecb_update: "la descarga del histórico del BCE",
  prices_update: "la descarga de los precios de cierre",
  monthly_backup: "el volcado mensual",
  quarterly_integrity: "la comprobación de integridad",
};

/** The codes of an outcome or of a record the mail may say: ours, closed. */
const CODES: readonly string[] = [
  "task_error",
  "job_record_unreadable",
  "job_record_newer_format",
  "not_utf8",
];

/** What the dispatch knows of the streak besides its code and subject. */
export interface NoticeFacts {
  /** The day the streak began. */
  readonly since: string;
  /** The period of the record that said it. */
  readonly period?: string;
  /** The code of its outcome, or of why it could not be read. */
  readonly outcome?: string;
}

type Redaction = (task: string, facts: NoticeFacts) => { subject: string; lines: string[] };

const validPeriod = (facts: NoticeFacts): string | undefined =>
  facts.period !== undefined && PERIOD_SHAPE.test(facts.period) ? facts.period : undefined;

const inPeriod = (facts: NoticeFacts): string => {
  const period = validPeriod(facts);
  return period === undefined ? "en un periodo desconocido" : `en el periodo ${period}`;
};

const ofPeriod = (facts: NoticeFacts): string => {
  const period = validPeriod(facts);
  return period === undefined ? "de un periodo desconocido" : `del periodo ${period}`;
};

const codeOf = (facts: NoticeFacts): string =>
  facts.outcome !== undefined && CODES.includes(facts.outcome)
    ? `código ${facts.outcome}`
    : "código desconocido";

const REDACTIONS: Readonly<Record<string, Redaction>> = {
  task_failed: (task, facts) => ({
    subject: `[Atlas] Aviso: tarea ${task}`,
    lines: [
      `Ha fallado ${TASKS[task]} ${inPeriod(facts)} (${codeOf(facts)}), desde el ${facts.since}.`,
      "Se volverá a intentar en su próxima ejecución. Si el aviso se repite, mira el registro de la tarea en jobs/.",
    ],
  }),
  record_unreadable: (task, facts) => ({
    subject: `[Atlas] Aviso: registro de ${task}`,
    lines: [
      `El registro de ${task} (${TASKS[task]}) ${ofPeriod(facts)} no se puede leer (${codeOf(facts)}), desde el ${facts.since}.`,
      "La tarea no lo toma por libre; hay que mirarlo en jobs/ y repararlo.",
    ],
  }),
};

/** The codes the redaction knows. */
export const NOTICE_CODES: readonly string[] = Object.keys(REDACTIONS);

/** The mail of a streak, or nothing when its code or its subject is not one the redaction knows. */
export const noticeMail = (
  finding: Pick<Finding, "code" | "subject">,
  facts: NoticeFacts,
  origin: string,
): MailMessage | undefined => {
  if (!Object.hasOwn(REDACTIONS, finding.code) || !Object.hasOwn(TASKS, finding.subject)) {
    return undefined;
  }
  const { subject, lines } = (REDACTIONS[finding.code] as Redaction)(finding.subject, facts);
  return { subject, body: [...lines, "", `Abre Atlas: ${origin}`, ""].join("\n") };
};
