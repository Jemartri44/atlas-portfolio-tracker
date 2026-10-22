// The tax year (feature 009): the savings base of the return, computed from the
// ledger and **only** from the ledger.
//
// What it produces is the **base**, not the tax: it cannot see the rest of the
// return (the personal allowance, the general base, the effective average
// rate), and pretending it can would give a believable and false figure
// (decision (a)). Every figure opens into the events that produce it
// (decision (c)) and says which fiscal criteria it depends on (decision (b));
// what each criterion puts at stake gets a section of its own — two, in fact:
// `doubtful` for the readings that are open and `settled` for the ones that are
// not but would still move a figure read the other way.
//
// The report aggregates **both books**, per taxpayer, and says so
// (`scope: "fiscal_total"`): the first exception of constitution III, and the
// only place where the core and the bucket meet in a calculation.
//
// **No price is read anywhere on this path** (constitution II): the
// architecture test keeps `prices.ts` out of reach and a test deletes every
// price of a ledger and compares the report byte for byte.

import { yearOf } from "../dates/civil-date.js";
import { DomainError } from "../errors.js";
import { filingComparison } from "../filings/comparison.js";
import type { Ulid } from "../ids/ulid.js";
import { Decimal } from "../money/decimal.js";
import { FxRate } from "../money/fx-rate.js";
import type { Money } from "../money/money.js";
import { sharedIsins } from "../projections/isin.js";
import type { LedgerState, RealizedGain, Warning } from "../projections/state.js";
import {
  ASSET_TYPES,
  type CorporateActionEvent,
  type FxExchangeEvent,
  type LedgerEvent,
} from "../schema/events.js";
import {
  type IncomeCategory,
  type Settings,
  treatyWithholdingPctOf,
} from "../settings/settings.js";
import { isDoubtful, sortCriteria } from "./criteria.js";
import { deferralLine, withholdingLines } from "./lines.js";
import type {
  DoubleTaxationLine,
  InKindLine,
  PendingLoss,
  TaxYearReport,
  TransmissionLine,
} from "./report.js";

export { FIRST_SUPPORTED_YEAR, type TaxOptions } from "./chain.js";

import { sum, zero } from "../money/eur.js";
import { EUR } from "../money/money.js";
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
import { type Core, computeCore, exchangesOfYear } from "./core.js";
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
   * silent on exactly the change it exists for (plan §1.5).
   */
  deferred_before: Money;
  deferred_after: Money;
}

/**
 * Years **before** `currentYear` whose savings base changes when the same
 * ledger is read with the new settings (feature 009, Q12).
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
    // the only one in the domain, and the other three readings did without it
    // (feature 011, block 4).
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
    // three figures a return declares (feature 010, §1.5).
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

// --- Notes ------------------------------------------------------------------

/** A note of the report: a code the interfaces translate, never a figure in disguise. */
const note = (code: string, eventId: Ulid, message: string, details: Record<string, unknown>) =>
  ({ code, event_id: eventId, message, details }) satisfies Warning;

const settingsFromCode = (state: LedgerState): { origin: string; from_code: string[] } => {
  const last = state.settingsHistory[state.settingsHistory.length - 1];
  const settings = last === undefined ? undefined : last.settings;
  const missing: string[] = [];
  for (const type of ASSET_TYPES) {
    if (settings?.fiscal_date_rule[type] === undefined) {
      missing.push(`fiscal_date_rule.${type}`);
    }
    if (
      settings?.wash_sale_window[type] === undefined &&
      settings?.wash_sale_window_days?.[type] === undefined
    ) {
      missing.push(`wash_sale_window.${type}`);
    }
    if (settings?.income_category?.[type] === undefined) {
      missing.push(`income_category.${type}`);
    }
  }
  for (const field of [
    "wash_sale_transfer_counts",
    "savings_offset_limit_pct",
    "loss_carryforward_years",
  ] as const) {
    if (settings?.[field] === undefined) {
      missing.push(field);
    }
  }
  return { origin: last === undefined ? "default" : last.event_id, from_code: missing };
};

