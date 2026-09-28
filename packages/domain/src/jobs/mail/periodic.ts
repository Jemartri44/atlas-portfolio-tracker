// The periodic warnings (feature 016, E4; `contracts/mail.md` §2): the weekly
// review, the income tax of January and the thresholds of the 720 and 721.
// Plain text, Spanish, no HTML; the subject in ASCII with its period (Q5).
//
// - **Weekly review**: the classes of the core, points and percentages, which
//   P9 allows (decided in round 2 of the review of PR #104); with the switch
//   on, **only** the euros of rule 17 — the gross contribution and its cap,
//   and the loss of the stop-loss — never an asset, an account or an ISIN.
// - **Income tax**: ready, with how many notes and criteria in dispute;
//   **never a figure**, whatever the switch (Q10): it does not even take it.
// - **720 and 721**: neutral (questions §13) — which model to look at, never
//   the word «umbral», a figure, or whether it is passed.

import type { MailMessage } from "../../ports/notifier.js";
import type { AmountsSwitch } from "../amounts.js";
import type { InformativeFacts } from "../informative.js";
import type { ReviewFacts, ReviewRule, ReviewUnmeasured } from "../review.js";
import { CODE_SHAPE } from "../strict.js";
import type { TaxReturnFacts } from "../tax-return.js";
import { CLASS_NAMES, count, euros, percent, points } from "./format.js";

const withOrigin = (subject: string, lines: readonly string[], origin: string): MailMessage => ({
  subject,
  body: [...lines, "", `Abre Atlas: ${origin}`, ""].join("\n"),
});

const ruleLines = (rule: ReviewRule, amounts: AmountsSwitch): string[] => {
  switch (rule.code) {
    case "bucket_contribution_exceeded":
    case "bucket_contribution_near_limit":
      return [
        rule.code === "bucket_contribution_exceeded"
          ? "  La aportación bruta al cubo supera su tope (regla 17)."
          : "  La aportación bruta al cubo se acerca a su tope (regla 17).",
        ...(amounts === "on"
          ? [`    Importes: aportación bruta ${euros(rule.gross)}; tope ${euros(rule.limit)}.`]
          : []),
      ];
    case "bucket_stop_loss_reached":
      return [
        `  La pérdida acumulada del cubo es el ${percent(rule.loss_pct)} de la aportación bruta (límite ${percent(rule.limit_pct)}) (regla 17).`,
        ...(amounts === "on"
          ? [`    Importes: pérdida ${euros(rule.loss)}; aportación bruta ${euros(rule.gross)}.`]
          : []),
      ];
    case "bucket_weight_exceeded":
      return [
        `  El cubo pesa el ${percent(rule.weight_pct)} del patrimonio (máximo ${percent(rule.limit_pct)}) (regla 18).`,
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
      return "  Las desviaciones del núcleo: falta el precio de algún activo.";
    case "bucket_weight_not_evaluated":
      return `  El peso del cubo sobre el patrimonio (regla 18): ${reason}.`;
    case "bucket_stop_loss_not_evaluated":
      return `  La pérdida acumulada del cubo (regla 17): ${reason}.`;
  }
};

const section = (title: string, lines: readonly string[]): string[] =>
  lines.length === 0 ? [] : [title, ...lines, ""];

export const weeklyReviewMail = (
  facts: ReviewFacts,
  amounts: AmountsSwitch,
  period: string,
  origin: string,
): MailMessage => {
  const lines = [
    ...section(
      "Pesos del núcleo",
      facts.deviations.map(
        (deviation) =>
          `  ${CLASS_NAMES[deviation.asset_class]}: un activo está ${points(deviation.deviation_pp.abs())} puntos ${deviation.deviation_pp.isNegative() ? "por debajo" : "por encima"} de su objetivo (umbral ${points(deviation.threshold_pp)}).`,
      ),
    ),
    ...section(
      "Cubo",
      facts.rules.flatMap((rule) => ruleLines(rule, amounts)),
    ),
    ...section("Sin medir", facts.unmeasured.map(unmeasuredLine)),
  ];
  return withOrigin(
    `[Atlas] Revision ${period.includes("-W") ? "semanal" : "mensual"} ${period}`,
    lines.slice(0, -1),
    origin,
  );
};

/** The income tax of January: ready, and how many notes and criteria in dispute. No figure, ever. */
export const taxReturnMail = (facts: TaxReturnFacts, origin: string): MailMessage =>
  facts.ok
    ? withOrigin(
        `[Atlas] Renta ${facts.year} lista`,
        [
          `Los datos de la Renta de ${facts.year} están listos: ${count(facts.notes)} notas y ${count(facts.disputed)} criterios en disputa.`,
          `Revísalos en la aplicación o con «atlas tax ${facts.year}» antes de presentar la declaración.`,
        ],
        origin,
      )
    : withOrigin(
        `[Atlas] Renta ${facts.year}`,
        [
          `No se han podido preparar los datos de la Renta de ${facts.year} (código ${CODE_SHAPE.test(facts.code) ? facts.code : "desconocido"}).`,
          "Abre la aplicación para ver qué falta.",
        ],
        origin,
      );

/** The 720 and the 721, neutral; nothing when there is nothing to do. */
export const informativeMail = (
  facts: InformativeFacts,
  origin: string,
): MailMessage | undefined => {
  if (!facts.invalid && facts.models.length === 0) {
    return undefined;
  }
  return withOrigin(
    `[Atlas] Modelos 720 y 721 de ${facts.year}`,
    facts.invalid
      ? [
          `No se han podido comprobar los modelos 720 y 721 de ${facts.year}: el libro tiene eventos no válidos. Abre la aplicación.`,
        ]
      : facts.models.map(
          (model) => `Revisa si te corresponde presentar el modelo ${model} de ${facts.year}.`,
        ),
    origin,
  );
};
