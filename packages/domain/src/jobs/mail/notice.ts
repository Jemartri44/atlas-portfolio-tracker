// The warnings of the other jobs (feature 016; `contracts/mail.md` §2), sent
// by `dispatch_findings` once per streak. **Nothing of what a record says
// reaches a mail but through a closed list** (review of PR #104, privacy B1,
// N1 and N2): the subject must be one of the producing tasks, looked up with
// `Object.hasOwn`, the period must have the shape of a period and the code of
// the outcome must be one of ours; anything else is said as unknown, or no
// mail is sent at all. No amounts, ever.

import type { MailMessage } from "../../ports/notifier.js";
import { INTEGRITY_ERROR_CODES, REHEARSAL_CODES } from "../integrity.js";
import { PERIOD_SHAPE } from "../periods.js";
import type { Finding } from "../run-record.js";
import { count } from "./format.js";

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
  // Why the dump or the integrity could not read the ledger (E4).
  "ledger_absent",
  "ledger_unavailable",
  "ledger_unreadable",
];

/** What the dispatch knows of the streak besides its code and subject. */
export interface NoticeFacts {
  /** The day the streak began. */
  readonly since: string;
  /** The period of the record that said it. */
  readonly period?: string;
  /** The code of its outcome, or of why it could not be read. */
  readonly outcome?: string;
  /** The counts of the finding: numbers only. */
  readonly counts?: Readonly<Record<string, number>>;
}

/** The price sources, as the mail says them: a closed list. */
const SOURCES: Readonly<Record<string, string>> = {
  eodhd: "EODHD",
  alpha_vantage: "Alpha Vantage",
};

interface Redaction {
  /** The subjects this code may name: anything else is never sent. */
  readonly subjects: readonly string[];
  readonly write: (subject: string, facts: NoticeFacts) => { subject: string; lines: string[] };
}

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

/** A count of the finding, or `algunos` when it is not a whole number: never free text. */
const countOf = (facts: NoticeFacts, name: string): string => {
  const value =
    facts.counts !== undefined && Object.hasOwn(facts.counts, name)
      ? facts.counts[name]
      : undefined;
  return value !== undefined && Number.isInteger(value) && value >= 0 ? String(value) : "algunos";
};

/**
 * The codes a finding counts by, from `list`, each with its count; `other`
 * said as «otros». A key the list does not know is never written.
 */
const codesOf = (facts: NoticeFacts, list: readonly string[]): string =>
  [...list, "other"]
    .filter((name) => facts.counts !== undefined && Object.hasOwn(facts.counts, name))
    .map((name) => `${name === "other" ? "otros" : name}: ${countOf(facts, name)}`)
    .join(", ");

/** The period of a warning of the dump or of the integrity, in its subject. */
const periodInSubject = (facts: NoticeFacts): string =>
  validPeriod(facts) ?? "(periodo desconocido)";

/** A count as the mail says a size: with its thousands point. */
const bytesOf = (facts: NoticeFacts, name: string): string => {
  const value = countOf(facts, name);
  return value === "algunos" ? value : count(Number(value));
};

const TASK_SUBJECTS = Object.keys(TASKS);
const SOURCE_SUBJECTS = Object.keys(SOURCES);

