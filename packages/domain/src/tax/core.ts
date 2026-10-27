// The shared reading of one tax year: the chain of years plus the lines of the
// year asked. `year.ts` and its sibling modules (`stakes.ts`, `settings-diff.ts`,
// `notes.ts`) are built on it.

import { yearOf } from "../dates/civil-date.js";
import type { RealizedGain } from "../projections/state.js";
import type { CorporateActionEvent, LedgerEvent } from "../schema/events.js";
import type { Settings } from "../settings/settings.js";
import {
  type ChainCore,
  type Invalid,
  isInvalid,
  type TaxOptions,
  taxChain,
  tryReading,
  type Unsupported,
} from "./chain.js";
import { currencyLine, incomeLine, transmissionLine } from "./lines.js";
import type { CurrencyLine, IncomeLine, TransmissionLine } from "./report.js";
import type { WashSaleOutcome } from "./wash-sale.js";

/** The chain of years plus the lines of the one asked. */
export interface Core extends ChainCore {
  transmissions: TransmissionLine[];
  /** The outcome of the rule behind each transmission line, in the same order. */
  outcomes: WashSaleOutcome[];
  income: IncomeLine[];
  /** Exchange differences imputed in the year (spec 029). */
  currency: CurrencyLine[];
}

/**
 * Everything the engine computes for one reading of the settings: the chain of
 * years (`taxChain`) plus the lines of the year asked. The chain is shared
 * with the warning of a settings change, the warning of a closed year and the
 * comparison with what was filed, so that the four never disagree.
 */
export const computeCore = (
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
  settings?: Settings,
): Core | Invalid => {
  const chain = taxChain(events, year, options, settings);
  if (isInvalid(chain)) {
    return chain;
  }
  const { state, ctx, walk, expenses } = chain;

  const outcomes = walk.outcomes.filter(
    (outcome) => (state.gains[outcome.gain_index] as RealizedGain).year === year,
  );
  const transmissions = outcomes.map((outcome) => transmissionLine(ctx, outcome));
  const income = state.income
    .filter((entry) => entry.year === year)
    .map((entry) => incomeLine(ctx, entry));
  const currency = state.currencyGains
    .filter((gain) => gain.year === year)
    .map((gain) => currencyLine(ctx, gain));
  return {
    ...chain,
    transmissions,
    outcomes,
    income,
    currency,
    expenses: expenses.filter((expense) => yearOf(expense.fiscal_date) === year),
  };
};

/**
 * The same, for a reading that is **not** the main one: it may reach below the
 * first supported year, and that is information about the reading, never a
 * reason to deny the report the user asked for.
 */
export const tryComputeCore = (
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
  settings?: Settings,
): Core | Invalid | Unsupported => tryReading(() => computeCore(events, year, options, settings));

/** Mergers, spin-offs and restructurings of the year that keep date and cost. */
export const exchangesOfYear = (core: Core, year: number): CorporateActionEvent[] =>
  [...core.ctx.events.values()].filter(
    (event): event is CorporateActionEvent =>
      event.type === "corporate_action" &&
      yearOf((event as CorporateActionEvent).effective_date) === year &&
      ["merger", "spin_off", "issuer_restructuring"].includes(
        (event as CorporateActionEvent).kind,
      ) &&
      (event as CorporateActionEvent).effects.some(
        (effect) => effect.op === "convert" || effect.op === "carve_out",
      ),
  );
