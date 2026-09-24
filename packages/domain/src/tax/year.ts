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
import { Money } from "../money/money.js";
import { sharedIsins } from "../projections/isin.js";
import type { LedgerState, RealizedGain, Warning } from "../projections/state.js";
import {
  ASSET_TYPES,
  type AssetType,
  type CorporateActionEvent,
  type FxExchangeEvent,
  type LedgerEvent,
} from "../schema/events.js";
import {
  DEFAULT_SETTINGS,
  type IncomeCategory,
  incomeCategoryOf,
  type Settings,
  treatyWithholdingPctOf,
} from "../settings/settings.js";
import { washSaleWindowOf } from "../settings/wash-sale.js";
import {
  CRITERION_IDS,
  type CriterionId,
  categoryCriterion,
  FISCAL_CRITERIA,
  isDoubtful,
  sortCriteria,
} from "./criteria.js";
import {
  currencyFirstGain,
  deferralLine,
  incomeLine,
  transmissionLine,
  withholdingLines,
} from "./lines.js";
import type {
  CriterionStake,
  DoubleTaxationLine,
  IncomeLine,
  InKindLine,
  PendingLoss,
  SettingsDiff,
  TaxYearReport,
  TransmissionLine,
} from "./report.js";
import type { WashSaleOutcome } from "./wash-sale.js";

const EUR = "EUR";

export { FIRST_SUPPORTED_YEAR, type TaxOptions } from "./chain.js";

import {
  type ChainCore,
  categoryOf,
  FIRST_SUPPORTED_YEAR,
  type Invalid,
  isInvalid,
  isUnsupported,
  type TaxOptions,
  taxChain,
  tryReading,
  type Unsupported,
} from "./chain.js";

const zero = (): Money => Money.zero(EUR);

const sum = (values: readonly Money[]): Money => values.reduce((total, v) => total.add(v), zero());

/** The chain of years plus the lines of the one asked. */
interface Core extends ChainCore {
  transmissions: TransmissionLine[];
  /** The outcome of the rule behind each transmission line, in the same order. */
  outcomes: WashSaleOutcome[];
  income: IncomeLine[];
}

/**
 * Everything the engine computes for one reading of the settings: the chain of
 * years (`taxChain`) plus the lines of the year asked. The chain is shared
 * with the warning of a settings change, the warning of a closed year and the
 * comparison with what was filed, so that the four never disagree.
 */
const computeCore = (
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
  return {
    ...chain,
    transmissions,
    outcomes,
    income,
    expenses: expenses.filter((expense) => yearOf(expense.fiscal_date) === year),
  };
};

/**
 * The same, for a reading that is **not** the main one: it may reach below the
 * first supported year, and that is information about the reading, never a
 * reason to deny the report the user asked for (feature 011, block 4).
 */
const tryComputeCore = (
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
  settings?: Settings,
): Core | Invalid | Unsupported => tryReading(() => computeCore(events, year, options, settings));

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

/** A transmission line is one account of one event: a forced sale can have several. */
const lineKey = (line: TransmissionLine): string => `${line.event_id}|${line.account_id}`;

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

// --- What each criterion puts at stake -----------------------------------------

interface Figures {
  base: Money;
  pending: Money;
  deferred: Money;
}

const figuresOf = (core: Core): Figures => ({
  base: core.compensation.base_eur,
  pending: sum(core.compensation.pending.map((entry) => entry.amount_eur)),
  deferred: sum(core.pendingDeferrals.map((entry) => entry.amount_eur)).roundToCents(),
});

const directionOf = (
  baseDifference: Money,
  pendingDifference: Money,
): CriterionStake["direction"] => {
  if (baseDifference.isNegative()) {
    return "conservative";
  }
  if (!baseDifference.isZero()) {
    return "aggressive";
  }
  // The year does not move: the carry-forward may. More losses left to carry
  // under the other reading means the current one leaves less for later.
  if (pendingDifference.isNegative()) {
    return "conservative";
  }
  return pendingDifference.isZero() ? "none" : "aggressive";
};

