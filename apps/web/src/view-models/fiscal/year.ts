// The tax report of one year, turned into what the screen paints.
//
// The web shows, it does not calculate: every figure here comes from
// `taxYear` and is only grouped, named and sorted. What this layer adds is the
// three things a person needs and the engine does not provide:
//
//   1. things named by **what they are** — the asset and the fiscal date —
//      never by the identifier of an event (prompt 010, block 4);
//   2. each figure with the criteria it depends on, said in Spanish;
//   3. the money at stake of a criterion kept apart from its **direction**,
//      because the direction is shown with privacy on and the amount is not.

import { Money } from "@atlas/domain";
import type {
  CriterionId,
  ExpenseLine,
  IncomeLine,
  TaxYearReport,
  TransmissionLine,
} from "@atlas/domain/fiscal";
import { FISCAL_CRITERIA, sortCriteria } from "@atlas/domain/fiscal";
import { formatDate } from "../../format/date.js";
import type { NameIndex } from "../../format/names.js";
import { displayName } from "../../format/names.js";
import { type ExpiryWarning, expiryWarning, type PendingView, pendingView } from "./losses.js";
import { type StakeView, stakeView } from "./stakes.js";

/** One operation behind a total: what it was, when, and how much it puts in. */
export interface FiscalRow {
  key: string;
  /** The asset, or the account for something that has no asset. */
  subject: string;
  /** "Venta", "Dividendo", "Comisión": what kind of operation it is. */
  kind: string;
  date: string;
  amount_eur: Money;
  criteria: readonly CriterionId[];
}

/** A total of the return, with the operations it is made of. */
export interface FiscalGroup {
  key: string;
  title: string;
  /** One line under the title, when the total needs explaining. */
  note?: string;
  total_eur: Money;
  rows: FiscalRow[];
  criteria: readonly CriterionId[];
}

/** A step of the offsetting, said as a sentence. */
export interface OffsetStep {
  key: string;
  text: string;
  amount_eur: Money;
  limited: boolean;
}

/**
 * A year of the chain whose pending losses the engine **replaced** with what a
 * filed return declared (ADR-0020). The screen says it **where the figure it
 * affects is** —the pending losses— because a note at the bottom is a note
 * nobody reads, and what the user is looking at is not what the engine
 * computed (feature 011, block 6).
 */
export interface AnchorView {
  key: string;
  year: number;
  /** What the engine had computed, and what the return declared. */
  computed_eur: Money;
  declared_eur: Money;
  /** The anchored year is earlier than the ledger: what was carried from before. */
  before_ledger: boolean;
}

export interface YearView {
  year: number;
  base_eur: Money;
  /** Every substitution the chain applied, oldest first; empty when there was none. */
  anchors: AnchorView[];
  groups: FiscalGroup[];
  steps: OffsetStep[];
  limit_pct: string;
  pending: PendingView[];
  expired: PendingView[];
  /** What is about to stop being usable, and whether anything can still be done. */
  expiring: ExpiryWarning[];
  doubtful: StakeView[];
  settled: StakeView[];
  /**
   * Nothing happened this year: no operation of any kind, no balance pending
   * and none that expired at its close.
   */
  empty: boolean;
}

const KINDS: Record<string, string> = {
  sell: "Venta",
  forced_sale: "Venta forzosa",
  swap: "Permuta",
  dividend: "Dividendo",
  interest: "Interés",
};

const transmissionRow = (line: TransmissionLine, names: NameIndex): FiscalRow => ({
  key: line.event_id,
  subject: displayName(names, line.asset_id),
  kind: KINDS[line.event_type] ?? "Transmisión",
  date: formatDate(line.fiscal_date),
  amount_eur: line.computable_eur_rounded,
  criteria: sortCriteria(line.criteria),
});

const incomeRow = (line: IncomeLine, names: NameIndex): FiscalRow => ({
  key: line.event_id,
  subject: displayName(names, line.asset_id ?? line.account_id),
  kind: KINDS[line.kind] ?? "Rendimiento",
  date: formatDate(line.fiscal_date),
  amount_eur: line.gross_eur_rounded,
  criteria: sortCriteria(line.criteria),
});

const expenseRow = (line: ExpenseLine, names: NameIndex): FiscalRow => ({
  key: line.event_id,
  subject: displayName(names, line.account_id),
  kind: "Gasto de administración y depósito",
  date: formatDate(line.fiscal_date),
  amount_eur: line.amount_eur_rounded,
  criteria: sortCriteria(line.criteria),
});

