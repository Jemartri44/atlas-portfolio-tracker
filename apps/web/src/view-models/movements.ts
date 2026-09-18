// A line of the ledger as a row on screen.
//
// The order and the state come from the domain (`ledgerEntries`); this only
// chooses **which recorded figure is the main one** for each type and wraps it
// in `Money`/`Quantity` so `Amount` can paint it. Nothing is computed here: a
// quantity times a price would be arithmetic, and arithmetic belongs to the
// domain (decision (c)).

import { type LedgerEntry, Money, Quantity } from "@atlas/domain";
import { eventLabel, STATUS_LABELS } from "../format/labels.js";

export interface MovementRow {
  id: string;
  position: number;
  type: string;
  typeLabel: string;
  /** The date the row shows: business date when it has one (data-schema.md §7.1). */
  date: string;
  /** True when the date is administrative, so the row can say so. */
  administrative: boolean;
  status: LedgerEntry["status"];
  statusLabel: string;
  /** Second line: account, asset and whatever identifies the event. */
  subtitle: string;
  /** Main recorded amount, as recorded; absent when the event has none. */
  amount?: Money;
  /** Main quantity, when the event is about units. */
  quantity?: Quantity;
  /** What the figure means, for the accessible label of the row. */
  figureLabel?: string;
  invalidReason?: string;
}

const money = (value: unknown, currency: unknown): Money | undefined =>
  typeof value === "string" && typeof currency === "string"
    ? Money.parse(value, currency)
    : undefined;

const quantity = (value: unknown): Quantity | undefined =>
  typeof value === "string" ? Quantity.parse(value) : undefined;

interface Figure {
  amount?: Money | undefined;
  quantity?: Quantity | undefined;
  label?: string | undefined;
}

/**
 * The figure that answers "how much?" for each type, **always a field of the
 * event**, never a product of two of them.
 */
const figureOf = (entry: LedgerEntry): Figure => {
  const event = entry.event as Record<string, unknown>;
  switch (entry.event.type) {
    case "buy":
    case "sell": {
      const amount = money(event.amount, event.currency);
      return amount === undefined
        ? { quantity: quantity(event.quantity), label: "cantidad" }
        : { amount, label: "importe liquidado" };
    }
    case "cash_deposit":
    case "cash_withdrawal":
    case "standalone_fee":
      return { amount: money(event.amount, event.currency), label: "importe" };
    case "dividend":
    case "interest":
      return { amount: money(event.gross, event.currency), label: "importe bruto" };
    case "fx_exchange":
      return { amount: money(event.sold_amount, event.sold_currency), label: "importe vendido" };
    case "valuation":
      return { amount: money(event.unit_value, event.currency), label: "valor unitario" };
    case "transfer":
      return { quantity: quantity(event.quantity_out), label: "cantidad traspasada" };
    case "order_placed": {
      const amount = money(event.amount, "EUR");
      return amount === undefined
        ? { quantity: quantity(event.quantity), label: "cantidad pedida" }
        : { amount, label: "importe pedido" };
    }
    case "transfer_requested":
      return event.quantity_out === undefined
        ? { amount: money(event.amount_eur, "EUR"), label: "importe solicitado" }
        : { quantity: quantity(event.quantity_out), label: "cantidad solicitada" };
    case "thesis_opened":
      return { amount: money(event.planned_size_eur, "EUR"), label: "tamaño previsto" };
    default:
      return {};
  }
};

/** Second line: what the event is about, without repeating the type. */
const subtitleOf = (entry: LedgerEntry): string => {
  const event = entry.event as Record<string, unknown>;
  const parts: string[] = [];
  if (entry.asset_id !== undefined) {
    parts.push(entry.asset_id);
  }
  if (entry.account_id !== undefined) {
    parts.push(entry.account_id);
  }
  if (entry.event.type === "transfer" || entry.event.type === "transfer_requested") {
    parts.push(`→ ${String(event.to_asset_id ?? event.to_account_id ?? "")}`);
  }
  if (entry.event.type === "corporate_action") {
    parts.push(String(event.kind ?? ""));
  }
  if (entry.event.type === "reversal") {
    parts.push(`anula ${String(event.reverses_id ?? "")}`);
  }
  if (entry.event.type === "settings_changed") {
    parts.push("configuración completa");
  }
  if (entry.thesis_id !== undefined) {
    parts.push(`tesis ${entry.thesis_id}`);
  }
  return parts.filter((part) => part !== "").join(" · ");
};

export const movementRow = (entry: LedgerEntry): MovementRow => {
  const figure = figureOf(entry);
  return {
    id: entry.event.id,
    position: entry.position,
    type: entry.event.type,
    typeLabel: eventLabel(entry.event.type),
    date: entry.sort_date,
    administrative: entry.business_date === undefined,
    status: entry.status,
    statusLabel: STATUS_LABELS[entry.status] ?? entry.status,
    subtitle: subtitleOf(entry),
    ...(figure.amount === undefined ? {} : { amount: figure.amount }),
    ...(figure.quantity === undefined ? {} : { quantity: figure.quantity }),
    ...(figure.label === undefined ? {} : { figureLabel: figure.label }),
    ...(entry.invalid_reason === undefined ? {} : { invalidReason: entry.invalid_reason }),
  };
};

export const movementRows = (entries: readonly LedgerEntry[]): MovementRow[] =>
  entries.map(movementRow);

/** Page size of the progressive load: twenty years of ledger never paint at once. */
export const PAGE_SIZE = 20;
