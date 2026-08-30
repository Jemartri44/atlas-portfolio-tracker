// Canonical snapshot of a projected state (data-schema.md §7, feature 003): a
// plain JSON object with recursively sorted keys, decimals as strings and
// nothing that depends on the moment of execution or on file positions. It is
// the single definition of "the same projection" used by golden files,
// `compact` and `check --deep`.

import type { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import type {
  FiscalLot,
  GainByLot,
  InvalidEvent,
  InvestmentIncome,
  LedgerState,
  RealizedGain,
  Thesis,
  Warning,
} from "./state.js";

export type Snapshot = Record<string, unknown>;

const text = (value: Money | Quantity): string =>
  "currency" in value ? value.amount.toString() : value.toString();

/** Copies a JSON-like value with object keys sorted recursively; `undefined` members are dropped. */
export const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) {
        sorted[key] = sortKeysDeep(record[key]);
      }
    }
    return sorted;
  }
  return value;
};

const lotOf = (lot: FiscalLot) => ({
  id: lot.id,
  asset_id: lot.asset_id,
  acquisition_date: lot.acquisition_date,
  original_quantity: text(lot.original_quantity),
  quantity: text(lot.quantity),
  cost_eur: text(lot.cost_eur),
  original_cost_eur: text(lot.original_cost_eur),
  source_event_id: lot.source_event_id,
  source_lot_id: lot.source_lot_id,
  closed: lot.closed,
  consumptions: lot.consumptions.map((c) => ({
    event_id: c.event_id,
    quantity: text(c.quantity),
    cost_eur: text(c.cost_eur),
  })),
});

const gainByLotOf = (entry: GainByLot) => ({
  lot_id: entry.lot_id,
  quantity: text(entry.quantity),
  proceeds_eur: text(entry.proceeds_eur),
  cost_eur: text(entry.cost_eur),
  gain_eur: text(entry.gain_eur),
});

const gainOf = (gain: RealizedGain) => ({
  event_id: gain.event_id,
  asset_id: gain.asset_id,
  account_id: gain.account_id,
  fiscal_date: gain.fiscal_date,
  year: gain.year,
  quantity: text(gain.quantity),
  proceeds_eur: text(gain.proceeds_eur),
  cost_eur: text(gain.cost_eur),
  gain_eur: text(gain.gain_eur),
  gain_eur_rounded: text(gain.gain_eur_rounded),
  by_lot: gain.by_lot.map(gainByLotOf),
});

const incomeOf = (income: InvestmentIncome) => ({
  event_id: income.event_id,
  kind: income.kind,
  account_id: income.account_id,
  asset_id: income.asset_id,
  fiscal_date: income.fiscal_date,
  year: income.year,
  currency: income.gross.currency,
  gross: text(income.gross),
  withholding_origin: text(income.withholding_origin),
  withholding_spain: text(income.withholding_spain),
  net: text(income.net),
  gross_eur: text(income.gross_eur),
  withholding_origin_eur: text(income.withholding_origin_eur),
  withholding_spain_eur: text(income.withholding_spain_eur),
  net_eur: text(income.net_eur),
});

const thesisOf = (thesis: Thesis) => ({
  thesis_id: thesis.thesis_id,
  account_id: thesis.account_id,
  asset_id: thesis.asset_id,
  hypothesis: thesis.hypothesis,
  expected_horizon_days: thesis.expected_horizon_days,
  invalidation: thesis.invalidation,
  planned_size_eur: text(thesis.planned_size_eur),
  status: thesis.status,
  opened_event_id: thesis.opened_event_id,
  opened_at: thesis.opened_at,
  closed_event_id: thesis.closed_event_id,
  closed_at: thesis.closed_at,
  closing_notes: thesis.closing_notes,
  buys: thesis.buys,
  sells: thesis.sells,
  quantity_bought: text(thesis.quantity_bought),
  quantity_sold: text(thesis.quantity_sold),
  invested_eur: text(thesis.invested_eur),
  fees_eur: text(thesis.fees_eur),
  result_eur: text(thesis.result_eur),
  result_eur_rounded: text(thesis.result_eur.roundToCents()),
});

/** Messages are wording, not projection: a rephrasing must not change the snapshot. */
const warningOf = (warning: Warning) => ({
  code: warning.code,
  event_id: warning.event_id,
  details: warning.details,
});

const invalidOf = (entry: InvalidEvent) => ({
  event_id: entry.event.id,
  type: entry.event.type,
  code: entry.error.code,
});

/** Sorts map values by their unique id (no two entries share one, so no tie). */
const byId = <T>(entries: Iterable<T>, id: (entry: T) => string): T[] =>
  [...entries].sort((a, b) => (id(a) < id(b) ? -1 : 1));

const split = (key: string): [string, string] => key.split("|") as [string, string];

export const snapshotOf = (state: LedgerState): Snapshot => {
  const lots: Record<string, unknown> = {};
  for (const [assetId, entry] of state.lots) {
    lots[assetId] = { open: entry.open.map(lotOf), closed: entry.closed.map(lotOf) };
  }
  const positions = [...state.positions]
    .filter(([, quantity]) => !quantity.isZero())
    .map(([key, quantity]) => {
      const [account_id, asset_id] = split(key);
      return { account_id, asset_id, quantity: text(quantity) };
    });
  const cash = [...state.cash]
    .filter(([, balance]) => !balance.isZero())
    .map(([key, balance]) => {
      const [account_id, currency] = split(key);
      return { account_id, currency, balance: text(balance) };
    });
  return sortKeysDeep({
    accounts: byId(state.accounts.values(), (account) => account.account_id),
    assets: byId(state.assets.values(), (asset) => asset.asset_id),
    settings_history: state.settingsHistory,
    fiscal_settings: state.fiscalSettings,
    positions,
    cash,
    lots,
    gains: state.gains.map(gainOf),
    income: state.income.map(incomeOf),
    valuations: state.valuations.map((event) => ({
      event_id: event.id,
      account_id: event.account_id,
      asset_id: event.asset_id,
      date: event.date,
      quantity: event.quantity,
      unit_value: event.unit_value,
      currency: event.currency,
      fx_rate: event.fx_rate,
      source: event.source,
    })),
    orders: [...state.orders.values()],
    transfer_requests: [...state.transferRequests.values()],
    theses: [...state.theses.values()].map(thesisOf),
    warnings: state.warnings.map(warningOf),
    invalid: state.invalid.map(invalidOf),
  }) as Snapshot;
};

/** Top-level keys whose serialised value differs between two snapshots. */
export const snapshotDiff = (a: Snapshot, b: Snapshot): string[] =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .sort()
    .filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
