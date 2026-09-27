// The monthly reminder (feature 016; `contracts/mail.md` §1): plain text,
// Spanish, no HTML and nothing remote; the subject in ASCII with its period
// (Q5; §8.1 P10), so a duplicate is recognised. **Without amounts unless the
// switch is on** (ADR-0028, row 18; §8.1 P9): the classes of the core,
// percentages, counts, dates and codes; with the switch on, the euros of the
// split and nothing else — never an account, an ISIN, a symbol or the name of
// an asset, which the facts do not even carry.

import type { MailMessage } from "../../ports/notifier.js";
import type { AmountsSwitch } from "../amounts.js";
import type { ReminderFacts } from "../reminder.js";
import { CLASS_NAMES, count, euros, monthName, percent } from "./format.js";

const BACKUP_ORDER = "atlas backup --to <dir> --from-bucket --env prod";

const contributionLines = (facts: ReminderFacts, amounts: AmountsSwitch): string[] => {
  const contribution = facts.contribution;
  if (!contribution.ok) {
    return [
      `  No se ha podido calcular el reparto (${contribution.code}). Abre la aplicación para verlo.`,
    ];
  }
  const width = Math.max(
    ...contribution.classes.map((share) => CLASS_NAMES[share.asset_class].length),
  );
  return [
    ...contribution.classes.map(
      (share) =>
        `  ${CLASS_NAMES[share.asset_class].padEnd(width)}  ${percent(share.pct).padStart(7)}`,
    ),
    "  Cubo: presupuesto aparte, fuera del reparto.",
    ...(amounts === "on"
      ? [
          `  Importes: total ${euros(contribution.total)}; núcleo ${euros(contribution.core)}; cubo ${euros(contribution.bucket)}.`,
          ...contribution.classes.map(
            (share) => `    ${CLASS_NAMES[share.asset_class]}: ${euros(share.eur)}`,
          ),
        ]
      : []),
    ...(contribution.approximation
      ? ["  Algún peso usa la aproximación por ETF de referencia (weights_use_approximation)."]
      : []),
  ];
};

const signInLines = (facts: ReminderFacts): string[] => {
  const signIn = facts.signIn;
  return [
    signIn.last === undefined
      ? "  No consta ningún inicio de sesión."
      : `  Último inicio de sesión: hace ${count(signIn.days as number)} días (${signIn.last}), en la web o en la consola.`,
    ...(signIn.deadline === undefined
      ? []
      : [
          `  Aviso: si nadie inicia sesión antes del ${signIn.deadline}, Google puede borrar el cliente OAuth. Inicia sesión en la web o con «atlas remote login».`,
        ]),
    ...(signIn.webUnreadable
      ? [
          "  La fecha del último inicio de sesión web no se ha podido leer (web_sign_in_unreadable).",
        ]
      : []),
  ];
};

const tokenLines = (facts: ReminderFacts): string[] => {
  const tokens = facts.tokens;
  if (tokens === "unavailable") {
    return ["  No se ha podido leer el registro de los tokens de la consola (tokens_unavailable)."];
  }
  return [
    `  Tokens de consola vivos: ${count(tokens.alive)}. Emitidos en ${monthName(facts.issuedMonth)}: ${count(tokens.issued)}.`,
    ...(tokens.unreadable === 0
      ? []
      : [`  Registros de tokens ilegibles: ${count(tokens.unreadable)}.`]),
    "  Si no reconoces una emisión, tu cuenta de Google puede estar comprometida (docs/runbooks/stolen-google-account.md).",
  ];
};

export const reminderMail = (
  facts: ReminderFacts,
  amounts: AmountsSwitch,
  origin: string,
): MailMessage => ({
  subject: `[Atlas] Recordatorio mensual ${facts.period}`,
  body: [
    `Aportación de ${monthName(facts.period)}`,
    ...contributionLines(facts, amounts),
    "",
    "Acceso",
    ...signInLines(facts),
    ...tokenLines(facts),
    "",
    "Copia fuera de AWS",
    `  Haz la copia a tu disco: ${BACKUP_ORDER}`,
    "",
    `Abre Atlas: ${origin}`,
    "",
  ].join("\n"),
});
