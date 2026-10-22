// The tax year: the savings base of the return, computed from the
// ledger and **only** from the ledger.
//
// What it produces is the **base**, not the tax: it cannot see the rest of the
// return (the personal allowance, the general base, the effective average
// rate), and pretending it can would give a believable and false figure. Every
// figure opens into the events that produce it and says which fiscal criteria
// it depends on; what each criterion puts at stake gets a section of its own —
// two, in fact: `doubtful` for the readings that are open and `settled` for the
// ones that are not but would still move a figure read the other way.
//
// The report aggregates **both books**, per taxpayer, and says so
// (`scope: "fiscal_total"`): the first exception of constitution III, and the
// only place where the core and the bucket meet in a calculation.
//
// **No price is read anywhere on this path** (constitution II): the
// architecture test keeps `prices.ts` out of reach and a test deletes every
// price of a ledger and compares the report byte for byte.

import { DomainError } from "../errors.js";
import { filingComparison } from "../filings/comparison.js";
import type { Money } from "../money/money.js";
import type { RealizedGain } from "../projections/state.js";
import type { CorporateActionEvent, LedgerEvent } from "../schema/events.js";
import type { IncomeCategory, Settings } from "../settings/settings.js";
import { isDoubtful } from "./criteria.js";
import { deferralLine, withholdingLines } from "./lines.js";
import type { InKindLine, PendingLoss, TaxYearReport, TransmissionLine } from "./report.js";

export { FIRST_SUPPORTED_YEAR, type TaxOptions } from "./chain.js";

import { sum, zero } from "../money/eur.js";
import {
  type ChainCore,
  categoryOf,
  FIRST_SUPPORTED_YEAR,
  isInvalid,
  isUnsupported,
  type TaxOptions,
  taxChain,
  tryReading,
} from "./chain.js";
import { computeCore } from "./core.js";
import { doubleTaxation, note, notesOf, rateNotes, settingsFromCode } from "./notes.js";
import { settingsDiff } from "./settings-diff.js";
import { criterionStakes } from "./stakes.js";

/**
 * A tax year one of whose three declared figures —the savings base, what it
 * leaves pending, what it still holds deferred— moves with a change of
 * settings.
 */
export interface MovedTaxYear {
  year: number;
  before: Money;
  after: Money;
  /**
   * What the year leaves pending to offset, added up with its sign. A year can
   * keep the same base and leave a different balance pending, and that moves
   * **the years after it**: the warning has to see it, and the interfaces have
   * to be able to say "the base does not change, what it carries does".
   */
  pending_before: Money;
  pending_after: Money;
  /**
   * What the wash-sale rule still holds deferred at 31/12 of that year. The
   * third figure a return declares, and the one a change of window moves first:
   * reading two months where a year was read releases a loss that was deferred
   * and changes nothing else about that year. Without it the warning stayed
   * silent on exactly the change it exists for.
   */
  deferred_before: Money;
  deferred_after: Money;
}

/**
 * Years **before** `currentYear` whose savings base changes when the same
 * ledger is read with the new settings.
 *
 * `movedFiscalYears` compares realized gains, and that stopped being enough
 * the day the engine started reading the wash-sale window, the transfer
 * criterion and the income category: each of them moves the base without
 * moving a single realized gain, and the warning would stay silent. This one
 * compares what goes into the return. When either reading cannot be computed
 * (invalid events, a ledger older than the regime), it compares nothing: the
 * invalid events have their own confirmation (ADR-0015).
 */