// --- Double taxation (#16) ----------------------------------------------------

const doubleTaxation = (core: Core): { lines: DoubleTaxationLine[]; notes: Warning[] } => {
  const lines: DoubleTaxationLine[] = [];
  const notes: Warning[] = [];
  for (const income of core.income) {
    if (income.kind !== "dividend" || income.withholding_origin.isZero()) {
      continue;
    }
    const foreignTax = FxRate.of(
      Decimal.parse(income.gross.fx_rate),
      income.withholding_origin.currency,
      income.gross.fx_rate_date,
    )
      .toEur(income.withholding_origin)
      .roundToCents();
    const rate = treatyWithholdingPctOf(core.state.fiscalSettings, income.source_country);
    const base = {
      event_id: income.event_id,
      ...(income.source_country === undefined ? {} : { source_country: income.source_country }),
      gross_eur: income.gross_eur_rounded,
      foreign_tax_eur: foreignTax,
      criteria: sortCriteria(["16"]),
    };
    if (rate === undefined) {
      lines.push(base);
      notes.push(
        income.source_country === undefined
          ? note(
              "tax_dividend_without_country",
              income.event_id,
              "the dividend does not say which country paid it: no deduction is calculated",
              { foreign_tax_eur: foreignTax.amount.toString() },
            )
          : note(
              "tax_treaty_rate_missing",
              income.event_id,
              `no treaty rate is configured for ${income.source_country}: no deduction is calculated`,
              { country: income.source_country, foreign_tax_eur: foreignTax.amount.toString() },
            ),
      );
      continue;
    }
    const limit = income.gross_eur_rounded.mul(rate).div(Decimal.parse("100")).roundToCents();
    const deductible = foreignTax.cmp(limit) < 0 ? foreignTax : limit;
    lines.push({
      ...base,
      treaty_pct: rate.toString(),
      deductible_eur: deductible,
      not_deductible_eur: foreignTax.sub(deductible),
    });
  }
  return { lines, notes };
};

// --- The report -----------------------------------------------------------------

/**
 * The tax report of `year`. Refuses a ledger with invalid events: a projection
 * that skipped one gives an approximate base, and the answer to that is the
 * list of what to repair, not a number (feature 009, Q11).
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
 * amount belongs to (ficha F5), and what the year before left pending, for
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
  // (ADR-0024, prompt 011 decision (e)). The comparison already omitted the
  // four causes when the prefix could not be trusted; omitting is not warning,
  // and this is the datum with a code that says so.
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

/**
 * **A line of the report that depends on a rate in doubt says so** (ADR-0029,
 * point 8; ADR-0024). "Depends" includes the acquisitions (decision (q) of
 * prompt 012): a sale depends on itself **and on the purchases whose lots it
 * consumes**, whose rate fixed the cost — the lineage of each lot says which.
 * The note **moves no figure**: the engine keeps computing with the `fx_rate`
 * of the ledger, which is the only source of the tax (trap 7 of CLAUDE.md).
 *
 * Both cite criterion 25 (ADR-0029, point 10): the rate that applies is the
 * one of the fiscal date in force, and a line with another one is corrected by
 * rectification, never recalculated.
 *
 * Three notes, each with its own literal: a rate the ECB history contradicts;
 * a rate it could not contrast; and `fx_rate_date_after_fiscal_date`, which
 * the projection sees **without** a history and which carries the note
 * anyway.
 */
/**
 * The findings of the ECB check that say a rate **is wrong**: the history
 * contradicts it. Any other one — a currency the ECB does not publish, or
 * stopped publishing, a line more recent than the history — says it could not
 * be contrasted, and gets a note of its own.
 */
