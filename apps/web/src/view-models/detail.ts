// An event, field by field, with legible names.
//
// It shows **every** field the line carries, in a sensible order, with amounts
// and quantities marked so `Amount` paints them and the privacy mode covers
// them. Nothing is hidden: the detail is where the user checks what was
// actually written (FR-040).
//
// LINE BUDGET: four sets and one dispatch table that classify **every field of
// every event type** — which are amounts, which are quantities, which are
// dates, which are identifiers that resolve to a name. Splitting the sets from
// the twenty lines that use them would leave two files that only make sense
// read together, and the classification is the thing worth reviewing as a whole.

import { type Effect, type LedgerEntry, Money, Quantity, type Settings } from "@atlas/domain";
import { brokerSettlementOf } from "@atlas/domain/ecb";
import type { EventReferences } from "../format/events.js";
import {
  eventLabel,
  fieldLabel,
  platformLabel,
  STATUS_LABELS,
  valueLabel,
} from "../format/labels.js";
import {
  displayName,
  displayThesis,
  NAMED_ID_FIELDS,
  type NameIndex,
  NO_NAMES,
  unitsOf,
} from "../format/names.js";
import { formatExact } from "../format/number.js";
import { FORM_SPECS } from "./forms/specs.js";
import {
  effectSentences,
  recordedDecimals,
  type Sentence,
  type SettingRow,
  settingRows,
} from "./structured.js";

/**
 * `effects` and `settings` are told as sentences (`structured.ts`): the raw
 * JSON they used to be printed as is gone from the interface, and with it the
 * quantities and prices it showed with the privacy mode on.
 */
export type DetailKind =
  | "amount"
  | "quantity"
  | "date"
  | "text"
  | "id"
  | "percent"
  | "rate"
  | "effects"
  | "settings";

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
  /** The decimals it was recorded with, so the detail reads back what was written. */
  decimals?: number;
  quantity?: Quantity;
  /** What the quantity counts: "part.", "acc.", "uds.". */
  of?: string;
  /** The effects of a corporate action, one sentence each. */
  sentences?: Sentence[];
  /** The parameters of a configuration change, one row each. */
  rows?: SettingRow[];
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
  /** Its bookkeeping, still shown but in the technical record (`isBookkeeping`). */
  technical: DetailField[];
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
  "broker_settled_eur",
]);

const QUANTITY_FIELDS = new Set(["quantity", "quantity_in", "quantity_out"]);

/** ECB rates: public figures, shown exactly as recorded and in Spanish notation. */
const RATE_FIELDS = new Set(["fx_rate", "fx_rate_sold", "fx_rate_bought"]);

/** Fields that point at another **event**: named by its type and date, never by its id. */
const EVENT_ID_FIELDS = new Set(["corrects_id", "reverses_id", "order_id", "request_id"]);

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

const CURRENCY_FIELDS = ["currency", "fee_currency", "sold_currency", "bought_currency"];

/** The rate fields of an operation all in euros: a rate of 1 the ECB never published. */
const EURO_BOOKKEEPING = new Set(["currency", "fee_currency", "fx_rate", "fx_rate_date"]);

/**
 * What a reader does not need to understand the movement: where the line came
 * from, and on an operation all in euros its currency and a rate of 1 with its
 * date. «Tipo del BCE 1» and «Divisa EUR» among the data of a purchase in euros
 * read as something to check (review of 2026-09-19). Still printed, folded in
 * the technical record: the detail hides nothing.
 */
const isBookkeeping = (event: Record<string, unknown>, name: string): boolean =>
  name === "source" ||
  (EURO_BOOKKEEPING.has(name) &&
    CURRENCY_FIELDS.every((field) => event[field] === undefined || event[field] === "EUR"));

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
  "Las cuentas y los activos no se anulan: se actualizan, y cada cambio queda registrado con el estado completo resultante. Anular un alta que ya tiene operaciones detrás no se admite. De momento, el cambio se hace desde la CLI (atlas account update, atlas asset update).";

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

/** The units a quantity field counts: those of the asset it leaves or enters. */
const unitsFor = (event: Record<string, unknown>, name: string, names: NameIndex): string => {
  const asset =
    name === "quantity_out"
      ? (event.from_asset_id ?? event.asset_id)
      : name === "quantity_in"
        ? (event.to_asset_id ?? event.asset_id)
        : event.asset_id;
  return unitsOf(names, typeof asset === "string" ? asset : undefined);
};

interface Resolvers {
  names: NameIndex;
  /** Event identifier → "Compra del 03/09/2026". Without it, the identifier. */
  events?: EventReferences | undefined;
}

