// The one sentence a movement's detail starts with (docs/design/system.md
// §7.3): «Compraste 31,2343 participaciones de Money Market Fund por 3.100,00 €
// el 03/09/2026 · Fondos indexados».
//
// Told from the fields of the event as recorded, never computed: the amount is
// the one written, not a quantity times a price. Its figures are parts for
// `Amount`, so the privacy mode masks them inside the sentence and keeps their
// unit, as everywhere else (D2).

import { type LedgerEntry, Money, Quantity } from "@atlas/domain";
import { formatDate } from "../format/date.js";
import type { EventReferences } from "../format/events.js";
import { eventLabel, valueLabel } from "../format/labels.js";
import { displayName, displayThesis, type NameIndex, unitsOf } from "../format/names.js";
import type { Part, Sentence } from "./structured.js";

/** The units, said in full inside a sentence. */
const IN_FULL: Readonly<Record<string, string>> = {
  "part.": "participaciones",
  "acc.": "acciones",
  "uds.": "unidades",
};

const text = (value: string): Part => ({ text: value });

const money = (value: unknown, currency: unknown): Part | undefined =>
  typeof value === "string" && typeof currency === "string"
    ? { amount: Money.parse(value, currency) }
    : undefined;

const quantity = (value: unknown, units: string): Part | undefined =>
  typeof value === "string"
    ? { quantity: Quantity.parse(value), of: IN_FULL[units] ?? units }
    : undefined;

/** Words and figures in order; a missing figure drops the words that introduce it. */
const told = (...pieces: (Part | string | undefined | [string, Part | undefined])[]): Sentence =>
  pieces.flatMap((piece): Part[] => {
    if (piece === undefined) {
      return [];
    }
    if (typeof piece === "string") {
      return [text(piece)];
    }
    if (Array.isArray(piece)) {
      return piece[1] === undefined ? [] : [text(piece[0]), piece[1]];
    }
    return [piece];
  });

/**
 * For how much: the amount settled when it was recorded, or else the price of
 * each unit — whichever the event carries, never one computed from the other.
 */
const priceOf = (event: Record<string, unknown>): Sentence =>
  event.amount === undefined
    ? told(
        [" a ", money(event.unit_price, event.currency)],
        event.unit_price === undefined ? undefined : " cada una",
      )
    : told([" por ", money(event.amount, event.currency)]);

/** What the movement did, in the second person, as the user would say it. */
const what = (
  entry: LedgerEntry,
  names: NameIndex,
  events: EventReferences | undefined,
): Sentence | undefined => {
  const event = entry.event as Record<string, unknown>;
  const asset = entry.asset_id === undefined ? "" : displayName(names, entry.asset_id);
  const units = unitsOf(names, entry.asset_id);
  switch (entry.event.type) {
    case "buy":
    case "sell":
      return [
        ...told(
          entry.event.type === "buy" ? "Compraste " : "Vendiste ",
          quantity(event.quantity, units),
          ` de ${asset}`,
        ),
        ...priceOf(event),
      ];
    case "cash_deposit":
      return told("Ingresaste ", money(event.amount, event.currency));
    case "cash_withdrawal":
      return told("Retiraste ", money(event.amount, event.currency));
    case "dividend":
      return told(
        "Cobraste un dividendo bruto de ",
        money(event.gross, event.currency),
        ` de ${asset}`,
      );
    case "interest":
      return told("Cobraste unos intereses brutos de ", money(event.gross, event.currency));
    case "standalone_fee":
      return told("Pagaste una comisión de ", money(event.amount, event.currency));
    case "valuation":
      return told(`${asset} valía `, money(event.unit_value, event.currency), " por unidad");
    case "transfer": {
      const target = displayName(names, event.to_asset_id);
      return told(
        "Traspasaste ",
        quantity(event.quantity_out, unitsOf(names, event.from_asset_id as string)),
        ` de ${displayName(names, event.from_asset_id)} a ${target}`,
      );
    }
    case "order_placed":
      return told(
        event.side === "sell" ? "Diste una orden de venta de " : "Diste una orden de compra de ",
        asset,
        [" por ", money(event.amount, "EUR")],
        [" de ", event.amount === undefined ? quantity(event.quantity, units) : undefined],
      );
    case "fx_exchange":
      return told(
        "Cambiaste ",
        money(event.sold_amount, event.sold_currency),
        " por ",
        money(event.bought_amount, event.bought_currency),
      );
    case "corporate_action":
      return told(`${valueLabel(String(event.kind ?? ""))} de ${asset}`);
    case "thesis_opened":
      return told(`Abriste una tesis sobre ${asset}`);
    case "thesis_closed":
      return told(`Cerraste la tesis ${displayThesis(names, event.thesis_id)}`);
    case "account_created":
      return told(`Diste de alta la cuenta ${displayName(names, event.account_id)}`);
    case "asset_created":
      return told(`Diste de alta el activo ${asset}`);
    case "settings_changed":
      return told("Cambiaste la configuración");
    case "reversal":
      return typeof event.reverses_id === "string" && events !== undefined
        ? told(`Anulaste ${events(event.reverses_id)}`)
        : undefined;
    default:
      return undefined;
  }
};

/**
 * The sentence of a movement, or its type and what it is about when there is
 * no better way to say it: an unfamiliar event still opens with words, never
 * with an empty line.
 */
export const movementSentence = (
  entry: LedgerEntry,
  names: NameIndex,
  events?: EventReferences,
): Sentence => {
  const account = entry.account_id === undefined ? undefined : displayName(names, entry.account_id);
  const said = what(entry, names, events);
  if (said === undefined) {
    const about = entry.asset_id === undefined ? account : displayName(names, entry.asset_id);
    return told(`${eventLabel(entry.event.type)}${about === undefined ? "" : ` · ${about}`}`);
  }
  return [
    ...said,
    text(` el ${formatDate(entry.sort_date)}${account === undefined ? "" : ` · ${account}`}`),
  ];
};
