// The chain of tax years (feature 010, block 1).
//
// The carry-forward chains one year to the next, so no year can be computed on
// its own: the engine walks from the first year that matters up to the one
// asked, and the walk is shared by everything that needs it — the report, the
// warning of a settings change, the warning of a closed year and the
// comparison with what was filed. Sharing it is what keeps the three from
// disagreeing about the same figure.
//
// The chain **builds its own anchor from the ledger** (ADR-0020): the filed
// returns are the only door, and it takes from them only `renta`, only the one
// in force on the day of the query, and only its pending losses. The figures a
// 720 declares are market values stored in the ledger, and letting them reach
// the savings base would be putting a price into the income tax through the
// back door (prompt 010, decision (d)).

import type { CivilDate } from "../dates/civil-date.js";
import { yearOf } from "../dates/civil-date.js";
import { DomainError } from "../errors.js";
import type { Ulid } from "../ids/ulid.js";
import { Money } from "../money/money.js";
import { type Filing, filingInForce } from "../projections/filings.js";
import {
  businessDateOf,
  type OperationEvent,
  projectLedger,
} from "../projections/project-ledger.js";
import type { FiscalLot, LedgerState, RealizedGain } from "../projections/state.js";
import type { AssetType, LedgerEvent, TaxReturnFiledEvent } from "../schema/events.js";
import {
  type IncomeCategory,
  incomeCategoryOf,
  lossCarryforwardYearsOf,
  type Settings,
  savingsOffsetLimitPctOf,
} from "../settings/settings.js";
import { compensate, type YearBalances } from "./compensation.js";
import { expenseLines, type LineContext } from "./lines.js";
import type {
  AnchorDifference,
  Compensation,
  ExpenseLine,
  FiledAnchor,
  PendingLoss,
} from "./report.js";
import { type PendingDeferral, type WashSaleResult, walkWashSales } from "./wash-sale.js";

const EUR = "EUR";

/** The regime of compensation the engine implements is the one in force since 2018 (A13). */
export const FIRST_SUPPORTED_YEAR = 2018;

export interface TaxOptions {
  /** The date of the query: it decides what is provisional, and what was filed by then. */
  today: CivilDate;
}

const zero = (): Money => Money.zero(EUR);

const zeroBalances = (): YearBalances => ({ capital_gain: zero(), movable_capital: zero() });

/** What the walk of the years leaves, before any line is written. */
export interface ChainCore {
  state: LedgerState;
  ctx: LineContext;
  walk: WashSaleResult;
  expenses: ExpenseLine[];
  compensation: Compensation;
  anchor?: AnchorDifference;
  /** Deferred losses still sitting on lots at 31/12 of the year asked. */
  pendingDeferrals: PendingDeferral[];
  firstYear: number;
  /** The savings base of every year of the chain, up to the one asked. */
  bases: Map<number, Money>;
  /** What each year of the chain leaves pending, by origin and category. */
  pendings: Map<number, PendingLoss[]>;
}

/** A reading that could not be computed because the ledger has invalid events under it. */
export interface Invalid {
  invalid: { id: Ulid; type: string; code: string }[];
}

export const isInvalid = <T extends object>(result: T | Invalid): result is Invalid =>
  "invalid" in result;

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

/** The income category in force for the asset of a gain (ADR-0021, criterion #24). */
export const categoryOf = (state: LedgerState, assetId: string): IncomeCategory =>
  incomeCategoryOf(
    state.fiscalSettings,
    (state.assets.get(assetId) as { asset_type: AssetType }).asset_type,
  );

/**
 * What the ledger says was declared, as far as the carry-forward is concerned.
 *
 * Only `renta`, only in force on the day of the query, and only the pending
 * losses of what it declares. A return filed after that day has not happened
 * yet for a query about the past (ADR-0016), and a superseded one is not the
 * one in force.
 */
export const filedAnchors = (state: LedgerState, today: CivilDate): FiledAnchor[] => {
  const years = new Set<number>();
  for (const filing of state.filings.values()) {
    if (filing.model === "renta" && filing.filed_at <= today) {
      years.add(filing.tax_year);
    }
  }
  const anchors: FiledAnchor[] = [];
  for (const year of [...years].sort((a, b) => a - b)) {
    // Never undefined: the year is in the set because a filing of that year was
    // filed on or before the date, so the chain has a head on or before it.
    const filing = filingInForce(state, "renta", year, today) as Filing;
    const declared = filing.declared as TaxReturnFiledEvent["declared"] & {
      pending_losses: { origin_year: number; category: IncomeCategory; amount_eur: string }[];
    };
    anchors.push({
      year,
      pending: declared.pending_losses.map((entry) => ({
        origin_year: entry.origin_year,
        category: entry.category,
        amount_eur: Money.parse(entry.amount_eur, EUR),
      })),
    });
  }
  return anchors;
};

export const taxChain = (
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
  settings?: Settings,
): ChainCore | Invalid => {
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
  // The chain starts at the earliest of three: the year asked, the first year
  // with figures and the **first filed return** (prompt 010, P5). Walking only
  // the years with figures drops in silence a return filed for a year earlier
  // than the ledger, and with it the losses it declares pending: the way the
  // user brings in what he carried from before the application. Never before
  // 2018: the event refuses an earlier `tax_year`, and so does the guard.
  const filed = filedAnchors(state, options.today);
  const filedYears = filed.map((entry) => entry.year);
  const firstYear = Math.min(year, ...years, ...filedYears);
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
  // `Infinity` when the ledger has no figures at all: any anchor precedes it.
  const firstFigureYear = Math.min(...years);
  const bases = new Map<number, Money>();
  const pendings = new Map<number, PendingLoss[]>();
  for (let y = firstYear; y <= year; y += 1) {
    compensation = compensate(y, balances.get(y) ?? zeroBalances(), pending, rules);
    bases.set(y, compensation.base_eur);
    pending = compensation.pending;
    pendings.set(y, pending);
    const anchored = filed.find((entry) => entry.year === y);
    if (anchored !== undefined) {
      const declared = anchored.pending.map((entry) => ({
        origin_year: entry.origin_year,
        category: entry.category,
        amount_eur: entry.amount_eur,
        expires_after: entry.origin_year + rules.carryYears,
      }));
      anchor = {
        year: y,
        computed: pending,
        declared,
        // Nothing was computed for a year the ledger does not reach: the
        // figures come from what was declared, they do not differ from it.
        ...(y < firstFigureYear ? { before_ledger: true } : {}),
      };
      pending = declared;
    }
  }

  return {
    state,
    ctx,
    walk,
    expenses,
    compensation,
    ...(anchor === undefined ? {} : { anchor }),
    pendingDeferrals: walk.pendingAtCutoff,
    firstYear,
    bases,
    pendings,
  };
};