const criteriaOf = (rows: readonly FiscalRow[]): readonly CriterionId[] =>
  sortCriteria(rows.flatMap((row) => row.criteria));

/** What a set of pending balances adds up to, with its sign. */
const sumOf = (pending: readonly { amount_eur: Money }[]): Money =>
  pending.reduce((total, entry) => total.add(entry.amount_eur), Money.zero("EUR"));

/** The whole year, ready to paint. */
export const yearView = (report: TaxYearReport, names: NameIndex): YearView => {
  const gains = report.capital_gains.lines.map((line) => transmissionRow(line, names));
  const movable = [
    ...report.movable_capital.transmissions.map((line) => transmissionRow(line, names)),
    ...report.movable_capital.dividends.map((line) => incomeRow(line, names)),
    ...report.movable_capital.interest.map((line) => incomeRow(line, names)),
    ...report.movable_capital.expenses.map((line) => expenseRow(line, names)),
  ].sort((left, right) => left.date.localeCompare(right.date));
  // What every operation of the year is called, by its event: the rows already
  // say "asset · date", which is the same thing a criterion has to say to tell
  // two of its entries apart.
  const subjectOf = new Map(
    [...gains, ...movable].map((row) => [row.key, `${row.subject} · ${row.date}`]),
  );
  const groups: FiscalGroup[] = [
    {
      key: "capital_gain",
      title: "Ganancias y pérdidas patrimoniales",
      total_eur: report.capital_gains.balance_eur,
      rows: gains,
      criteria: criteriaOf(gains),
      ...(report.capital_gains.foreign_releases_eur.isZero()
        ? {}
        : {
            note: "Incluye pérdidas que estaban aplazadas y se liberan este ejercicio en el apartado del que salieron.",
          }),
    },
    {
      key: "movable_capital",
      title: "Rendimientos del capital mobiliario",
      total_eur: report.movable_capital.balance_eur,
      rows: movable,
      criteria: criteriaOf(movable),
      ...(report.movable_capital.foreign_releases_eur.isZero()
        ? {}
        : {
            note: "Incluye pérdidas que estaban aplazadas y se liberan este ejercicio en el apartado del que salieron.",
          }),
    },
  ];
  const steps: OffsetStep[] = report.compensation.steps.map((step, index) => ({
    key: `${step.phase}:${index}`,
    text:
      step.from === step.against
        ? `Pérdidas de ${step.origin_year} contra las ganancias del mismo apartado`
        : step.from === "capital_gain"
          ? `Pérdidas patrimoniales de ${step.origin_year} contra los rendimientos`
          : `Rendimientos negativos de ${step.origin_year} contra las ganancias patrimoniales`,
    amount_eur: step.amount_eur,
    limited: step.limited,
  }));
  return {
    year: report.year,
    base_eur: report.base_eur,
    anchors: report.anchors.map((anchor) => ({
      key: String(anchor.year),
      year: anchor.year,
      computed_eur: sumOf(anchor.computed),
      declared_eur: sumOf(anchor.declared),
      before_ledger: anchor.before_ledger === true,
    })),
    groups,
    steps,
    limit_pct: report.compensation.limit_pct,
    pending: report.compensation.pending.map((loss) => pendingView(loss)),
    expired: report.compensation.expired.map((loss) => pendingView(loss)),
    // Only while the year is running: once it is closed, what expired is a
    // fact, and the table below says it in the past tense, which is what it is.
    expiring: [
      ...(report.year === Number(report.today.slice(0, 4))
        ? report.compensation.expired.map((loss) => expiryWarning(loss, "last"))
        : []),
      ...report.compensation.pending
        .filter((loss) => loss.expires_after === report.year + 1)
        .map((loss) => expiryWarning(loss, "next")),
    ],
    doubtful: report.doubtful.map((stake) => stakeView(stake, subjectOf)),
    settled: report.settled.map((stake) => stakeView(stake, subjectOf)),
    // A balance that **expired** this year counts: it is the year a loss stops
    // being usable, which is the one thing about it that hurts, and the screen
    // used to answer "No hay nada que declarar" precisely then.
    empty:
      gains.length === 0 &&
      movable.length === 0 &&
      report.compensation.pending.length === 0 &&
      report.compensation.expired.length === 0 &&
      report.base_eur.isZero(),
  };
};

/** Whether any figure of the year leans on a criterion whose reading is in dispute. */
export const hasDisputed = (criteria: readonly CriterionId[]): boolean =>
  criteria.some((id) => FISCAL_CRITERIA[id].certainty === "disputed");
