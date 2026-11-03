// Projection warnings in Spanish, with the remedy of the web. Same contract as
// the errors: keyed by `code`, unknown codes fall back to the domain message,
// and the drift test keeps this catalogue level with the CLI's.
//
// LINE BUDGET: it is a **catalogue**, one entry per warning code the domain can
// raise, and the exhaustiveness test demands that every one of them be here.
// Splitting it by subject would only move the same entries to another file and
// make "is this code translated?" a question with several places to look.

import type { Warning } from "@atlas/domain";
import {
  fxMissingReason,
  say,
  windowText as windowName,
  year as yearName,
} from "@atlas/domain/messages";
import { NO_NAMES, namingOf } from "../names.js";
import { figuresOf, maskFigures, type Prose } from "../privacy.js";
import { type Details, day, days, pp, text } from "./prose.js";
import { webVoice } from "./voice.js";

/** Why a quote has no value in euros. */
export const fxMissingText = (reason: unknown): string =>
  fxMissingReason(reason) ?? "no hay histórico del BCE en esta web";

/** The remedy of several stale rates: the ECB history's are updated, the ledger's recorded again. */
const staleRatesRemedy = (fromHistory: readonly boolean[]): string => {
  const ledger = "Registra una operación o una valoración más reciente en esas divisas";
  if (fromHistory.every((ecb) => ecb)) {
    return "Actualiza el histórico del BCE.";
  }
  return fromHistory.some((ecb) => ecb)
    ? `${ledger}, o actualiza el histórico del BCE.`
    : `${ledger}.`;
};

/** "A", "A y B", "A, B y C". */
const joinAll = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;

/**
 * The age a group of stale prices is past: the limit configured, which the domain puts in each
 * warning. The youngest of their ages is not it — six prices of 10 days and more read «más de 10
 * días» with a limit of 7; it is only the answer for a warning of an older version, which does not
 * carry the limit.
 */
const limitOf = (warnings: readonly Warning[]): number => {
  const limit = warnings[0]?.details.limit_days;
  return limit === undefined
    ? Math.min(...warnings.map((warning) => Number(warning.details.age_days)))
    : Number(limit);
};

/**
 * One sentence for several warnings of the same rule, as the summary shows
 * them (docs/design/system.md §5.6): «3 precios con más de 15 días · World
 * Index Fund, Physical Gold ETC y Bitcoin ETP». Only the rules whose repeats
 * are one thing to do; the others are said one by one.
 */
export const describeWarningGroup = (
  code: string,
  warnings: readonly Warning[],
  prose: Prose,
): string | undefined => {
  const n = namingOf(prose.names ?? NO_NAMES);
  const f = figuresOf(prose.privacy);
  const d = (warnings[0]?.details ?? {}) as Details;
  switch (code) {
    // One loss and its purchases inside the window: one sentence with how many,
    // each purchase in the detail. The preview of a sale listed ten notices
    // that said the same thing.
    case "wash_sale_window_prior_buy":
      return `Venta con pérdida de ${n.one(d.asset_id)} del ${day(d.sale_date)} (${f.money(d.loss_eur)}) con ${warnings.length} compras en cartera dentro de la ventana abierta el ${day(d.window_start)} (${windowName(webVoice(prose), d.window)}): la pérdida puede no ser computable en ${yearName(webVoice(prose), d.tax_year)}.`;
    case "wash_sale_window_repurchase":
      return `${warnings.length} compras de ${n.one(d.asset_id)} dentro de la ventana de su venta con pérdida del ${day(d.sale_date)} (${f.money(d.loss_eur)}; ${windowName(webVoice(prose), d.window)}, hasta el ${day(d.window_end)}): pueden hacer que esa pérdida no sea computable en ${yearName(webVoice(prose), d.tax_year)}.`;
    case "stale_price":
      return `${warnings.length} precios con más de ${days(limitOf(warnings))} · ${joinAll(
        warnings.map((warning) => n.one(warning.details.asset_id)),
      )}. Registra valoraciones más recientes.`;
    case "stale_fx_rate":
      return `${warnings.length} tipos de cambio de hace más de ${days(limitOf(warnings))} · ${joinAll(
        warnings.map((warning) => text(warning.details.currency)),
      )}. ${staleRatesRemedy(warnings.map((warning) => warning.details.source === "ecb"))}`;
    case "deviation_above_threshold":
      return `${warnings.length} activos fuera del umbral de ±${pp(
        warnings[0]?.details.threshold_pp,
      ).replace(/^\+/, "")} · ${joinAll(
        warnings.map(
          (warning) => `${n.one(warning.details.asset_id)} (${pp(warning.details.deviation_pp)})`,
        ),
      )}. Rebalancear vendiendo es una decisión anual tuya.`;
    default:
      return undefined;
  }
};

/**
 * Spanish text of a projection warning; an unknown code falls back to its message, with its
 * figures masked because nothing here can tell which of them is an amount.
 */
export const describeWarning = (warning: Warning, prose: Prose): string =>
  say("warning", warning.code, warning.details, webVoice(prose), warning.message) ??
  maskFigures(warning.message, prose.privacy);