const fieldOf = (
  event: Record<string, unknown>,
  name: string,
  value: unknown,
  { names, events }: Resolvers,
): DetailField | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const label = fieldLabel(name);
  if (typeof value === "string" && AMOUNT_FIELDS.has(name)) {
    return {
      name,
      label,
      kind: "amount",
      amount: Money.parse(value, currencyOf(event, name)),
      decimals: recordedDecimals(value),
    };
  }
  if (typeof value === "string" && QUANTITY_FIELDS.has(name)) {
    return {
      name,
      label,
      kind: "quantity",
      quantity: Quantity.parse(value),
      of: unitsFor(event, name, names),
    };
  }
  if (typeof value === "string" && DATE_FIELDS.has(name)) {
    return { name, label, kind: "date", text: value };
  }
  if (typeof value === "string" && RATE_FIELDS.has(name)) {
    return { name, label, kind: "rate", text: formatExact(value) };
  }
  if (name === "effects" && Array.isArray(value)) {
    const sentences = effectSentences(value as Effect[], String(event.asset_id ?? ""), names);
    return { name, label, kind: "effects", sentences };
  }
  if (name === "settings" && typeof value === "object" && value !== null) {
    return { name, label, kind: "settings", rows: settingRows(value as Settings, names) };
  }
  if (typeof value === "string" && name === "thesis_id") {
    return { name, label, kind: "id", text: displayThesis(names, value), hint: value };
  }
  if (typeof value === "string" && EVENT_ID_FIELDS.has(name) && events !== undefined) {
    return { name, label, kind: "id", text: events(value), hint: value };
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
  if (name === "platform" && typeof value === "string") {
    return { name, label, kind: "text", text: platformLabel(value) };
  }
  if (typeof value === "object" && value !== null) {
    // A structure this version does not know: saying so beats dumping it, and
    // dumping it could print a figure the privacy mode is meant to cover.
    return { name, label, kind: "text", text: "Dato que esta versión no sabe mostrar." };
  }
  return { name, label, kind: "text", text: valueLabel(value) };
};

/**
 * The euros the broker moved, **beside** the same movement at the ECB rate the
 * line recorded (ADR-0030): two derived rows right after the broker's figure.
 * The domain puts them side by side (`brokerSettlementOf`); nothing here reads
 * the field by name, and no figure of the application uses it.
 */
const withBrokerComparison = (
  event: Record<string, unknown>,
  fields: DetailField[],
): DetailField[] => {
  const settlement = brokerSettlementOf(event);
  const at = fields.findIndex((field) => field.name === "broker_settled_eur");
  if (settlement === undefined || at < 0) {
    return fields;
  }
  const derived = (name: string, amount: Money): DetailField => ({
    name,
    label: fieldLabel(name),
    kind: "amount",
    amount,
    decimals: 2,
  });
  return [
    ...fields.slice(0, at + 1),
    derived("broker_settled_ecb_eur", settlement.ecb_eur),
    derived("broker_settled_difference_eur", settlement.difference_eur),
    ...fields.slice(at + 1),
  ];
};

/** The fields of an event with legible names, for the detail and for the correction screen. */
export const eventFields = (
  event: Record<string, unknown>,
  names: NameIndex = NO_NAMES,
  events?: EventReferences,
): { envelope: DetailField[]; fields: DetailField[]; technical: DetailField[] } => {
  const envelope: DetailField[] = [];
  const fields: DetailField[] = [];
  const technical: DetailField[] = [];
  for (const [name, value] of Object.entries(event)) {
    const field = fieldOf(event, name, value, { names, events });
    if (field === undefined) {
      continue;
    }
    if (ENVELOPE_FIELDS.includes(name)) {
      envelope.push(field);
    } else if (isBookkeeping(event, name)) {
      technical.push(field);
    } else {
      fields.push(field);
    }
  }
  return { envelope, fields: withBrokerComparison(event, fields), technical };
};

export const detailView = (
  entry: LedgerEntry,
  names: NameIndex = NO_NAMES,
  events?: EventReferences,
): DetailView => {
  const { envelope, fields, technical } = eventFields(
    entry.event as unknown as Record<string, unknown>,
    names,
    events,
  );
  // The link says what it leads to; the identifier stays in the technical block.
  const describe = (id: string): string => (events === undefined ? id : events(id));
  const links: DetailView["links"] = [];
  if (entry.reversed_by !== undefined) {
    links.push({
      label: "Anulado por",
      to: `/movimientos/${entry.reversed_by}`,
      text: describe(entry.reversed_by),
    });
  }
  if (entry.reverses_id !== undefined) {
    links.push({
      label: "Anula a",
      to: `/movimientos/${entry.reverses_id}`,
      text: describe(entry.reverses_id),
    });
  }
  if (entry.corrects_id !== undefined) {
    links.push({
      label: "Corrige a",
      to: `/movimientos/${entry.corrects_id}`,
      text: describe(entry.corrects_id),
    });
  }
  if (entry.corrected_by !== undefined) {
    links.push({
      label: "Corregido por",
      to: `/movimientos/${entry.corrected_by}`,
      text: describe(entry.corrected_by),
    });
  }
  if (entry.order_id !== undefined) {
    links.push({
      label: "Orden",
      to: `/movimientos/${entry.order_id}`,
      text: describe(entry.order_id),
    });
  }
  if (entry.request_id !== undefined) {
    links.push({
      label: "Solicitud de traspaso",
      to: `/movimientos/${entry.request_id}`,
      text: describe(entry.request_id),
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
    technical,
    links,
    ...(entry.invalid_reason === undefined ? {} : { invalidReason: entry.invalid_reason }),
    editable: EDITABLE_TYPES.has(entry.event.type) && entry.status !== "reversed",
    ...(CATALOGUE_TYPES.has(entry.event.type) ? { editHint: CATALOGUE_HINT } : {}),
  };
};
