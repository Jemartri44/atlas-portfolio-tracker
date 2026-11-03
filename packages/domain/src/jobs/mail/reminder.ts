// The monthly reminder, through the common layout (`layout.ts`); the subject
// in ASCII with its month, so a duplicate is recognised. **Without amounts
// unless the switch is on** (ADR-0028, row 18): the classes of the core,
// percentages, counts and dates; with the switch on, the euros of the split
// and nothing else — never an account, an ISIN, a symbol or the name of an
// asset, which the facts do not even carry.

import type { MailMessage } from "../../ports/notifier.js";
import type { AmountsSwitch } from "../amounts.js";
import type { ReminderFacts } from "../reminder.js";
import type { TaxDeadlineFacts } from "../tax-deadlines.js";
import { CLASS_NAMES, count, day, euros, monthName, percent } from "./format.js";
import { composeMail, type MailBlock, type MailSection } from "./layout.js";

const BACKUP_ORDER = "atlas backup --to <dir> --from-bucket --env prod";

const contribution = (facts: ReminderFacts, amounts: AmountsSwitch): MailSection => {
  const split = facts.contribution;
  if (!split.ok) {
    return {
      heading: "Reparto del núcleo",
      blocks: [
        {
          kind: "paragraph",
          text: `No se ha podido calcular el reparto (${split.code}). Abre la aplicación para verlo.`,
        },
      ],
    };
  }
  const on = amounts === "on";
  const blocks: MailBlock[] = [
    {
      kind: "rows",
      rows: split.classes.map((share) => ({
        label: CLASS_NAMES[share.asset_class],
        values: on ? [percent(share.pct), euros(share.eur)] : [percent(share.pct)],
      })),
    },
    {
      kind: "paragraph",
      text: on
        ? `Total ${euros(split.total)}: núcleo ${euros(split.core)}, cubo ${euros(split.bucket)}. El cubo es un presupuesto aparte, fuera del reparto.`
        : "El cubo es un presupuesto aparte, fuera del reparto.",
    },
    ...(split.approximation
      ? [
          {
            kind: "paragraph",
            text: "Algún peso usa la aproximación por ETF de referencia (weights_use_approximation).",
          } as const,
        ]
      : []),
  ];
  return { heading: "Reparto del núcleo", blocks };
};

const access = (facts: ReminderFacts): MailSection => {
  const signIn = facts.signIn;
  return {
    heading: "Acceso",
    blocks: [
      {
        kind: "paragraph",
        text:
          signIn.last === undefined
            ? "No consta ningún inicio de sesión."
            : `Último inicio de sesión en la web: hace ${count(signIn.days as number)} días (${day(signIn.last)}).`,
      },
      ...(signIn.webUnreadable
        ? [
            {
              kind: "paragraph",
              text: "La fecha del último inicio de sesión web no se ha podido leer (web_sign_in_unreadable).",
            } as const,
          ]
        : []),
    ],
  };
};

const repurchaseWarning = (facts: ReminderFacts): string[] => {
  if (facts.repurchase === "unchecked") {
    return ["No se ha podido comprobar la ventana de recompra. Mírala en Atlas antes de comprar."];
  }
  if (facts.repurchase === 0) {
    return [];
  }
  return [
    facts.repurchase === 1
      ? "Una compra del plan cae en la ventana de recompra. Mírala en Atlas antes de comprar."
      : "Varias compras del plan caen en la ventana de recompra. Míralas en Atlas antes de comprar.",
  ];
};

const deadlineWarning = (fact: TaxDeadlineFacts): string => {
  switch (fact.kind) {
    case "filing":
      return `Renta de ${fact.year}: el plazo de presentación acaba el ${day(fact.filing_end)}.${
        fact.direct_debit_end === undefined
          ? ""
          : ` Para domiciliar el pago, el límite es el ${day(fact.direct_debit_end)}.`
      }`;
    case "second_instalment":
      return `Renta de ${fact.year}: el segundo plazo vence el ${day(fact.due)}.${
        fact.direct_debit_end === undefined
          ? ""
          : ` Si domiciliaste el primero, puedes domiciliarlo hasta el ${day(fact.direct_debit_end)}.`
      }`;
    case "unverified":
      return `Renta de ${fact.year}: la fecha ${
        fact.deadline === "filing" ? "de fin de campaña" : "del segundo plazo"
      } no está comprobada en Atlas. Mírala en la sede de la Agencia Tributaria.`;
  }
};

export const reminderMail = (
  facts: ReminderFacts,
  amounts: AmountsSwitch,
  origin: string,
): MailMessage =>
  composeMail(
    {
      subject: `[Atlas] Recordatorio de ${monthName(facts.period)}`,
      kicker: "Atlas · Recordatorio mensual",
      title: `Aportación de ${monthName(facts.period)}`,
      warnings: [
        ...repurchaseWarning(facts),
        ...facts.taxDeadlines.map(deadlineWarning),
        ...(facts.signIn.deadline === undefined
          ? []
          : [
              `Si nadie inicia sesión antes del ${day(facts.signIn.deadline)}, Google puede borrar el cliente OAuth. Entra en la web para evitarlo.`,
            ]),
      ],
      sections: [
        contribution(facts, amounts),
        access(facts),
        {
          heading: "Copia fuera de AWS",
          blocks: [
            { kind: "paragraph", text: "Haz la copia a tu disco:" },
            { kind: "command", text: BACKUP_ORDER },
          ],
        },
      ],
    },
    origin,
  );