const item = (
  criterion: CriterionId,
  fields: Omit<CriterionStake, "criterion" | "certainty" | "documented_risk">,
): CriterionStake => ({
  criterion,
  certainty: FISCAL_CRITERIA[criterion].certainty,
  documented_risk: FISCAL_CRITERIA[criterion].risk,
  ...fields,
});

/** The settings of the other reading of each configurable criterion. */
const alternatives = (settings: Settings): { criterion: CriterionId; settings: Settings }[] => {
  const flipped = Object.fromEntries(
    ASSET_TYPES.map((type) => [
      type,
      (settings.fiscal_date_rule[type] ?? DEFAULT_SETTINGS.fiscal_date_rule[type]) === "trade_date"
        ? "value_date"
        : "trade_date",
    ]),
  );
  // The other side of #2 for the types that apply one side today: the
  // alternative is labelled by the window applied, like the figures (feature
  // 009 review). A reading nobody applies is not computed.
  const windows = (
    criterion: CriterionId,
    types: readonly AssetType[],
    from: "1y" | "2m",
    to: "1y" | "2m",
  ): { criterion: CriterionId; settings: Settings }[] => {
    const applying = types.filter((type) => washSaleWindowOf(settings, type) === from);
    return applying.length === 0
      ? []
      : [
          {
            criterion,
            settings: {
              ...settings,
              wash_sale_window: {
                ...settings.wash_sale_window,
                ...Object.fromEntries(applying.map((type) => [type, to])),
              },
            },
          },
        ];
  };
  const listed = ["stock", "etf", "etc", "etp"] as const;
  // #24, one reading per type: which of the four variants each one applies
  // depends on its own `income_category`, so they are not flipped together.
  const category = (type: "etc" | "etp"): { criterion: CriterionId; settings: Settings } => {
    const applied = incomeCategoryOf(settings, type);
    return {
      criterion: categoryCriterion(type, applied),
      settings: {
        ...settings,
        income_category: {
          ...settings.income_category,
          [type]: applied === "capital_gain" ? "movable_capital" : "capital_gain",
        },
      },
    };
  };
  return [
    { criterion: "1", settings: { ...settings, fiscal_date_rule: flipped } },
    ...windows("2:listed", listed, "2m", "1y"),
    ...windows("2:listed_1y", listed, "1y", "2m"),
    ...windows("2:crypto", ["crypto"], "1y", "2m"),
    ...windows("2:crypto_2m", ["crypto"], "2m", "1y"),
    // Funds, since the correction of 2026-09-22: a criterion that is doubtful
    // and offers no figure is of no use to anybody, so the other reading is
    // computed like the one of listed securities.
    ...windows("2:fund_2m", ["fund", "money_market"], "2m", "1y"),
    ...windows("2:fund_1y", ["fund", "money_market"], "1y", "2m"),
    {
      criterion: "2b",
      settings: {
        ...settings,
        wash_sale_transfer_counts: settings.wash_sale_transfer_counts === false,
      },
    },
    category("etc"),
    category("etp"),
  ];
};

/**
 * What every criterion the year **applies** puts at stake, in the order of the
 * document.
 *
 * It does not split them: `taxYear` does, into `doubtful` and `settled`. The
 * split is a partition and not a filter on purpose. It used to end in
 * `.filter(isDoubtful)`, and the day #18 and #19 rose to high certainty that
 * line silently stopped showing an amount it had just finished computing.
 * A criterion is left out here only when **no figure of the year applies it**,
 * which is not a judgement about the amount: an entry whose other reading moves
 * nothing is kept, with its zeros.
 */
