// The theses against the index (rule 16), as rows.
//
// **The result against the index is consumed, never recomputed.** Its latent
// term is the *latent gain* (value minus cost), not the value of the position;
// getting that wrong once made a thesis that matched the index exactly show a
// difference equal to everything invested. `bucketTheses` owns the definition
// and has the tests.

import type { BucketThesisView, Money, Warning } from "@atlas/domain";
import { formatDate } from "../../format/date.js";
import { displayName, type NameIndex, NO_NAMES } from "../../format/names.js";

export interface ThesisRow {
  thesisId: string;
  /**
   * How the thesis is named on screen: when it was opened and, if it is closed,
   * when it was closed. A thesis has no name, and its key ("th_alpha") is the
   * ledger's, not the user's.
   */
  period: string;
  assetName: string;
  accountName: string;
  open: boolean;
  status: string;
  openedAt: string;
  closedAt?: string;
  daysOpen: number;
  horizonDays: number;
  horizonExceeded: boolean;
  invested: Money;
  result: Money;
  unrealized?: Money;
  benchmarkEquivalent?: Money;
  vsIndex?: Money;
  /** Why there is no comparison, in the thesis's own words. */
  gap?: string;
}

export interface ThesesView {
  rows: ThesisRow[];
  /** Theses that could not be compared with the index at all. */
  withoutIndex: number;
  warnings: readonly Warning[];
}

const GAPS: Record<string, string> = {
  no_benchmark: "no hay índice de referencia configurado",
  unknown_asset: "el índice configurado no está en el catálogo",
  no_price: "falta el precio del índice en alguna de las fechas",
  no_linked_buys: "la tesis no tiene ninguna compra enlazada: un sumatorio vacío no es cero",
  no_asset_price: "falta el precio del propio activo",
};

const gapOf = (thesis: BucketThesisView): string | undefined => {
  const first = thesis.missing_benchmark[0];
  return first === undefined ? undefined : (GAPS[first.reason] ?? first.reason);
};

export const thesesView = (
  view: { rows: readonly BucketThesisView[]; warnings: readonly Warning[] },
  names: NameIndex = NO_NAMES,
): ThesesView => ({
  rows: view.rows.map((thesis) => ({
    thesisId: thesis.thesis_id,
    period:
      thesis.closed_at === undefined
        ? `abierta el ${formatDate(thesis.opened_at)}`
        : `del ${formatDate(thesis.opened_at)} al ${formatDate(thesis.closed_at)}`,
    assetName: displayName(names, thesis.asset_id),
    accountName: displayName(names, thesis.account_id),
    open: thesis.status === "open",
    status: thesis.status === "open" ? "abierta" : "cerrada",
    openedAt: thesis.opened_at,
    ...(thesis.closed_at === undefined ? {} : { closedAt: thesis.closed_at }),
    daysOpen: thesis.days_open,
    horizonDays: thesis.expected_horizon_days,
    horizonExceeded: thesis.days_open > thesis.expected_horizon_days,
    invested: thesis.invested_eur,
    result: thesis.result_eur_rounded,
    ...(thesis.unrealized_eur === undefined ? {} : { unrealized: thesis.unrealized_eur }),
    ...(thesis.benchmark_equivalent_eur === undefined
      ? {}
      : { benchmarkEquivalent: thesis.benchmark_equivalent_eur }),
    ...(thesis.result_vs_index_eur === undefined ? {} : { vsIndex: thesis.result_vs_index_eur }),
    ...(gapOf(thesis) === undefined ? {} : { gap: gapOf(thesis) as string }),
  })),
  withoutIndex: view.rows.filter((thesis) => thesis.result_vs_index_eur === undefined).length,
  warnings: view.warnings,
});
