// The tax year (feature 009): the savings base of the return, computed from the
// ledger and **only** from the ledger.
//
// What it produces is the **base**, not the tax: it cannot see the rest of the
// return (the personal allowance, the general base, the effective average
// rate), and pretending it can would give a believable and false figure
// (decision (a)). Every figure opens into the events that produce it
// (decision (c)) and says which fiscal criteria it depends on (decision (b));
// the doubtful ones get a section of their own with what they put at stake.
//
// The report aggregates **both books**, per taxpayer, and says so
// (`scope: "fiscal_total"`): the first exception of constitution III, and the
// only place where the core and the bucket meet in a calculation.
//
// **No price is read anywhere on this path** (constitution II): the
// architecture test keeps `prices.ts` out of reach and a test deletes every
// price of a ledger and compares the report byte for byte.

import { type CivilDate, yearOf } from "../dates/civil-date.js";
import { DomainError } from "../errors.js";
import type { Ulid } from "../ids/ulid.js";
import { Decimal } from "../money/decimal.js";
import { FxRate } from "../money/fx-rate.js";
import { Money } from "../money/money.js";
import {
  businessDateOf,
  type OperationEvent,
  projectLedger,
} from "../projections/project-ledger.js";
import type { FiscalLot, LedgerState, RealizedGain, Warning } from "../projections/state.js";
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
  lossCarryforwardYearsOf,
  type Settings,
  savingsOffsetLimitPctOf,
  treatyWithholdingPctOf,
} from "../settings/settings.js";
import { compensate, type YearBalances } from "./compensation.js";
import {
  CRITERION_IDS,
  type CriterionId,
  FISCAL_CRITERIA,
  isDoubtful,
  sortCriteria,
} from "./criteria.js";
import {
  currencyFirstGain,
  deferralLine,
  expenseLines,
  incomeLine,
  type LineContext,
  transmissionLine,
  withholdingLines,
} from "./lines.js";
import type {
  AnchorDifference,
  Compensation,
  DoubleTaxationLine,
  DoubtfulItem,
  ExpenseLine,
  FiledAnchor,
  IncomeLine,
  InKindLine,
  PendingLoss,
  SettingsDiff,
  TaxYearReport,
  TransmissionLine,
} from "./report.js";
import { type PendingDeferral, type WashSaleOutcome, walkWashSales } from "./wash-sale.js";

const EUR = "EUR";

/** The regime of compensation the engine implements is the one in force since 2018 (A13). */
export const FIRST_SUPPORTED_YEAR = 2018;

export interface TaxOptions {
  /** The date of the query: it decides what is provisional. */
  today: CivilDate;
  /** What was declared, when the ledger knows it (ADR-0020): it anchors the carry-forward. */
  filed?: readonly FiledAnchor[];
}

const zero = (): Money => Money.zero(EUR);

const sum = (values: readonly Money[]): Money => values.reduce((total, v) => total.add(v), zero());

/** Everything the engine computes for one reading of the settings. */
interface Core {
  state: LedgerState;
  ctx: LineContext;
  transmissions: TransmissionLine[];
  /** The outcome of the rule behind each transmission line, in the same order. */
  outcomes: WashSaleOutcome[];
  income: IncomeLine[];
  expenses: ExpenseLine[];
  compensation: Compensation;
  anchor?: AnchorDifference;
  /** Deferred losses still sitting on lots at 31/12 of the year. */
  pendingDeferrals: PendingDeferral[];
  firstYear: number;
  /** The savings base of every year of the chain, up to the one asked. */
  bases: Map<number, Money>;
}

/** A reading that could not be computed because the ledger has invalid events under it. */
interface Invalid {
  invalid: { id: Ulid; type: string; code: string }[];
}

const isInvalid = (result: Core | Invalid): result is Invalid => "invalid" in result;

/** The year of the business date of an event of the lot journal: they are all operations. */
const yearOfEntry = (state: LedgerState, events: Map<Ulid, LedgerEvent>) => {
  const cache = new Map<Ulid, number>();
  return (eventId: Ulid): number => {
    let year = cache.get(eventId);
    if (year === undefined) {
      year = yearOf(businessDateOf(state, events.get(eventId) as OperationEvent));
      cache.set(eventId, year);
    }
    return year;
  };
};

const categoryOf = (state: LedgerState, assetId: string): IncomeCategory =>
  incomeCategoryOf(
    state.fiscalSettings,
    (state.assets.get(assetId) as { asset_type: AssetType }).asset_type,
  );

