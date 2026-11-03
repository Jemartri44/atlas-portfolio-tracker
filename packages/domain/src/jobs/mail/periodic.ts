// The periodic warnings: the weekly
// review, the income tax of January and the thresholds of the 720 and 721,
// through the common layout (`layout.ts`); the subject in ASCII with its period.
//
// - **Weekly review**: the classes of the core, points and percentages, which
//   carry no amount; with the switch
//   on, **only** the euros of rule 17 — the gross contribution and its cap,
//   and the loss of the stop-loss — never an asset, an account or an ISIN.
// - **Income tax**: ready, with how many notes and criteria in dispute;
//   **never a figure**, whatever the switch: it does not even take it.
// - **720 and 721**: neutral — which model to look at, never
//   the word «umbral», a figure, or whether it is passed.

import type { MailMessage } from "../../ports/notifier.js";
import type { AmountsSwitch } from "../amounts.js";
import type { AnnualUpkeep } from "../annual-upkeep.js";
import type { InformativeFacts } from "../informative.js";
import type { ReviewFacts, ReviewRule, ReviewUnmeasured } from "../review.js";
import { CODE_SHAPE } from "../strict.js";
import type { TaxReturnFacts } from "../tax-return.js";
import { CLASS_NAMES, count, euros, percent, periodName, points } from "./format.js";
import { composeMail, type MailSection } from "./layout.js";

/** A short warning: a title and its sentences, one paragraph each. */
const short = (
  subject: string,
  title: string,
  lines: readonly string[],
  origin: string,
): MailMessage =>
  composeMail(
    {
      subject,
      kicker: "Atlas · Aviso",
      title,
      sections: [{ blocks: lines.map((text) => ({ kind: "paragraph", text })) }],
    },
    origin,
  );

const ruleLines = (rule: ReviewRule, amounts: AmountsSwitch): string[] => {
  switch (rule.code) {
    case "bucket_contribution_exceeded":
    case "bucket_contribution_near_limit":
      return [
        rule.code === "bucket_contribution_exceeded"
          ? "La aportación bruta al cubo supera su tope (regla 17)."
          : "La aportación bruta al cubo se acerca a su tope (regla 17).",
        ...(amounts === "on"
          ? [`Importes: aportación bruta ${euros(rule.gross)}; tope ${euros(rule.limit)}.`]
          : []),
      ];
    case "bucket_stop_loss_reached":
      return [
        `La pérdida acumulada del cubo es el ${percent(rule.loss_pct)} de la aportación bruta (límite ${percent(rule.limit_pct)}) (regla 17).`,
        ...(amounts === "on"
          ? [`Importes: pérdida ${euros(rule.loss)}; aportación bruta ${euros(rule.gross)}.`]
          : []),
      ];
    case "bucket_weight_exceeded":
      return [
        `El cubo pesa el ${percent(rule.weight_pct)} del patrimonio (máximo ${percent(rule.limit_pct)}) (regla 18).`,
      ];
  }
};

/** Why a rule could not be measured, from the closed list of `ControlGap`. */
const REASONS: readonly string[] = [
  "missing_prices",
  "no_contribution",
  "partial_net_worth",
  "no_net_worth",
];

const unmeasuredLine = (entry: ReviewUnmeasured): string => {
  const reason =
    entry.reason !== undefined && REASONS.includes(entry.reason)
      ? entry.reason
      : "motivo desconocido";
  switch (entry.code) {
    case "core_weights_partial":
      return "Las desviaciones del núcleo: falta el precio de algún activo.";
    case "bucket_weight_not_evaluated":
      return `El peso del cubo sobre el patrimonio (regla 18): ${reason}.`;
    case "bucket_stop_loss_not_evaluated":
      return `La pérdida acumulada del cubo (regla 17): ${reason}.`;
  }
};

const section = (heading: string, lines: readonly string[]): MailSection[] =>
  lines.length === 0
    ? []
    : [{ heading, blocks: lines.map((text) => ({ kind: "paragraph", text }) as const) }];

