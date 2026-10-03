// What the summary says about the tax side (feature 010, blocks 3 and 4;
// prompt P1 and question Q11), and when the fiscal card goes to the top.
//
// The screen is used a handful of times a year, so it is not a sixth
// destination of the navigation; but in the weeks when it matters it has to be
// the first thing the user sees. **The domain decides that, not the web**: a
// rule about when a tax return is due is a fiscal rule.
//
// Since feature 020 (E2, M2) only **the income tax season** raises the card.
// Before, something of the 720 or the 721 to do raised it too; now it is said
// in *Atención*, out of season, and the card stays folded at the end. The 720
// is due from January to March, outside the season, and "cannot be
// determined" still counts as something to do: with securities abroad and no
// valuations at 31 December — the ordinary state of affairs in January — the
// summary would otherwise stay quiet exactly when what is missing is the datum
// that decides whether there is anything to file.

import type { CivilDate } from "../dates/civil-date.js";
import { yearOf } from "../dates/civil-date.js";
import { unfiledPastYears } from "../filings/touched.js";
import { closedYears } from "../projections/filings.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { FilingCategory, LedgerEvent } from "../schema/events.js";
import { INFORMATIVE_MODELS, type InformativeModel, inRentaSeason } from "../settings/settings.js";
import { accountsAt } from "./holdings.js";
import { informativeReturn } from "./m720.js";
import type { InformativeCategory } from "./report.js";

/** One thing of an informative return that is pending, and why. */
export interface InformativeTodo {
  model: InformativeModel;
  year: number;
  category: FilingCategory;
  /**
   * `file` when the category obliges and no return of that year is recorded,
   * `undetermined` when it cannot be decided yet, `alert` when it is close
   * enough to the threshold that the user asked to be told.
   */
  reason: "file" | "undetermined" | "alert";
}

export interface FiscalAttention {
  today: CivilDate;
  /** The day of the query falls inside the income tax season, both ends included. */
  season: boolean;
  /** Past years with figures and no income tax return recorded. */
  unfiled_years: number[];
  /**
   * Invalid events in the ledger. With any, the informative returns are not
   * computed at all —they would value the wrong quantities— and the card says
   * so instead of going quiet, which would look like "nothing to do".
   */
  invalid_events: number;
  todo: InformativeTodo[];
  /**
   * The card goes to the top of the summary: **in the season, and only then**
   * (feature 020, E2, M2). What is pending out of it —`todo`, `unfiled_years`,
   * `invalid_events`— is still said, in *Atención*: its place changes, not
   * whether it is said.
   */
  prominent: boolean;
}

const todoOf = (
  model: InformativeModel,
  year: number,
  category: InformativeCategory,
  filed: boolean,
): InformativeTodo | undefined => {
  if (category.verdict === "obliged" && !filed) {
    return { model, year, category: category.category, reason: "file" };
  }
  if (category.verdict === "undetermined") {
    return { model, year, category: category.category, reason: "undetermined" };
  }
  return category.reasons.some((reason) => reason.kind === "alert")
    ? { model, year, category: category.category, reason: "alert" }
    : undefined;
};

/**
 * What the summary has to say about the tax side, on the day of the query.
 *
 * It costs one projection, and the machinery of the informative returns only
 * runs when there is at least one account abroad: without one there is nothing
 * either model could ever ask for, and the card has no business projecting the
 * ledger four more times to find that out.
 */
export const fiscalAttention = (
  events: readonly LedgerEvent[],
  today: CivilDate,
): FiscalAttention => {
  const state = projectLedger(events, { collectErrors: true });
  const season = inRentaSeason(state.fiscalSettings, today);
  const unfiled = unfiledPastYears(today, state);
  const foreign =
    state.invalid.length === 0 &&
    [...accountsAt(events, today).accounts.values()].some((account) => account.country !== "ES");
  const year = yearOf(today) - 1;
  const todo: InformativeTodo[] = [];
  if (foreign) {
    const filed = new Set(
      closedYears(state, today)
        .filter((entry) => entry.year === year)
        .map((entry) => entry.model as string),
    );
    for (const model of INFORMATIVE_MODELS) {
      const report = informativeReturn(events, model, year, { today });
      for (const category of report.categories) {
        const entry = todoOf(model, year, category, filed.has(model));
        if (entry !== undefined) {
          todo.push(entry);
        }
      }
    }
  }
  return {
    today,
    season,
    unfiled_years: unfiled,
    invalid_events: state.invalid.length,
    todo,
    prominent: season,
  };
};
