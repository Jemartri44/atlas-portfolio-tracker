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

import type { Money } from "@atlas/domain";
import type {
  CriterionId,
  CriterionStake,
  ExpenseLine,
  IncomeLine,
  PendingLoss,
  TaxYearReport,
  TransmissionLine,
} from "@atlas/domain/fiscal";
import { FISCAL_CRITERIA, sortCriteria } from "@atlas/domain/fiscal";
import { formatDate } from "../../format/date.js";
import type { NameIndex } from "../../format/names.js";
import { displayName } from "../../format/names.js";

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

/** A criterion with what its other reading would move, for either of the two lists. */
export interface StakeView {
  criterion: CriterionId;
  certainty: CriterionStake["certainty"];
  measure: CriterionStake["measure"];
  /** The amount, when there is one: a difference on the base or the exposure. */
  amount_eur?: Money;
  /** The other two differences, when the alternative reading moves them. */
  pending_eur?: Money;
  deferred_eur?: Money;
  direction: CriterionStake["direction"];
  reason?: CriterionStake["reason"];
  operations: number;
  markets?: readonly string[];
}

export interface PendingView {
  key: string;
  origin_year: number;
  category: PendingLoss["category"];
  amount_eur: Money;
  expires_after: number;
  /** It is the last year it can be offset in: the screen says so. */
  expiring: boolean;
}

export interface YearView {
  year: number;
  base_eur: Money;
  groups: FiscalGroup[];
  steps: OffsetStep[];
  limit_pct: string;
  pending: PendingView[];
  expired: PendingView[];
  doubtful: StakeView[];
  settled: StakeView[];
  /** Nothing happened this year: no operation of any kind and no balance. */
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

const stakeView = (stake: CriterionStake): StakeView => ({
  criterion: stake.criterion,
  certainty: stake.certainty,
  measure: stake.measure,
  ...(stake.base_difference_eur === undefined
    ? stake.exposure_eur === undefined
      ? {}
      : { amount_eur: stake.exposure_eur }
    : { amount_eur: stake.base_difference_eur }),
  ...(stake.pending_difference_eur === undefined
    ? {}
    : { pending_eur: stake.pending_difference_eur }),
  ...(stake.deferred_difference_eur === undefined
    ? {}
    : { deferred_eur: stake.deferred_difference_eur }),
  direction: stake.direction,
  ...(stake.reason === undefined ? {} : { reason: stake.reason }),
  operations: stake.event_ids.length,
  ...(stake.markets === undefined ? {} : { markets: stake.markets }),
});

const pendingView = (loss: PendingLoss, year: number): PendingView => ({
  key: `${loss.origin_year}:${loss.category}`,
  origin_year: loss.origin_year,
  category: loss.category,
  amount_eur: loss.amount_eur,
  expires_after: loss.expires_after,
  expiring: loss.expires_after === year,
});

/** The whole year, ready to paint. */
export const yearView = (report: TaxYearReport, names: NameIndex): YearView => {
  const gains = report.capital_gains.lines.map((line) => transmissionRow(line, names));
  const movable = [
    ...report.movable_capital.transmissions.map((line) => transmissionRow(line, names)),
    ...report.movable_capital.dividends.map((line) => incomeRow(line, names)),
    ...report.movable_capital.interest.map((line) => incomeRow(line, names)),
    ...report.movable_capital.expenses.map((line) => expenseRow(line, names)),
  ].sort((left, right) => left.date.localeCompare(right.date));
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
    groups,
    steps,
    limit_pct: report.compensation.limit_pct,
    pending: report.compensation.pending.map((loss) => pendingView(loss, report.year)),
    expired: report.compensation.expired.map((loss) => pendingView(loss, report.year)),
    doubtful: report.doubtful.map(stakeView),
    settled: report.settled.map(stakeView),
    empty:
      gains.length === 0 &&
      movable.length === 0 &&
      report.compensation.pending.length === 0 &&
      report.base_eur.isZero(),
  };
};

/** Whether any figure of the year leans on a criterion whose reading is in dispute. */
export const hasDisputed = (criteria: readonly CriterionId[]): boolean =>
  criteria.some((id) => FISCAL_CRITERIA[id].certainty === "disputed");