export const movedTaxYears = (
  events: readonly LedgerEvent[],
  current: Settings,
  next: Settings,
  currentYear: number,
): MovedTaxYear[] => {
  const last = currentYear - 1;
  const options = { today: `${currentYear}-01-01` };
  // The chain, not the report: no alternative readings and no difference with
  // the previous settings, which is what makes this cheap enough to run on
  // every keystroke of the configuration screen.
  const chainOf = (settings: Settings): ChainCore | undefined => {
    // The guard this function used to carry alone, now the shared one: it was
    // the only one in the domain, and the other three readings did without it.
    const chain = tryReading(() =>
      taxChain(events, Math.max(last, FIRST_SUPPORTED_YEAR), options, settings),
    );
    return isUnsupported(chain) || isInvalid(chain) ? undefined : chain;
  };
  const before = chainOf(current);
  const after = chainOf(next);
  if (before === undefined || after === undefined) {
    return [];
  }
  // A change of fiscal date can move a figure into a year the other reading
  // does not even reach: every year of either chain, zero where it is absent.
  const moved: MovedTaxYear[] = [];
  const years = [...new Set([...before.bases.keys(), ...after.bases.keys()])].sort((a, b) => a - b);
  for (const year of years.filter((y) => y <= last)) {
    const was = before.bases.get(year) ?? zero();
    const is = after.bases.get(year) ?? zero();
    // The base is not the whole of it: a year can keep the same base and leave
    // a different balance pending, or the same base and a different deferred
    // loss, and either moves **the years after it**. The warning compares the
    // three figures a return declares.
    const pendingBefore = before.pendings.get(year) ?? [];
    const pendingAfter = after.pendings.get(year) ?? [];
    const deferredBefore = before.deferrals.get(year) ?? zero();
    const deferredAfter = after.deferrals.get(year) ?? zero();
    if (
      !was.eq(is) ||
      pendingText(pendingBefore) !== pendingText(pendingAfter) ||
      !deferredBefore.eq(deferredAfter)
    ) {
      moved.push({
        year,
        before: was,
        after: is,
        pending_before: sum(pendingBefore.map((entry) => entry.amount_eur)),
        pending_after: sum(pendingAfter.map((entry) => entry.amount_eur)),
        deferred_before: deferredBefore,
        deferred_after: deferredAfter,
      });
    }
  }
  return moved;
};

/** What a year leaves pending, as a text that can be compared as a whole. */
const pendingText = (pending: readonly PendingLoss[]): string =>
  pending
    .map((entry) => `${entry.origin_year}|${entry.category}|${entry.amount_eur.amount.toString()}`)
    .sort()
    .join(",");

// --- The report -----------------------------------------------------------------

/**
 * The tax report of `year`. Refuses a ledger with invalid events: a projection
 * that skipped one gives an approximate base, and the answer to that is the
 * list of what to repair, not a number.
 */
export const taxYear = (
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
): TaxYearReport => taxYearWithChain(events, year, options).report;

/**
 * The same report **and the walk of the years behind it**.
 *
 * The layout by box needs two things the report does not carry: what each year
 * of the chain left deferred, so it can say which original loss every deferred
 * amount belongs to, and what the year before left pending, for
 * annex C.3. Handing over the chain that was walked anyway is what keeps the
 * layout from projecting the ledger a second time to find out.
 */
