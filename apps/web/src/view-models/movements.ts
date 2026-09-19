// A line of the ledger as a row on screen.
//
// The order and the state come from the domain (`ledgerEntries`); this only
// chooses **which recorded figure is the main one** for each type and wraps it
// in `Money`/`Quantity` so `Amount` can paint it. Nothing is computed here: a
// quantity times a price would be arithmetic, and arithmetic belongs to the
// domain (decision (c)).

import { type LedgerEntry, Money, Quantity } from "@atlas/domain";
import type { EventReferences } from "../format/events.js";
import { eventLabel, STATUS_LABELS, valueLabel } from "../format/labels.js";
import { displayName, displayThesis, type NameIndex, NO_NAMES, unitsOf } from "../format/names.js";

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
  /** Second line of the table: asset, account and whatever identifies the event. */
  subtitle: string;
  /** First line of a row: the asset, else the account, else the type. */
  subject: string;
  /** Second line of a row: the type, the account when the subject is the asset, the rest. */
  context: string;
  /** Main recorded amount, as recorded; absent when the event has none. */
  amount?: Money;
  /** Main quantity, when the event is about units. */
  quantity?: Quantity;
  /** What the quantity counts: "part.", "acc.", "uds.". */
  units: string;
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
    case "swap":
      return { quantity: quantity(event.quantity_out), label: "cantidad entregada" };
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

interface Parts {
  asset?: string | undefined;
  account?: string | undefined;
  /** Whatever else identifies the event: the destination, the kind, the thesis. */
  extras: string[];
}

/**
 * What the event is about, without repeating the type.
 *
 * With names, not identifiers: "Beta Biotech · Cubo especulativo" is an
 * application and "ast_delta · acc_bucket" is a debug dump, and this line is
 * repeated on every row of the ledger (review of 2026-09-18). The thesis and
 * the reversed event have no name, so they are said by what they are: "tesis
 * sobre Alpha Robotics (abierta el 01/09/2026)", "anula Dividendo del
 * 12/03/2027" — never by their identifier.
 */
const partsOf = (
  entry: LedgerEntry,
  names: NameIndex,
  events: EventReferences | undefined,
): Parts => {
  const event = entry.event as Record<string, unknown>;
  const extras: string[] = [];
  if (entry.event.type === "transfer" || entry.event.type === "transfer_requested") {
    extras.push(`→ ${displayName(names, event.to_asset_id ?? event.to_account_id ?? "")}`);
  }
  if (entry.event.type === "corporate_action") {
    extras.push(valueLabel(event.kind ?? ""));
  }
  if (entry.event.type === "reversal" && typeof event.reverses_id === "string") {
    extras.push(
      events === undefined ? "anula un movimiento" : `anula ${events(event.reverses_id)}`,
    );
  }
  if (entry.event.type === "settings_changed") {
    extras.push("configuración completa");
  }
  if (entry.thesis_id !== undefined) {
    extras.push(`tesis ${displayThesis(names, entry.thesis_id)}`);
  }
  return {
    asset: entry.asset_id === undefined ? undefined : displayName(names, entry.asset_id),
    account: entry.account_id === undefined ? undefined : displayName(names, entry.account_id),
    extras: extras.filter((part) => part !== ""),
  };
};

const joined = (parts: readonly (string | undefined)[]): string =>
  parts.filter((part) => part !== undefined && part !== "").join(" · ");

/**
 * The two lines of a row (docs/design/system.md §5.3): what it is about — the
 * asset, else the account, else the type itself — and, under it, the type and
 * where.
 */
const linesOf = (parts: Parts, typeLabel: string): { subject: string; context: string } => {
  const subject = parts.asset ?? parts.account;
  if (subject === undefined) {
    return { subject: typeLabel, context: joined(parts.extras) };
  }
  return {
    subject,
    context: joined([
      typeLabel,
      parts.asset === undefined ? undefined : parts.account,
      ...parts.extras,
    ]),
  };
};

export const movementRow = (
  entry: LedgerEntry,
  names: NameIndex = NO_NAMES,
  events?: EventReferences,
): MovementRow => {
  const figure = figureOf(entry);
  const parts = partsOf(entry, names, events);
  const typeLabel = eventLabel(entry.event.type);
  return {
    id: entry.event.id,
    position: entry.position,
    type: entry.event.type,
    typeLabel,
    ...linesOf(parts, typeLabel),
    date: entry.sort_date,
    administrative: entry.business_date === undefined,
    status: entry.status,
    statusLabel: STATUS_LABELS[entry.status] ?? entry.status,
    subtitle: joined([parts.asset, parts.account, ...parts.extras]),
    ...(figure.amount === undefined ? {} : { amount: figure.amount }),
    ...(figure.quantity === undefined ? {} : { quantity: figure.quantity }),
    units: unitsOf(names, entry.asset_id),
    ...(figure.label === undefined ? {} : { figureLabel: figure.label }),
    ...(entry.invalid_reason === undefined ? {} : { invalidReason: entry.invalid_reason }),
  };
};

export const movementRows = (
  entries: readonly LedgerEntry[],
  names: NameIndex = NO_NAMES,
  events?: EventReferences,
): MovementRow[] => entries.map((entry) => movementRow(entry, names, events));

/** Page size of the progressive load: twenty years of ledger never paint at once. */
export const PAGE_SIZE = 20;