const criterionStakes = (
  core: Core,
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
): CriterionStake[] => {
  const items: CriterionStake[] = [];
  const all = [...core.transmissions];
  const declaring = (id: CriterionId): TransmissionLine[] =>
    all.filter((line) => line.criteria.includes(id));
  const current = figuresOf(core);

  for (const alternative of alternatives(core.state.fiscalSettings)) {
    const lines = declaring(alternative.criterion);
    const other = tryComputeCore(events, year, options, alternative.settings);
    // The other reading reaches below the first supported year: it cannot be
    // measured, and the reason is not the same as "it leaves invalid events" —
    // that one is repaired by fixing the ledger and this one cannot be
    // repaired at all.
    if (isUnsupported(other)) {
      if (lines.length > 0) {
        items.push(
          item(alternative.criterion, {
            measure: "not_quantifiable",
            event_ids: lines.map((line) => line.event_id),
            direction: FISCAL_CRITERIA[alternative.criterion].risk,
            reason: "unsupported_under_alternative",
          }),
        );
      }
      continue;
    }
    if (isInvalid(other)) {
      if (lines.length > 0) {
        items.push(
          item(alternative.criterion, {
            measure: "not_quantifiable",
            event_ids: lines.map((line) => line.event_id),
            direction: FISCAL_CRITERIA[alternative.criterion].risk,
            reason: "invalid_under_alternative",
            invalid_count: other.invalid.length,
          }),
        );
      }
      continue;
    }
    const moved = figuresOf(other);
    const base = moved.base.sub(current.base);
    const pendingDifference = moved.pending.sub(current.pending);
    const deferred = moved.deferred.sub(current.deferred);
    // The figures that depend on it: those that apply it, and those whose
    // figure changes under the other reading (a loss of another year carried
    // or released into this one).
    const otherLines = new Map(other.transmissions.map((line) => [lineKey(line), line]));
    const affected = all.filter(
      (line) =>
        lines.includes(line) ||
        otherLines.get(lineKey(line))?.computable_eur_rounded.eq(line.computable_eur_rounded) !==
          true,
    );
    if (affected.length === 0 && base.isZero() && pendingDifference.isZero() && deferred.isZero()) {
      continue;
    }
    const markets =
      alternative.criterion === "2:listed"
        ? [...new Set(affected.map((line) => line.market ?? "unknown"))].sort()
        : undefined;
    items.push(
      item(alternative.criterion, {
        measure: "difference",
        event_ids: affected.map((line) => line.event_id),
        base_difference_eur: base,
        pending_difference_eur: pendingDifference,
        deferred_difference_eur: deferred,
        direction: directionOf(base, pendingDifference),
        ...(markets === undefined ? {} : { markets }),
      }),
    );
  }

  // #4, method: first in currency, then at the rate of the disposal.
  const foreign = declaring("4");
  if (foreign.length > 0) {
    const differences = foreign.map((line) => {
      const alternative = currencyFirstGain(line);
      return alternative === undefined
        ? undefined
        : alternative.roundToCents().sub(line.own_eur.roundToCents());
    });
    const computable = differences.every((difference) => difference !== undefined);
    const difference = sum(differences.filter((d): d is Money => d !== undefined));
    items.push(
      item("4", {
        measure: computable ? "difference" : "exposure",
        event_ids: foreign.map((line) => line.event_id),
        ...(computable
          ? { base_difference_eur: difference }
          : {
              // An exposure is an amount at stake, whatever the sign of the result.
              exposure_eur: sum(
                foreign.map((line) => {
                  const own = line.own_eur.roundToCents();
                  return own.isNegative() ? own.neg() : own;
                }),
              ),
            }),
        direction: computable ? directionOf(difference, zero()) : "both",
        ...(computable ? {} : { reason: "lot_in_other_currency" as const }),
      }),
    );
  }

  // Exposures: the amount of the figures the criterion touches.
  const exposure = (
    id: CriterionId,
    lines: readonly TransmissionLine[],
    amount: (line: TransmissionLine) => Money,
  ): void => {
    if (lines.length > 0) {
      items.push(
        item(id, {
          measure: "exposure",
          event_ids: lines.map((line) => line.event_id),
          exposure_eur: sum(lines.map(amount)),
          direction: FISCAL_CRITERIA[id].risk,
        }),
      );
    }
  };
  const abs = (money: Money): Money => (money.isNegative() ? money.neg() : money);
  // #5 reaches every figure converted at the rate of an earlier day: the
  // disposals, and also the income and the deductible fees (feature 009 review).
  const lateIncome = core.income.filter((line) => line.criteria.includes("5"));
  const lateFees = core.expenses.filter((line) => line.criteria.includes("5"));
  const lateSales = declaring("5");
  if (lateSales.length + lateIncome.length + lateFees.length > 0) {
    items.push(
      item("5", {
        measure: "exposure",
        event_ids: [
          ...lateSales.map((line) => line.event_id),
          ...lateIncome.map((line) => line.event_id),
          ...lateFees.map((line) => line.event_id),
        ],
        exposure_eur: sum([
          ...lateSales.map((line) => abs(line.proceeds.eur.roundToCents())),
          ...lateIncome.map((line) => line.gross_eur_rounded),
          ...lateFees.map((line) => abs(line.amount_eur_rounded)),
        ]),
        direction: FISCAL_CRITERIA["5"].risk,
      }),
    );
  }
  // A window no reading of the document supports: what it deferred is at stake.
  exposure("2:other", declaring("2:other"), (line) => abs(line.deferred_eur.roundToCents()));
  exposure("7", declaring("7"), (line) => line.cost_eur.roundToCents());
  exposure("13", declaring("13"), (line) => abs(line.computable_eur_rounded));
  exposure("15", declaring("15"), (line) =>
    abs(sum(line.released.filter((r) => r.travelled).map((r) => r.amount_eur)).roundToCents()),
  );
  exposure("17", declaring("17"), (line) =>
    FxRate.of(Decimal.parse(line.proceeds.fx_rate), line.fee.currency, line.proceeds.fx_rate_date)
      .toEur(line.fee)
      .roundToCents(),
  );
  exposure("20", declaring("20"), (line) =>
    abs(
      sum(line.lots.filter((lot) => lot.gain_eur.isNegative()).map((lot) => lot.gain_eur)),
    ).roundToCents(),
  );
  // #18, #19, #21: the deferral with the other reading, on the figure of the operation.
  for (const id of ["18", "19", "21"] as const) {
    const lines = declaring(id);
    if (lines.length === 0) {
      continue;
    }
    const difference = sum(
      lines.map((line) =>
        (core.outcomes[core.transmissions.indexOf(line)] as WashSaleOutcome).alternatives[id]
          .neg()
          .roundToCents(),
      ),
    );
    // #18 read the other way can only defer onto units still held (direction's
    // decision): with none, it moves nothing, and the item says why.
    const withoutCarrier =
      id === "18" &&
      difference.isZero() &&
      lines.some(
        (line) =>
          (core.outcomes[core.transmissions.indexOf(line)] as WashSaleOutcome).no_carrier_for_18,
      );
    items.push(
      item(id, {
        measure: "difference",
        event_ids: lines.map((line) => line.event_id),
        base_difference_eur: difference,
        direction: directionOf(difference, zero()),
        ...(withoutCarrier ? { reason: "no_carrier_left" as const } : {}),
      }),
    );
  }
  // #15 also covers what travelled and is still pending at 31/12.
  const travelledPending = core.pendingDeferrals.filter((entry) => entry.travelled);
  if (travelledPending.length > 0) {
    const existing = items.find((entry) => entry.criterion === "15");
    const amount = abs(sum(travelledPending.map((entry) => entry.amount_eur))).roundToCents();
    if (existing === undefined) {
      items.push(
        item("15", {
          measure: "exposure",
          event_ids: [],
          exposure_eur: amount,
          direction: FISCAL_CRITERIA["15"].risk,
        }),
      );
    } else {
      existing.exposure_eur = (existing.exposure_eur as Money).add(amount);
    }
  }
  // #8 and #7/#13: what the ledger received in kind or exchanged without saying
  // whether the neutrality regime applies. Never quantified with a price.
  for (const entry of core.state.inKindIncome.filter((e) => e.year === year)) {
    const action = core.ctx.events.get(entry.event_id) as CorporateActionEvent;
    if (action.kind === "crypto_fork") {
      items.push(
        item("8", {
          measure: "exposure",
          event_ids: [entry.event_id],
          exposure_eur: entry.amount_eur,
          direction: FISCAL_CRITERIA["8"].risk,
        }),
      );
    }
  }
  for (const action of exchangesOfYear(core, year)) {
    if (action.neutrality_regime !== undefined) {
      continue;
    }
    const id: CriterionId = action.kind === "spin_off" ? "7" : "13";
    const created = [...core.ctx.lots.values()].filter((lot) => lot.source_event_id === action.id);
    items.push(
      item(id, {
        measure: "exposure",
        event_ids: [action.id],
        exposure_eur: sum(created.map((lot) => lot.original_cost_eur)).roundToCents(),
        direction: "aggressive",
        reason: "regime_not_recorded",
      }),
    );
  }
  // #22: the order among years only matters when two or more years of origin
  // compete for a balance that cannot absorb them all. Two steps of one year
  // (its own category, then the other) compete with nothing (feature 009
  // review), and when everything is absorbed the order changes nothing. A year
  // that took nothing competed too: it is the one the order left out, so the
  // years are those of the steps and those still pending or expiring after them.
  const phase2 = core.compensation.steps.filter((step) => step.phase === 2);
  const left = [
    ...core.compensation.expired,
    ...core.compensation.pending.filter((entry) => entry.origin_year < year),
  ];
  const origins = new Set([
    ...phase2.map((step) => step.origin_year),
    ...left.map((entry) => entry.origin_year),
  ]);
  const competing = origins.size > 1 && left.length > 0;
  if (phase2.length > 0) {
    items.push(
      item("22", {
        measure: "exposure",
        event_ids: [],
        exposure_eur: competing ? sum(phase2.map((step) => step.amount_eur)) : zero(),
        direction: FISCAL_CRITERIA["22"].risk,
      }),
    );
  }
  const order = (entry: CriterionStake): number => CRITERION_IDS.indexOf(entry.criterion);
  return [...items].sort((a, b) => order(a) - order(b));
};