const computeCore = (
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
  settings?: Settings,
): Core | Invalid => {
  const state = projectLedger(events, {
    collectErrors: true,
    ...(settings === undefined ? {} : { settings }),
  });
  if (state.invalid.length > 0) {
    return {
      invalid: state.invalid.map((entry) => ({
        id: entry.event.id,
        type: entry.event.type,
        code: entry.error.code,
      })),
    };
  }
  const byId = new Map<Ulid, LedgerEvent>(
    events.filter((event) => !state.reversed.has(event.id)).map((event) => [event.id, event]),
  );
  const types = new Map<Ulid, string>([...byId].map(([id, event]) => [id, event.type]));
  const entryYear = yearOfEntry(state, byId);
  const walk = walkWashSales(state, options.today, types, (eventId) => entryYear(eventId) > year);
  const lots = new Map<string, FiscalLot>();
  for (const entry of state.lots.values()) {
    for (const lot of [...entry.open, ...entry.closed]) {
      lots.set(lot.id, lot);
    }
  }
  const carved = new Set<string>();
  for (const entry of state.lotJournal) {
    if (entry.kind === "carve") {
      carved.add(entry.lot_id);
      carved.add(entry.into_lot_id);
    }
  }
  const ctx: LineContext = {
    state,
    settings: state.fiscalSettings,
    events: byId,
    lots,
    carved,
    walk,
  };

  // Every year of the ledger, because the carry-forward chains them.
  const balances = new Map<number, YearBalances>();
  const add = (y: number, category: IncomeCategory, amount: Money): void => {
    const current = balances.get(y) ?? { capital_gain: zero(), movable_capital: zero() };
    current[category] = current[category].add(amount);
    balances.set(y, current);
  };
  for (const outcome of walk.outcomes) {
    const gain = state.gains[outcome.gain_index] as RealizedGain;
    add(gain.year, categoryOf(state, gain.asset_id), outcome.computable_eur.roundToCents());
    for (const release of outcome.foreign_released) {
      const origin = state.gains[release.origin] as RealizedGain;
      add(gain.year, categoryOf(state, origin.asset_id), release.amount_eur.roundToCents());
    }
  }
  for (const income of state.income) {
    add(income.year, "movable_capital", income.gross_eur.roundToCents());
  }
  const expenses = expenseLines(ctx);
  for (const expense of expenses) {
    add(yearOf(expense.fiscal_date), "movable_capital", expense.amount_eur_rounded);
  }
  const years = [...balances.keys()];
  const firstYear = years.length === 0 ? year : Math.min(year, ...years);
  if (firstYear < FIRST_SUPPORTED_YEAR) {
    throw new DomainError(
      "tax_year_unsupported",
      `the engine applies the compensation regime in force since ${FIRST_SUPPORTED_YEAR}; ${firstYear} is earlier`,
      { year: firstYear, first_supported: FIRST_SUPPORTED_YEAR },
    );
  }

  const rules = {
    limitPct: savingsOffsetLimitPctOf(state.fiscalSettings),
    carryYears: lossCarryforwardYearsOf(state.fiscalSettings),
  };
  let pending: PendingLoss[] = [];
  let compensation = compensate(firstYear, zeroBalances(), [], rules);
  let anchor: AnchorDifference | undefined;
  const bases = new Map<number, Money>();
  for (let y = firstYear; y <= year; y += 1) {
    compensation = compensate(y, balances.get(y) ?? zeroBalances(), pending, rules);
    bases.set(y, compensation.base_eur);
    pending = compensation.pending;
    const filed = options.filed?.find((entry) => entry.year === y);
    if (filed !== undefined) {
      const declared = filed.pending.map((entry) => ({
        origin_year: entry.origin_year,
        category: entry.category,
        amount_eur: entry.amount_eur,
        expires_after: entry.origin_year + rules.carryYears,
      }));
      anchor = { year: y, computed: pending, declared };
      pending = declared;
    }
  }

  const outcomes = walk.outcomes.filter(
    (outcome) => (state.gains[outcome.gain_index] as RealizedGain).year === year,
  );
  const transmissions = outcomes.map((outcome) => transmissionLine(ctx, outcome));
  const income = state.income
    .filter((entry) => entry.year === year)
    .map((entry) => incomeLine(ctx, entry));
  return {
    state,
    ctx,
    transmissions,
    outcomes,
    income,
    expenses: expenses.filter((expense) => yearOf(expense.fiscal_date) === year),
    compensation,
    ...(anchor === undefined ? {} : { anchor }),
    pendingDeferrals: walk.pendingAtCutoff,
    firstYear,
    bases,
  };
};

