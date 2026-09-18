// What the portfolio costs, as rows.
//
// Three blocks that never share a total: the core per asset, the bucket per
// account (constitution III) and — new in feature 007 — the **standalone
// charges**, which are not part of any fiscal basis and which no screen of
// either interface used to show at all (`docs/business-rules.md` §5.2, Q9).

import type { CostSummary, Money } from "@atlas/domain";
import { valueLabel } from "../../format/labels.js";
import { displayName, type NameIndex, NO_NAMES } from "../../format/names.js";

export interface CoreCostRowView {
  assetId: string;
  name: string;
  assetClass: string;
  fees: Money;
  invested: Money;
  feesPct?: string;
  ter?: string;
  value?: Money;
  annualCost?: Money;
}

export interface StandaloneRowView {
  accountId: string;
  name: string;
  book: string;
  fees: Money;
}

export interface CostsView {
  date: string;
  core: {
    rows: CoreCostRowView[];
    fees: Money;
    invested: Money;
    value: Money;
    weightedTer?: string;
    annualCost?: Money;
    partial: boolean;
  };
  bucket: {
    rows: { accountId: string; name: string; fees: Money; invested: Money }[];
    fees: Money;
  };
  standalone: { rows: StandaloneRowView[]; core: Money; bucket: Money };
}

export const costsView = (summary: CostSummary, names: NameIndex = NO_NAMES): CostsView => ({
  date: summary.date,
  core: {
    rows: summary.core.rows.map((row) => ({
      assetId: row.asset_id,
      name: displayName(names, row.asset_id),
      assetClass: valueLabel(row.asset_class),
      fees: row.fees_eur,
      invested: row.invested_eur,
      ...(row.fees_pct === undefined ? {} : { feesPct: row.fees_pct.toString() }),
      ...(row.ter === undefined ? {} : { ter: row.ter.toString() }),
      ...(row.value_eur === undefined ? {} : { value: row.value_eur }),
      ...(row.annual_cost_eur === undefined ? {} : { annualCost: row.annual_cost_eur }),
    })),
    fees: summary.core.totals.fees_eur,
    invested: summary.core.totals.invested_eur,
    value: summary.core.totals.value_eur,
    ...(summary.core.totals.weighted_ter === undefined
      ? {}
      : { weightedTer: summary.core.totals.weighted_ter.toString() }),
    ...(summary.core.totals.annual_cost_eur === undefined
      ? {}
      : { annualCost: summary.core.totals.annual_cost_eur }),
    partial: summary.core.totals.partial,
  },
  bucket: {
    rows: summary.bucket.rows.map((row) => ({
      accountId: row.account_id,
      name: displayName(names, row.account_id),
      fees: row.fees_eur,
      invested: row.invested_eur,
    })),
    fees: summary.bucket.totals.fees_eur,
  },
  standalone: {
    rows: summary.standalone.rows.map((row) => ({
      accountId: row.account_id,
      name: displayName(names, row.account_id),
      book: valueLabel(row.book),
      fees: row.fees_eur,
    })),
    core: summary.standalone.core_eur,
    bucket: summary.standalone.bucket_eur,
  },
});