/** Mergers, spin-offs and restructurings of the year that keep date and cost. */
const exchangesOfYear = (core: Core, year: number): CorporateActionEvent[] =>
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

// --- The previous settings (A15) ----------------------------------------------

const settingsDiff = (
  core: Core,
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
): SettingsDiff | undefined => {
  const history = core.state.settingsHistory;
  if (history.length === 0) {
    return undefined;
  }
  const previous = history.length > 1 ? history[history.length - 2] : undefined;
  const other = tryComputeCore(events, year, options, previous?.settings ?? DEFAULT_SETTINGS);
  const currentOrigin = (history[history.length - 1] as { event_id: Ulid }).event_id;
  const previousOrigin = previous === undefined ? "default" : previous.event_id;
  // The equivalent of `invalid_before` for the other way a reading can fail:
  // under the previous settings the chain would start before the first
  // supported year, so there is no figure to compare either.
  if (isUnsupported(other)) {
    return {
      previous_origin: previousOrigin,
      current_origin: currentOrigin,
      base_after_eur: core.compensation.base_eur,
      unsupported_before: true,
      changes: [],
    };
  }
  if (isInvalid(other)) {
    return {
      previous_origin: previousOrigin,
      current_origin: currentOrigin,
      base_after_eur: core.compensation.base_eur,
      invalid_before: other.invalid.length,
      changes: [],
    };
  }
  const before = new Map(other.transmissions.map((line) => [lineKey(line), line]));
  const after = new Map(core.transmissions.map((line) => [lineKey(line), line]));
  const changes: SettingsDiff["changes"] = [];
  for (const [key, line] of after) {
    const was = before.get(key);
    if (was === undefined) {
      changes.push({ event_id: line.event_id, what: "entered" });
    } else if (was.category !== line.category) {
      changes.push({
        event_id: line.event_id,
        what: "category",
        before: was.category,
        after: line.category,
      });
    } else if (!was.computable_eur_rounded.eq(line.computable_eur_rounded)) {
      changes.push({
        event_id: line.event_id,
        what: "computable",
        before: was.computable_eur_rounded.amount.toString(),
        after: line.computable_eur_rounded.amount.toString(),
      });
    }
  }
  for (const [key, line] of before) {
    if (!after.has(key)) {
      changes.push({ event_id: line.event_id, what: "left" });
    }
  }
  return {
    previous_origin: previousOrigin,
    current_origin: currentOrigin,
    base_before_eur: other.compensation.base_eur,
    base_after_eur: core.compensation.base_eur,
    changes,
  };
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
        ...line.lots.flatMap((lot) => [
          ...lot.lineage.map((step) => step.event_id),
          lot.root.event_id,
        ]),
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