const REDACTIONS: Readonly<Record<string, Redaction>> = {
  task_failed: {
    subjects: TASK_SUBJECTS,
    write: (task, facts) => ({
      subject: `[Atlas] Aviso: tarea ${task}`,
      lines: [
        `Ha fallado ${TASKS[task]} ${inPeriod(facts)} (${codeOf(facts)}), desde el ${facts.since}.`,
        "Se volverá a intentar en su próxima ejecución. Si el aviso se repite, mira el registro de la tarea en jobs/.",
      ],
    }),
  },
  record_unreadable: {
    subjects: TASK_SUBJECTS,
    write: (task, facts) => ({
      subject: `[Atlas] Aviso: registro de ${task}`,
      lines: [
        `El registro de ${task} (${TASKS[task]}) ${ofPeriod(facts)} no se puede leer (${codeOf(facts)}), desde el ${facts.since}.`,
        "La tarea no lo toma por libre; hay que mirarlo en jobs/ y repararlo.",
      ],
    }),
  },
  source_failing: {
    subjects: SOURCE_SUBJECTS,
    write: (source, facts) => ({
      subject: `[Atlas] Aviso: fuente de precios ${source}`,
      lines: [
        `${SOURCES[source]} lleva ${countOf(facts, "consecutive_failures")} fallos seguidos (umbral ${countOf(facts, "threshold")}), desde el ${facts.since}.`,
        "Los precios conservan su último valor con su antigüedad. Si se repite, puede que la fuente haya cambiado sus condiciones.",
      ],
    }),
  },
  currency_unchecked: {
    subjects: SOURCE_SUBJECTS,
    write: (source, facts) => ({
      subject: `[Atlas] Aviso: correspondencias sin contrastar en ${source}`,
      lines: [
        `${countOf(facts, "assets")} correspondencias de ${SOURCES[source]} no están contrastadas y la nube no las descarga, desde el ${facts.since}.`,
        "Contrástalas en la consola y súbelas con «atlas admin prices push».",
      ],
    }),
  },
  thesis_horizon_exceeded: {
    subjects: ["bucket"],
    write: (_bucket, facts) => ({
      subject: "[Atlas] Aviso: tesis del cubo",
      lines: [
        `${countOf(facts, "theses")} tesis del cubo han superado su horizonte previsto, desde el ${facts.since}.`,
        "Revísalas en la aplicación.",
      ],
    }),
  },
  prices_file_unreadable: {
    subjects: ["prices"],
    write: (_prices, facts) => ({
      subject: "[Atlas] Aviso: ficheros de precios ilegibles",
      lines: [
        `${countOf(facts, "files")} ficheros de cierres de la nube no se leen y la nube no los toca, desde el ${facts.since}: esos activos se quedan sin precio automático.`,
        "Mira cuáles con «atlas prices status» en la consola.",
      ],
    }),
  },
  ecb_update_rejected: {
    subjects: ["ecb"],
    write: (_ecb, facts) => ({
      subject: "[Atlas] Aviso: historico del BCE",
      lines: [
        `La descarga del histórico del BCE ${ofPeriod(facts)} cambiaba ${countOf(facts, "conflicts")} tipos ya publicados y no se ha activado, desde el ${facts.since}.`,
        "Sigue en vigor el histórico anterior; la descarga queda aparte en reference/ecb/rejected/.",
      ],
    }),
  },
  ecb_calendar_mismatch: {
    subjects: ["ecb"],
    write: (_ecb, facts) => ({
      subject: "[Atlas] Aviso: calendario del BCE",
      lines: [
        `${countOf(facts, "days")} días del histórico del BCE no cuadran con el calendario TARGET, desde el ${facts.since}.`,
        "Es un aviso, no un bloqueo: o el fichero está incompleto o el calendario cambió.",
      ],
    }),
  },
  ecb_history_damaged: {
    subjects: ["ecb"],
    write: (_ecb, facts) => ({
      subject: "[Atlas] Aviso: historico del BCE danado",
      lines:
        facts.counts?.conflicts === undefined
          ? [
              `El histórico del BCE en vigor no cuadra con su manifiesto y no se ha podido deshacer, desde el ${facts.since}: no se usa.`,
              "Se reconstruirá entero desde el ZIP oficial del BCE en cuanto se pueda descargar; mientras tanto, hay que mirarlo en reference/ecb/.",
            ]
          : [
              `El histórico del BCE en vigor no cuadra con su manifiesto, y el ZIP oficial del BCE contradice ${countOf(facts, "conflicts")} tipos de la última versión que aún se lee, desde el ${facts.since}: no se ha activado nada y no se usa.`,
              "Hace falta intervenir: mira reference/ecb/ y averigua cuál de los dos dice la verdad antes de que Atlas vuelva a usar el histórico.",
            ],
    }),
  },
  ecb_history_rebuilt: {
    subjects: ["ecb"],
    write: (_ecb, facts) => ({
      subject: "[Atlas] Aviso: historico del BCE reconstruido",
      lines: [
        `El histórico del BCE en vigor no cuadraba con su manifiesto y se ha reconstruido entero desde el ZIP oficial del BCE (${countOf(facts, "days")} días), desde el ${facts.since}.`,
        "Lo que había sigue en las versiones anteriores del bucket, sin usarse.",
      ],
    }),
  },
  ecb_rebuilt_unverified: {
    subjects: ["ecb"],
    write: (_ecb, facts) => ({
      subject: "[Atlas] Aviso: historico del BCE sin comparar",
      lines: [
        `El histórico del BCE se ha reconstruido desde el ZIP oficial sin poder compararlo con ninguna versión anterior, porque ninguna se podía leer, desde el ${facts.since}.`,
        "Es la excepción de ADR-0029 (nota del 2026-09-28): comprueba los tipos de tus operaciones con «atlas check --deep».",
      ],
    }),
  },
  backup_object_differs: {
    subjects: ["backup"],
    write: (_backup, facts) => ({
      subject: `[Atlas] Aviso: volcado ${periodInSubject(facts)}`,
      lines: [
        `El volcado mensual ${ofPeriod(facts)} encontró ${countOf(facts, "objects")} objetos ya escritos con otros bytes y no ha escrito nada más, desde el ${facts.since}.`,
        `Un volcado no se sobrescribe nunca: mira backups/${validPeriod(facts) ?? "<periodo>"}/ antes de nada, con el procedimiento de los avisos.`,
      ],
    }),
  },
  backup_ecb_inconsistent: {
    subjects: ["backup"],
    write: (_backup, facts) => ({
      subject: `[Atlas] Aviso: volcado ${periodInSubject(facts)}`,
      lines: [
        `El volcado mensual ${ofPeriod(facts)} no ha guardado el manifiesto del histórico del BCE, desde el ${facts.since}: el fichero del volcado no es el que nombra el manifiesto en vigor.`,
        "El resto del volcado está completo. El histórico del BCE se puede volver a bajar del BCE cuando haga falta.",
      ],
    }),
  },
  integrity_errors: {
    subjects: ["integrity"],
    write: (_integrity, facts) => ({
      subject: `[Atlas] Aviso: integridad ${periodInSubject(facts)}`,
      lines: [
        `La comprobación de integridad ${ofPeriod(facts)} encontró ${countOf(facts, "errors")} errores (${codesOf(facts, INTEGRITY_ERROR_CODES)}), desde el ${facts.since}.`,
        "Míralos en la consola con «atlas check --deep»; se rectifican con el libro, nunca restaurando.",
      ],
    }),
  },
  restore_rehearsal_differs: {
    subjects: ["integrity"],
    write: (_integrity, facts) => ({
      subject: `[Atlas] Aviso: integridad ${periodInSubject(facts)}`,
      lines: [
        `El ensayo de restauración ${ofPeriod(facts)} no reproduce el libro con el último volcado (${codesOf(facts, REHEARSAL_CODES)}), desde el ${facts.since}.`,
        "No restaures desde ese volcado sin mirarlo antes: sigue el procedimiento de los avisos.",
      ],
    }),
  },
  ledger_size_above_threshold: {
    subjects: ["integrity"],
    write: (_integrity, facts) => ({
      subject: `[Atlas] Aviso: integridad ${periodInSubject(facts)}`,
      lines: [
        `El libro ocupa ${bytesOf(facts, "bytes")} bytes (umbral ${bytesOf(facts, "threshold")}), desde el ${facts.since}.`,
        "Revisa el plazo de expiración de las versiones no vigentes del bucket (ADR-0006).",
      ],
    }),
  },
};

/** The codes the redaction knows. */
export const NOTICE_CODES: readonly string[] = Object.keys(REDACTIONS);

/** The mail of a streak, or nothing when its code or its subject is not one the redaction knows. */
export const noticeMail = (
  finding: Pick<Finding, "code" | "subject">,
  facts: NoticeFacts,
  origin: string,
): MailMessage | undefined => {
  const redaction = Object.hasOwn(REDACTIONS, finding.code) ? REDACTIONS[finding.code] : undefined;
  if (redaction === undefined || !redaction.subjects.includes(finding.subject)) {
    return undefined;
  }
  const { subject, lines } = redaction.write(finding.subject, facts);
  return { subject, body: [...lines, "", `Abre Atlas: ${origin}`, ""].join("\n") };
};