export const weeklyReviewMail = (
  facts: ReviewFacts,
  amounts: AmountsSwitch,
  period: string,
  origin: string,
): MailMessage =>
  composeMail(
    {
      subject: reviewSubject(period),
      kicker: `Atlas · Revisión ${period.includes("-W") ? "semanal" : "mensual"}`,
      title: `Revisión de ${periodName(period)}`,
      sections: [
        ...section(
          "Pesos del núcleo",
          facts.deviations.map(
            (deviation) =>
              `${CLASS_NAMES[deviation.asset_class]}: un activo está ${points(deviation.deviation_pp.abs())} puntos ${deviation.deviation_pp.isNegative() ? "por debajo" : "por encima"} de su objetivo (umbral ${points(deviation.threshold_pp)}).`,
          ),
        ),
        ...section(
          "Cubo",
          facts.rules.flatMap((rule) => ruleLines(rule, amounts)),
        ),
        ...section("Sin medir", facts.unmeasured.map(unmeasuredLine)),
      ],
    },
    origin,
  );

/** A code of ours, or «desconocido»: nothing else reaches a mail. */
const codeText = (code: string): string => (CODE_SHAPE.test(code) ? code : "desconocido");

const reviewSubject = (period: string): string => `[Atlas] Revision de ${periodName(period)}`;

/**
 * The review of a period whose ledger could not be read on any day of it,
 * said on its last day: with its code, and no
 * figure.
 */
export const weeklyReviewUnavailableMail = (
  period: string,
  code: string,
  origin: string,
): MailMessage =>
  short(
    reviewSubject(period),
    `Revisión de ${periodName(period)}`,
    [
      `No se ha podido hacer la revisión de ${periodName(period)} (código ${codeText(code)}): no se ha podido leer lo que necesita ${period.includes("-W") ? "en toda la semana" : "en todo el mes"}.`,
      "Abre la aplicación para ver los pesos y las reglas del cubo.",
    ],
    origin,
  );

/** What January has to add by hand, as sentences; nothing when nothing is missing. */
const upkeepLines = (upkeep: AnnualUpkeep): string[] => [
  ...(upkeep.missingCpi === undefined
    ? []
    : [`Falta el IPC de ${upkeep.missingCpi}: el INE lo publica en enero y hay que añadirlo.`]),
  ...(upkeep.staleProfiles.length === 0
    ? []
    : [`Perfiles de índice con ficha de más de un año: ${upkeep.staleProfiles.join(", ")}.`]),
  ...(upkeep.staleFunds === 0
    ? []
    : [`Fichas de fondos de más de un año: ${count(upkeep.staleFunds)}.`]),
];

/**
 * The income tax of January: ready, and how many notes and criteria in dispute, no figure ever;
 * and what has to be added by hand this month, ready or not.
 */
export const taxReturnMail = (
  facts: TaxReturnFacts,
  upkeep: AnnualUpkeep,
  origin: string,
): MailMessage =>
  composeMail(
    {
      subject: facts.ok ? `[Atlas] Renta ${facts.year} lista` : `[Atlas] Renta ${facts.year}`,
      kicker: "Atlas · Aviso",
      title: facts.ok ? `Renta de ${facts.year} lista` : `Renta de ${facts.year}`,
      sections: [
        {
          blocks: (facts.ok
            ? [
                `Los datos de la Renta de ${facts.year} están listos: ${count(facts.notes)} notas y ${count(facts.disputed)} criterios en disputa.`,
                `Revísalos en la aplicación o con «atlas tax ${facts.year}» antes de presentar la declaración.`,
              ]
            : [
                `No se han podido preparar los datos de la Renta de ${facts.year} (código ${codeText(facts.code)}).`,
                "Abre la aplicación para ver qué falta.",
              ]
          ).map((text) => ({ kind: "paragraph", text })),
        },
        ...section("Para añadir este mes", upkeepLines(upkeep)),
      ],
    },
    origin,
  );

/** The 720 and the 721, neutral; nothing when there is nothing to do. */
export const informativeMail = (
  facts: InformativeFacts,
  origin: string,
): MailMessage | undefined => {
  if (!facts.invalid && facts.models.length === 0 && facts.unavailable === undefined) {
    return undefined;
  }
  return short(
    `[Atlas] Modelos 720 y 721 de ${facts.year}`,
    `Modelos 720 y 721 de ${facts.year}`,
    facts.unavailable !== undefined
      ? [
          `No se han podido comprobar los modelos 720 y 721 de ${facts.year} (código ${codeText(facts.unavailable)}). Abre la aplicación.`,
        ]
      : facts.invalid
        ? [
            `No se han podido comprobar los modelos 720 y 721 de ${facts.year}: el libro tiene eventos no válidos. Abre la aplicación.`,
          ]
        : facts.models.map(
            (model) => `Revisa si te corresponde presentar el modelo ${model} de ${facts.year}.`,
          ),
    origin,
  );
};