export const taxYearWithChain = (
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
): { report: TaxYearReport; chain: ChainCore } => {
  if (!Number.isInteger(year) || year < FIRST_SUPPORTED_YEAR) {
    throw new DomainError(
      "tax_year_unsupported",
      `the engine applies the compensation regime in force since ${FIRST_SUPPORTED_YEAR}`,
      { year, first_supported: FIRST_SUPPORTED_YEAR },
    );
  }
  const core = computeCore(events, year, options);
  if (isInvalid(core)) {
    throw new DomainError(
      "tax_ledger_invalid",
      `the ledger has ${core.invalid.length} invalid events; repair them before computing a tax year`,
      { count: core.invalid.length, invalid: core.invalid },
    );
  }
  // What was filed for this year, when there is a return in force: a fact kept
  // as it was filed, compared with what the ledger says today (ADR-0020).
  const filing = filingComparison(events, year, options.today, core);
  const { state } = core;
  const byCategory = (category: IncomeCategory) =>
    core.transmissions.filter((line) => line.category === category);
  const gains = byCategory("capital_gain");
  const movable = byCategory("movable_capital");
  const foreignReleases = (category: IncomeCategory): Money =>
    sum(
      core.ctx.walk.outcomes
        .filter((outcome) => (state.gains[outcome.gain_index] as RealizedGain).year === year)
        .flatMap((outcome) => outcome.foreign_released)
        .filter(
          (release) =>
            categoryOf(state, (state.gains[release.origin] as RealizedGain).asset_id) === category,
        )
        .map((release) => release.amount_eur.roundToCents()),
    );
  const rounded = (lines: readonly TransmissionLine[]) =>
    lines.map((line) => line.computable_eur_rounded);
  const dividends = core.income.filter((line) => line.kind === "dividend");
  const interest = core.income.filter((line) => line.kind === "interest");
  const withholdings = withholdingLines(core.transmissions, core.income);
  const ddi = doubleTaxation(core);
  const inKind: InKindLine[] = state.inKindIncome
    .filter((entry) => entry.year === year)
    .map((entry) => ({
      event_id: entry.event_id,
      asset_id: entry.asset_id,
      fiscal_date: entry.fiscal_date,
      amount_eur: entry.amount_eur,
      base: entry.base,
      kind: (core.ctx.events.get(entry.event_id) as CorporateActionEvent).kind,
    }));
  const settings = settingsFromCode(state);
  const stakes = criterionStakes(core, events, year, options);
  const notes = [
    ...notesOf(core, year, settings.from_code, inKind, ddi.notes),
    ...rateNotes(core, options.rateFindings ?? []),
  ];
  // **A cause that cannot be sustained is not attributed in silence**
  // (ADR-0024). The comparison already omitted the four causes when the prefix
  // could not be trusted; omitting is not warning, and this is the datum with a
  // code that says so.
  if (filing?.unverified_prefix !== undefined) {
    notes.push(
      note(
        "tax_filing_prefix_unverified",
        filing.filing_id,
        "the prefix of the ledger this filing was computed on is not verified, so the difference is not split into its causes",
        { reason: filing.unverified_prefix },
      ),
    );
  }
  const diff = settingsDiff(core, events, year, options);
  const report: TaxYearReport = {
    year,
    scope: "fiscal_total",
    today: options.today,
    settings,
    capital_gains: {
      lines: gains,
      gains_eur: sum(rounded(gains).filter((m) => !m.isNegative())),
      losses_eur: sum(rounded(gains).filter((m) => m.isNegative())),
      balance_eur: core.compensation.capital_gain_eur,
      foreign_releases_eur: foreignReleases("capital_gain"),
    },
    movable_capital: {
      dividends,
      interest,
      transmissions: movable,
      expenses: core.expenses,
      balance_eur: core.compensation.movable_capital_eur,
      foreign_releases_eur: foreignReleases("movable_capital"),
    },
    wash_sale: {
      deferred: core.ctx.walk.deferrals
        .filter((deferral) => deferral.year === year)
        .map((deferral) => deferralLine(core.ctx, deferral)),
      released: core.transmissions.flatMap((line) =>
        line.released.map((release) => ({
          ...release,
          event_id: line.event_id,
          fiscal_date: line.fiscal_date,
        })),
      ),
      pending: core.pendingDeferrals.map((entry) => ({
        origin_event_id: (state.gains[entry.origin] as RealizedGain).event_id,
        ...(entry.lot_id === undefined ? {} : { lot_id: entry.lot_id }),
        ...(entry.awaiting_event_id === undefined
          ? {}
          : { awaiting_event_id: entry.awaiting_event_id }),
        asset_id: entry.asset_id,
        amount_eur: entry.amount_eur,
        travelled: entry.travelled,
      })),
    },
    compensation: core.compensation,
    anchors: core.anchors,
    ...(filing === undefined ? {} : { filing }),
    base_eur: core.compensation.base_eur,
    withholdings: {
      lines: withholdings,
      total_eur: sum(withholdings.map((line) => line.amount_eur_rounded)),
    },
    double_taxation: {
      lines: ddi.lines,
      deductible_eur: sum(ddi.lines.map((line) => line.deductible_eur ?? zero())),
      not_deductible_eur: sum(ddi.lines.map((line) => line.not_deductible_eur ?? zero())),
    },
    in_kind: inKind,
    // One walk, two lists: the reading that is open and the reading that is
    // settled. Splitting instead of filtering is what keeps a criterion of high
    // certainty from taking its figure with it when it stops being doubtful.
    doubtful: stakes.filter((entry) => isDoubtful(entry.criterion)),
    settled: stakes.filter((entry) => !isDoubtful(entry.criterion)),
    notes,
    ...(diff === undefined ? {} : { settings_diff: diff }),
  };
  return { report, chain: core };
};
