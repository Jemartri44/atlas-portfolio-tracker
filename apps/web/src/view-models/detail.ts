// An event, field by field, with legible names.
//
// It shows **every** field the line carries, in a sensible order, with amounts
// and quantities marked so `Amount` paints them and the privacy mode covers
// them. Nothing is hidden: the detail is where the user checks what was
// actually written (FR-040).

import { type LedgerEntry, Money, Quantity } from "@atlas/domain";
import { eventLabel, fieldLabel, STATUS_LABELS, valueLabel } from "../format/labels.js";
import { displayName, NAMED_ID_FIELDS, type NameIndex, NO_NAMES } from "../format/names.js";
import { FORM_SPECS } from "./forms/specs.js";

export type DetailKind = "amount" | "quantity" | "date" | "text" | "id" | "percent" | "json";

export interface DetailField {
  name: string;
  label: string;
  kind: DetailKind;
  /** Text for the plain kinds. */
  text?: string;
  /**
   * The raw value, when `text` is a resolved name. The detail screen is where
   * the ledger is checked, so the identifier stays visible — **next to** the
   * name and not instead of it (review of 2026-09-18).
   */
  hint?: string;
  /** Sensitive value, for the gated component. */
  amount?: Money;
  quantity?: Quantity;
  /** A link to another screen, when the field points at something. */
  link?: { to: string; label: string };
}

export interface DetailView {
  id: string;
  type: string;
  typeLabel: string;
  status: LedgerEntry["status"];
  statusLabel: string;
  /** Envelope: what the line says about itself. */
  envelope: DetailField[];
  /** The event's own fields. */
  fields: DetailField[];
  /** Cross references, as links. */
  links: { label: string; to: string; text: string }[];
  invalidReason?: string;
  /** Whether this type can be corrected, or only reversed: it has a form. */
  editable: boolean;
  /** When it cannot be corrected and there is something better to say, this says it. */
  editHint?: string;
}

const AMOUNT_FIELDS = new Set([
  "amount",
  "amount_eur",
  "gross",
  "unit_price",
  "unit_value",
  "fee",
  "withholding",
  "withholding_origin",
  "withholding_spain",
  "per_unit",
  "planned_size_eur",
  "sold_amount",
  "bought_amount",
  "nav_in",
  "nav_out",
]);

const QUANTITY_FIELDS = new Set(["quantity", "quantity_in", "quantity_out"]);

const DATE_FIELDS = new Set([
  "trade_date",
  "value_date",
  "value_date_in",
  "value_date_out",
  "date",
  "requested_date",
  "effective_date",
  "fx_rate_date",
]);

const ID_FIELDS = new Set([
  "id",
  "corrects_id",
  "reverses_id",
  "order_id",
  "request_id",
  "thesis_id",
  "account_id",
  "asset_id",
  "from_account_id",
  "from_asset_id",
  "to_account_id",
  "to_asset_id",
  "reference_etf_id",
  "fingerprint",
]);

const ENVELOPE_FIELDS = ["id", "type", "recorded_at", "schema_version", "fingerprint"];

/**
 * **The catalogue is updated, not rectified.** A change to an account or an
 * asset is an `account_updated`/`asset_updated` carrying the whole resulting
 * state (`docs/data-schema.md` §6.1), and reversing an entry that already has
 * operations behind it is refused by the domain anyway. So these four types are
 * subtracted below even though two of them do have a form: that form creates a
 * catalogue entry, it does not correct one.
 */
const CATALOGUE_TYPES = new Set([
  "account_created",
  "account_updated",
  "asset_created",
  "asset_updated",
]);

/** What to do instead, said where the user is looking for the button. */
const CATALOGUE_HINT =
  "El catálogo no se anula: se actualiza. El cambio se registra como una actualización con el estado completo resultante (esquema §6.1), y anular un alta que ya tiene operaciones detrás lo rechaza el libro. Desde la CLI: atlas account update o atlas asset update; su pantalla llega en la versión siguiente.";

/**
 * A type can be corrected when **a form exists for it** and it is not part of
 * the catalogue. The form specs are the single source, because that is what
 * `routes/movimientos/edit.tsx` builds the screen from: as a blacklist of its
 * own, this offered "Corregir" on seven types whose destination answered "este
 * tipo de evento no se corrige" — `interest`, `standalone_fee`, `fx_exchange`,
 * `transfer`, `order_updated`, `transfer_requested` and
 * `transfer_request_updated`, 14 of the 200 events of the golden ledger.
 */