const WRONG_RATE_CODES: ReadonlySet<string> = new Set([
  "fx_rate_mismatch",
  "fx_rate_date_unpublished",
  "fx_rate_date_not_latest",
]);

const rateNotes = (
  core: Core,
  findings: readonly { event_id: string; code: string }[],
): Warning[] => {
  const byEvent = new Map<string, Set<string>>();
  for (const finding of findings) {
    byEvent.set(finding.event_id, (byEvent.get(finding.event_id) ?? new Set()).add(finding.code));
  }
  const afterFiscal = new Set(
    core.state.warnings
      .filter((warning) => warning.code === "fx_rate_date_after_fiscal_date")
      .map((warning) => warning.event_id),
  );
  const lines: { event_id: string; depends: string[] }[] = [
    ...core.transmissions.map((line) => ({
      event_id: line.event_id,
      depends: [
        line.event_id,
        // The lineage runs from the lot consumed back to the root acquisition,
        // which is its last step (`lineageOf`): the root needs no entry of its
        // own — the review of PR #75 found that entry to be an equivalent mutant.
        ...line.lots.flatMap((lot) => lot.lineage.map((step) => step.event_id)),
      ],
    })),
    ...core.income.map((line) => ({ event_id: line.event_id, depends: [line.event_id] })),
    ...core.expenses.map((line) => ({ event_id: line.event_id, depends: [line.event_id] })),
  ];
  const notes: Warning[] = [];
  /** The events a line depends on whose findings include one of `codes`, with those codes. */
  const matching = (depends: readonly string[], wanted: (code: string) => boolean) => {
    const events = depends.filter((id) =>
      [...(byEvent.get(id) ?? [])].some((code) => wanted(code)),
    );
    const codes = [
      ...new Set(events.flatMap((id) => [...(byEvent.get(id) as Set<string>)].filter(wanted))),
    ].sort();
    return { events, codes };
  };
  for (const line of lines) {
    const depends = [...new Set(line.depends)];
    // Each finding says **what it is** (review of PR #75): a rate the history
    // contradicts is not the same as one it could not contrast, and saying «not
    // the official one» of the second would state what nobody checked.
    const wrong = matching(depends, (code) => WRONG_RATE_CODES.has(code));
    if (wrong.events.length > 0) {
      notes.push(
        note(
          "tax_fx_rate_finding",
          line.event_id,
          "this line depends on an ECB rate that is not the official one of its date; the figure is computed with the rate of the ledger",
          { criterion: "25", events: wrong.events, codes: wrong.codes },
        ),
      );
    }
    const unverified = matching(depends, (code) => !WRONG_RATE_CODES.has(code));
    if (unverified.events.length > 0) {
      notes.push(
        note(
          "tax_fx_rate_unverified",
          line.event_id,
          "this line depends on an ECB rate the history could not contrast; nothing is said of whether it is right, and the figure is computed with the rate of the ledger",
          { criterion: "25", events: unverified.events, codes: unverified.codes },
        ),
      );
    }
    const late = depends.filter((id) => afterFiscal.has(id));
    if (late.length > 0) {
      notes.push(
        note(
          "tax_fx_rate_date_after_fiscal_date",
          line.event_id,
          "this line depends on an ECB rate dated after its fiscal date; the figure is computed with the rate of the ledger",
          { criterion: "25", events: late },
        ),
      );
    }
  }
  return notes;
};

