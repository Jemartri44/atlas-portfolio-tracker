// The Modelo 720 and the Modelo 721, ready to paint.
//
// Two rules of the prompt live here and not in the screen, so no card can
// forget them:
//
//   1. **Never "no obliged" with incomplete data.** The verdict comes from the
//      domain, and what is missing comes with it as an action ("registra las
//      valoraciones a 31/12"), as a `.pending` block and never as an error.
//   2. **With privacy on there is no bar and no percentage against the
//      threshold.** The threshold is a public figure, so a percentage of it is
//      an amount in disguise. The verdict is not, and it stays visible.

import type { FilingCategory, Money } from "@atlas/domain";
import type { InformativeCategory, InformativeReturn, VerdictReason } from "@atlas/domain/fiscal";
import { formatDate } from "../../format/date.js";
import type { NameIndex } from "../../format/names.js";
import { displayName } from "../../format/names.js";

export const CATEGORY_TITLES: Record<FilingCategory, string> = {
  accounts: "Cuentas en el extranjero",
  securities: "Valores y fondos en el extranjero",
  crypto: "Monedas virtuales en el extranjero",
};

export const VERDICT_TEXTS: Record<InformativeCategory["verdict"], string> = {
  obliged: "Hay que presentarlo",
  not_obliged: "No hay que presentarlo",
  // A ledger with nothing recorded abroad has not been computed and come out
  // under the threshold: it has nothing in it. Telling somebody who has
  // entered nothing that they do not have to file is a statement about their
  // situation that this screen has no basis for.
  nothing_recorded: "No has registrado nada aquí",
  undetermined: "No se puede determinar",
  not_applicable: "Todavía no toca",
};

export type VerdictTone = "caution" | "done" | "neutral";

export const VERDICT_TONES: Record<InformativeCategory["verdict"], VerdictTone> = {
  obliged: "caution",
  not_obliged: "done",
  // Neutral, not `done`: nothing was resolved here.
  nothing_recorded: "neutral",
  undetermined: "neutral",
  not_applicable: "neutral",
};

export interface CategoryView {
  key: FilingCategory;
  title: string;
  verdict: InformativeCategory["verdict"];
  verdictText: string;
  tone: VerdictTone;
  value_eur: Money;
  q4_average_eur?: Money;
  /** How much of the threshold it is. **Only without privacy** (decision (k)). */
  share_pct?: string;
  reasons: string[];
  /** What is missing before it can be decided, as an action. */
  missing: string[];
  /** Flagged values the verdict was reached with anyway. */
  decided_with: string[];
  items: number;
}

export interface InformativeView {
  model: "720" | "721";
  title: string;
  year: number;
  period: InformativeReturn["period"];
  periodText: string;
  threshold_eur: Money;
  categories: CategoryView[];
  /** Spanish accounts, which never count towards these returns. */
  excluded: string[];
  filedText?: string;
  previousText?: string;
  criteria: InformativeReturn["criteria"];
}

const PERIOD_TEXTS: Record<InformativeReturn["period"], string> = {
  closed_year: "Se mira a 31 de diciembre de ese ejercicio.",
  current_year:
    "El ejercicio no ha terminado: esto es lo que hay hoy, no lo que se declarará a 31 de diciembre.",
  before_model: "Ese ejercicio el modelo no existía todavía, así que no hay veredicto.",
};

const reasonText = (reason: VerdictReason, names: NameIndex): string => {
  switch (reason.kind) {
    case "threshold":
      return "Supera el umbral por primera vez.";
    case "increase":
      return `El valor ha subido más de lo que permite la norma desde lo presentado en ${reason.against_year}.`;
    case "increase_q4_average":
      return `El saldo medio del último trimestre ha subido más de lo permitido desde lo presentado en ${reason.against_year}.`;
    case "first_time_category":
      return `Esto no se declaró en la presentación de ${reason.against_year}, así que cuenta como primera vez.`;
    case "extinction":
      return `Ya no tienes ${displayName(names, reason.asset_id ?? reason.account_id ?? "")}, que sí estaba en lo presentado en ${reason.against_year}.`;
    default:
      return "No llega al umbral, pero está lo bastante cerca como para avisarte.";
  }
};

const missingText = (missing: InformativeCategory["missing"][number], names: NameIndex): string => {
  const what = displayName(names, missing.asset_id ?? missing.account_id);
  if (missing.flag === "price_missing") {
    return `Falta la valoración de ${what} a 31 de diciembre.`;
  }
  if (missing.flag === "valuation_not_year_end") {
    return `La valoración de ${what} no es del 31 de diciembre.`;
  }
  return `Falta el tipo de cambio del 31 de diciembre para ${what}.`;
};

const categoryView = (
  category: InformativeCategory,
  names: NameIndex,
  privacy: boolean,
): CategoryView => {
  // The percentage comes from the domain: it is a derived value like the rest
  // and the console has to show the same one. What is decided here is only
  // whether it may be shown at all — with privacy on it is money by another
  // name, because the threshold is public (decision (k)).
  const share = privacy ? undefined : category.threshold_share_pct;
  return {
    key: category.category,
    title: CATEGORY_TITLES[category.category],
    verdict: category.verdict,
    verdictText: VERDICT_TEXTS[category.verdict],
    tone: VERDICT_TONES[category.verdict],
    value_eur: category.value_eur,
    ...(category.q4_average_eur === undefined ? {} : { q4_average_eur: category.q4_average_eur }),
    ...(share === undefined ? {} : { share_pct: share }),
    reasons: category.reasons.map((reason) => reasonText(reason, names)),
    missing: category.missing.map((entry) => missingText(entry, names)),
    decided_with: category.decided_with.map((entry) => missingText(entry, names)),
    items: category.items.length,
  };
};

export const informativeView = (
  report: InformativeReturn,
  names: NameIndex,
  privacy: boolean,
): InformativeView => ({
  model: report.model,
  title: `Modelo ${report.model}`,
  year: report.year,
  period: report.period,
  periodText: PERIOD_TEXTS[report.period],
  threshold_eur: report.threshold_eur,
  categories: report.categories.map((category) => categoryView(category, names, privacy)),
  excluded: report.excluded.map((entry) => displayName(names, entry.account_id)),
  ...(report.filed === undefined
    ? {}
    : { filedText: `Presentado el ${formatDate(report.filed.filed_at)}.` }),
  ...(report.previous === undefined
    ? {}
    : {
        previousText: `Se compara con lo presentado del ejercicio ${report.previous.tax_year}.`,
      }),
  criteria: report.criteria,
});