const EDITABLE_TYPES = new Set(
  FORM_SPECS.map((spec) => spec.type).filter((type) => !CATALOGUE_TYPES.has(type)),
);

/** Which currency an amount field is in: the event's, or the one of its own pair. */
const currencyOf = (event: Record<string, unknown>, field: string): string => {
  if (field === "sold_amount") {
    return String(event.sold_currency ?? "EUR");
  }
  if (field === "bought_amount") {
    return String(event.bought_currency ?? "EUR");
  }
  if (field === "fee" && typeof event.fee_currency === "string") {
    return event.fee_currency;
  }
  if (field.endsWith("_eur") || field === "planned_size_eur") {
    return "EUR";
  }
  return String(event.currency ?? "EUR");
};

const fieldOf = (
  event: Record<string, unknown>,
  name: string,
  value: unknown,
  names: NameIndex,
): DetailField | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const label = fieldLabel(name);
  if (typeof value === "string" && AMOUNT_FIELDS.has(name)) {
    return { name, label, kind: "amount", amount: Money.parse(value, currencyOf(event, name)) };
  }
  if (typeof value === "string" && QUANTITY_FIELDS.has(name)) {
    return { name, label, kind: "quantity", quantity: Quantity.parse(value) };
  }
  if (typeof value === "string" && DATE_FIELDS.has(name)) {
    return { name, label, kind: "date", text: value };
  }
  if (typeof value === "string" && ID_FIELDS.has(name)) {
    if (!NAMED_ID_FIELDS.has(name)) {
      return { name, label, kind: "id", text: value };
    }
    const resolved = displayName(names, value);
    return resolved === value
      ? { name, label, kind: "id", text: value }
      : { name, label, kind: "id", text: resolved, hint: value };
  }
  if (name === "ter") {
    return { name, label, kind: "percent", text: String(value) };
  }
  if (typeof value === "object" && value !== null) {
    return { name, label, kind: "json", text: JSON.stringify(value, null, 2) };
  }
  if (typeof value === "boolean") {
    return { name, label, kind: "text", text: valueLabel(value) };
  }
  return { name, label, kind: "text", text: valueLabel(value) };
};

export const detailView = (entry: LedgerEntry, names: NameIndex = NO_NAMES): DetailView => {
  const event = entry.event as unknown as Record<string, unknown>;
  const envelope: DetailField[] = [];
  const fields: DetailField[] = [];
  for (const [name, value] of Object.entries(event)) {
    const field = fieldOf(event, name, value, names);
    if (field === undefined) {
      continue;
    }
    if (ENVELOPE_FIELDS.includes(name)) {
      envelope.push(field);
    } else {
      fields.push(field);
    }
  }
  const links: DetailView["links"] = [];
  if (entry.reversed_by !== undefined) {
    links.push({
      label: "Anulado por",
      to: `/movimientos/${entry.reversed_by}`,
      text: entry.reversed_by,
    });
  }
  if (entry.reverses_id !== undefined) {
    links.push({
      label: "Anula a",
      to: `/movimientos/${entry.reverses_id}`,
      text: entry.reverses_id,
    });
  }
  if (entry.corrects_id !== undefined) {
    links.push({
      label: "Corrige a",
      to: `/movimientos/${entry.corrects_id}`,
      text: entry.corrects_id,
    });
  }
  if (entry.corrected_by !== undefined) {
    links.push({
      label: "Corregido por",
      to: `/movimientos/${entry.corrected_by}`,
      text: entry.corrected_by,
    });
  }
  if (entry.order_id !== undefined) {
    links.push({
      label: "Orden",
      to: `/movimientos/${entry.order_id}`,
      text: entry.order_id,
    });
  }
  if (entry.request_id !== undefined) {
    links.push({
      label: "Solicitud de traspaso",
      to: `/movimientos/${entry.request_id}`,
      text: entry.request_id,
    });
  }
  return {
    id: entry.event.id,
    type: entry.event.type,
    typeLabel: eventLabel(entry.event.type),
    status: entry.status,
    statusLabel: STATUS_LABELS[entry.status] ?? entry.status,
    envelope,
    fields,
    links,
    ...(entry.invalid_reason === undefined ? {} : { invalidReason: entry.invalid_reason }),
    editable: EDITABLE_TYPES.has(entry.event.type) && entry.status !== "reversed",
    ...(CATALOGUE_TYPES.has(entry.event.type) ? { editHint: CATALOGUE_HINT } : {}),
  };
};