const notesOf = (
  core: Core,
  year: number,
  fromCode: readonly string[],
  inKind: readonly InKindLine[],
  ddiNotes: readonly Warning[],
): Warning[] => {
  const notes: Warning[] = [
    note(
      "tax_quota_not_computed",
      "",
      "this is the savings base, not the tax: the rest of the return is not in the ledger",
      {},
    ),
  ];
  if (core.income.some((line) => line.kind === "dividend" && !line.withholding_origin.isZero())) {
    notes.push(
      note(
        "tax_double_taxation_partial",
        "",
        "only the treaty limit of the double taxation deduction is computed; the effective average rate needs the whole return, and what is not deductible is lost",
        {},
      ),
    );
  }
  notes.push(...ddiNotes);
  const foreign = [...core.ctx.events.values()].filter(
    (event) =>
      event.type === "fx_exchange" && yearOf((event as FxExchangeEvent).value_date) === year,
  );
  const currencies = new Set<string>([
    ...core.transmissions.map((line) => line.proceeds.amount.currency),
    ...core.income.map((line) => line.gross.amount.currency),
    ...foreign.flatMap((event) => [
      (event as FxExchangeEvent).sold_currency,
      (event as FxExchangeEvent).bought_currency,
    ]),
  ]);
  currencies.delete(EUR);
  if (currencies.size > 0) {
    notes.push(
      note(
        "tax_fx_differences_not_computed",
        "",
        "gains and losses of foreign cash (criterion #4) are not computed",
        { currencies: [...currencies].sort(), fx_exchanges: foreign.map((event) => event.id) },
      ),
    );
  }
  for (const entry of inKind) {
    notes.push(
      note(
        "tax_in_kind_income_not_integrated",
        entry.event_id,
        "income in kind is recorded and not integrated (criterion #8 in force)",
        { income_eur: entry.amount_eur.amount.toString(), base: entry.base },
      ),
    );
  }
  for (const line of core.transmissions) {
    if (line.provisional_until !== undefined) {
      notes.push(
        note(
          "tax_window_open",
          line.event_id,
          `the wash-sale window of this loss is open until ${line.provisional_until}`,
          {
            asset_id: line.asset_id,
            loss_eur: line.own_eur.add(line.released_eur).roundToCents().amount.toString(),
            window_end: line.provisional_until,
          },
        ),
      );
    }
  }
  for (const outcome of core.ctx.walk.outcomes) {
    const gain = core.state.gains[outcome.gain_index] as RealizedGain;
    if (gain.year !== year) {
      continue;
    }
    if (outcome.foreign_released.length > 0) {
      notes.push(
        note(
          "tax_release_category_differs",
          gain.event_id,
          "a deferred loss of the other income category was released here and integrated where it came from",
          {
            amount_eur: sum(outcome.foreign_released.map((r) => r.amount_eur))
              .roundToCents()
              .amount.toString(),
          },
        ),
      );
    }
  }
  for (const action of exchangesOfYear(core, year)) {
    if (action.neutrality_regime === false) {
      notes.push(
        note(
          "tax_neutrality_contradiction",
          action.id,
          "the event says the neutrality regime does not apply, yet it keeps date and cost",
          { kind: action.kind },
        ),
      );
    }
  }
  // Two assets with one ISIN are one security to the tax agency and two to the
  // engine: its wash-sale rule and its FIFO cannot see across them (ADR-0009).
  // Recording refuses it; a ledger written before is told here, where it costs.
  for (const [isin, assets] of sharedIsins(core.state.assets.values())) {
    notes.push(
      note(
        "tax_duplicate_isin",
        "",
        `ISIN ${isin} is shared by ${assets.join(", ")}: the wash-sale rule and FIFO treat them as different securities`,
        { isin, assets },
      ),
    );
  }
  for (const entry of core.compensation.expired) {
    notes.push(
      note(
        "tax_loss_expires",
        "",
        `a pending ${entry.category} balance of ${entry.origin_year} expires`,
        {
          origin_year: entry.origin_year,
          category: entry.category,
          amount_eur: entry.amount_eur.amount.toString(),
        },
      ),
    );
  }
  if (fromCode.length > 0) {
    notes.push(
      note(
        "tax_settings_default_used",
        "",
        "some fiscal settings are not in the ledger and were taken from the code (ADR-0022)",
        { fields: [...fromCode] },
      ),
    );
  }
  return notes;
};