/** A tax year whose savings base moves with a change of settings. */
export interface MovedTaxYear {
  year: number;
  before: Money;
  after: Money;
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
  const basesOf = (settings: Settings): Map<number, Money> | undefined => {
    try {
      const core = computeCore(events, Math.max(last, FIRST_SUPPORTED_YEAR), options, settings);
      return isInvalid(core) ? undefined : core.bases;
    } catch (error) {
      if (error instanceof DomainError && error.code === "tax_year_unsupported") {
        return undefined;
      }
      throw error;
    }
  };
  const before = basesOf(current);
  const after = basesOf(next);
  if (before === undefined || after === undefined) {
    return [];
  }
  // A change of fiscal date can move a figure into a year the other reading
  // does not even reach: every year of either chain, zero where it is absent.
  const moved: MovedTaxYear[] = [];
  const years = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b);
  for (const year of years.filter((y) => y <= last)) {
    const was = before.get(year) ?? zero();
    const is = after.get(year) ?? zero();
    if (!was.eq(is)) {
      moved.push({ year, before: was, after: is });
    }
  }
  return moved;
};

const zeroBalances = (): YearBalances => ({ capital_gain: zero(), movable_capital: zero() });

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

// --- Doubtful criteria --------------------------------------------------------

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
): DoubtfulItem["direction"] => {
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
  fields: Omit<DoubtfulItem, "criterion" | "certainty" | "documented_risk">,
): DoubtfulItem => ({
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
  const windows = (types: readonly AssetType[], window: "1y" | "2m") => ({
    ...settings,
    wash_sale_window: {
      ...settings.wash_sale_window,
      ...Object.fromEntries(types.map((type) => [type, window])),
    },
  });
  const categories = Object.fromEntries(
    (["etc", "etp"] as const).map((type) => [
      type,
      incomeCategoryOf(settings, type) === "capital_gain" ? "movable_capital" : "capital_gain",
    ]),
  );
  return [
    { criterion: "1", settings: { ...settings, fiscal_date_rule: flipped } },
    { criterion: "2:listed", settings: windows(["stock", "etf", "etc", "etp"], "1y") },
    { criterion: "2:crypto", settings: windows(["crypto"], "2m") },
    {
      criterion: "2b",
      settings: {
        ...settings,
        wash_sale_transfer_counts: settings.wash_sale_transfer_counts === false,
      },
    },
    {
      criterion: "etc_etp_category",
      settings: { ...settings, income_category: { ...settings.income_category, ...categories } },
    },
  ];
};

const doubtful = (
  core: Core,
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
): DoubtfulItem[] => {
  const items: DoubtfulItem[] = [];
  const all = [...core.transmissions];
  const declaring = (id: CriterionId): TransmissionLine[] =>
    all.filter((line) => line.criteria.includes(id));
  const current = figuresOf(core);

  for (const alternative of alternatives(core.state.fiscalSettings)) {
    const lines = declaring(alternative.criterion);
    const other = computeCore(events, year, options, alternative.settings);
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
          : { exposure_eur: sum(foreign.map((line) => line.own_eur.roundToCents())) }),
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
  exposure("5", declaring("5"), (line) => abs(line.proceeds.eur.roundToCents()));
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
    items.push(
      item(id, {
        measure: "difference",
        event_ids: lines.map((line) => line.event_id),
        base_difference_eur: difference,
        direction: directionOf(difference, zero()),
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
  // review), and when everything is absorbed the order changes nothing.
  const phase2 = core.compensation.steps.filter((step) => step.phase === 2);
  const origins = new Set(phase2.map((step) => step.origin_year));
  const leftover =
    core.compensation.expired.length > 0 ||
    core.compensation.pending.some((entry) => entry.origin_year < year);
  const competing = origins.size > 1 && leftover;
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
  const order = (entry: DoubtfulItem): number => CRITERION_IDS.indexOf(entry.criterion);
  return items.filter((entry) => isDoubtful(entry.criterion)).sort((a, b) => order(a) - order(b));
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
  const other = computeCore(events, year, options, previous?.settings ?? DEFAULT_SETTINGS);
  const currentOrigin = (history[history.length - 1] as { event_id: Ulid }).event_id;
  const previousOrigin = previous === undefined ? "default" : previous.event_id;
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
): TaxYearReport => {
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
  const notes = notesOf(core, year, settings.from_code, inKind, ddi.notes);
  const diff = settingsDiff(core, events, year, options);
  return {
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
    ...(core.anchor === undefined ? {} : { anchor: core.anchor }),
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
    doubtful: doubtful(core, events, year, options),
    notes,
    ...(diff === undefined ? {} : { settings_diff: diff }),
  };
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
    if (outcome.scale_excluded) {
      notes.push(
        note(
          "tax_scale_in_window",
          gain.event_id,
          "a split between the loss and a purchase of its window makes their units incomparable; that purchase was left out",
          { asset_id: gain.asset_id },
        ),
      );
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
