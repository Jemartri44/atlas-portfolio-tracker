// The one sentence a movement's detail starts with (docs/design/system.md
// §7.3): «Compraste 31,2343 participaciones de Money Market Fund por 3.100,00 €
// el 03/09/2026 · Fondos indexados».
//
// Told from the fields of the event as recorded, never computed: the amount is
// the one written, not a quantity times a price. Its figures are parts for
// `Amount`, so the privacy mode masks them inside the sentence and keeps their
// unit, as everywhere else (D2).
//
// The same switch tells what is about to be recorded, over the effect of a
// form: «Vas a registrar la compra de…».
//
// LINE BUDGET: one switch over every event type, in its two voices. Split into
// two files, each voice would repeat which figures a type carries and in what
// order, and the two would drift apart.

import { type LedgerEntry, Money, Quantity } from "@atlas/domain";
import { formatDate } from "../format/date.js";
import type { EventReferences } from "../format/events.js";
import { eventLabel, valueLabel } from "../format/labels.js";
import { displayName, displayThesis, type NameIndex, unitsOf } from "../format/names.js";
import type { Part, Sentence } from "./structured.js";

/** The units, said in full inside a sentence; the second one for exactly one. */
const IN_FULL: Readonly<Record<string, readonly [string, string]>> = {
  "part.": ["participaciones", "participación"],
  "acc.": ["acciones", "acción"],
  "uds.": ["unidades", "unidad"],
};

const text = (value: string): Part => ({ text: value });

/** A figure of the event, carrying the field it comes from so a form can reveal what was typed. */
const money = (value: unknown, currency: unknown, field?: string): Part | undefined =>
  typeof value === "string" && typeof currency === "string"
    ? { amount: Money.parse(value, currency), ...(field === undefined ? {} : { field }) }
    : undefined;

const quantity = (value: unknown, units: string, field?: string): Part | undefined =>
  typeof value === "string"
    ? {
        quantity: Quantity.parse(value),
        of: IN_FULL[units]?.[0] ?? units,
        one: IN_FULL[units]?.[1] ?? units,
        ...(field === undefined ? {} : { field }),
      }
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
        [" a ", money(event.unit_price, event.currency, "unit_price")],
        event.unit_price === undefined ? undefined : " cada una",
      )
    : told([" por ", money(event.amount, event.currency, "amount")]);

/**
 * The two ways of telling a movement: what the user did, in the detail
 * («Compraste…»), and what is about to be recorded, over its effect («la
 * compra de…», after «Vas a registrar»).
 */
type Voice = "done" | "draft";

const say = (voice: Voice, done: string, draft: string): string =>
  voice === "done" ? done : draft;

interface Subject {
  event: Record<string, unknown>;
  type: string;
  asset_id?: string | undefined;
}

/** What the movement did or is about to do, as the user would say it. */
const what = (
  subject: Subject,
  names: NameIndex,
  events: EventReferences | undefined,
  voice: Voice,
): Sentence | undefined => {
  const { event } = subject;
  const asset = subject.asset_id === undefined ? "" : displayName(names, subject.asset_id);
  const units = unitsOf(names, subject.asset_id);
  const v = (done: string, draft: string): string => say(voice, done, draft);
  switch (subject.type) {
    case "buy":
    case "sell":
      return [
        ...told(
          subject.type === "buy"
            ? v("Compraste ", "la compra de ")
            : v("Vendiste ", "la venta de "),
          quantity(event.quantity, units, "quantity"),
          ` de ${asset}`,
        ),
        ...priceOf(event),
      ];
    case "cash_deposit":
      return told(
        v("Ingresaste ", "un ingreso de "),
        money(event.amount, event.currency, "amount"),
      );
    case "cash_withdrawal":
      return told(
        v("Retiraste ", "una retirada de "),
        money(event.amount, event.currency, "amount"),
      );
    case "dividend":
      return told(
        v("Cobraste un dividendo bruto de ", "un dividendo bruto de "),
        money(event.gross, event.currency, "gross"),
        ` de ${asset}`,
      );
    case "interest":
      return told(
        v("Cobraste unos intereses brutos de ", "unos intereses brutos de "),
        money(event.gross, event.currency, "gross"),
      );
    case "standalone_fee":
      return told(
        v("Pagaste una comisión de ", "una comisión de "),
        money(event.amount, event.currency, "amount"),
      );
    case "valuation":
      return told(
        v(`${asset} valía `, `que ${asset} valía `),
        money(event.unit_value, event.currency, "unit_value"),
        " por unidad",
      );
    case "transfer": {
      const target = displayName(names, event.to_asset_id);
      return told(
        v("Traspasaste ", "el traspaso de "),
        quantity(event.quantity_out, unitsOf(names, event.from_asset_id as string), "quantity_out"),
        ` de ${displayName(names, event.from_asset_id)} a ${target}`,
      );
    }
    case "order_placed":
      return told(
        event.side === "sell"
          ? v("Diste una orden de venta de ", "una orden de venta de ")
          : v("Diste una orden de compra de ", "una orden de compra de "),
        asset,
        [" por ", money(event.amount, "EUR", "amount")],
        [
          " de ",
          event.amount === undefined ? quantity(event.quantity, units, "quantity") : undefined,
        ],
      );
    case "fx_exchange":
      return told(
        v("Cambiaste ", "el cambio de "),
        money(event.sold_amount, event.sold_currency, "sold_amount"),
        " por ",
        money(event.bought_amount, event.bought_currency, "bought_amount"),
      );
    case "corporate_action": {
      const kind = valueLabel(String(event.kind ?? ""));
      return told(`${voice === "done" ? kind : kind.toLowerCase()} de ${asset}`);
    }
    case "thesis_opened":
      return told(v(`Abriste una tesis sobre ${asset}`, `una tesis sobre ${asset}`));
    case "thesis_closed":
      return told(
        v("Cerraste la tesis ", "el cierre de la tesis ") + displayThesis(names, event.thesis_id),
      );
    case "account_created":
      return told(
        v("Diste de alta la cuenta ", "el alta de la cuenta ") +
          displayName(names, event.account_id),
      );
    case "asset_created":
      return told(v(`Diste de alta el activo ${asset}`, `el alta del activo ${asset}`));
    case "settings_changed":
      return told(v("Cambiaste la configuración", "un cambio de la configuración"));
    case "reversal":
      return typeof event.reverses_id === "string" && events !== undefined
        ? told(v("Anulaste ", "la anulación de ") + events(event.reverses_id))
        : undefined;
    default:
      return undefined;
  }
};

const closing = (date: string, account: string | undefined): Part =>
  text(` el ${formatDate(date)}${account === undefined ? "" : ` · ${account}`}`);

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
  const subject = {
    event: entry.event as Record<string, unknown>,
    type: entry.event.type,
    asset_id: entry.asset_id,
  };
  const said = what(subject, names, events, "done");
  if (said === undefined) {
    const about = entry.asset_id === undefined ? account : displayName(names, entry.asset_id);
    return told(`${eventLabel(entry.event.type)}${about === undefined ? "" : ` · ${about}`}`);
  }
  return [...said, closing(entry.sort_date, account)];
};

/** The date the user gave the operation, in the order a form asks for them. */
const DATE_FIELDS = ["trade_date", "date", "value_date", "requested_date", "effective_date"];

/**
 * What is about to be recorded, over its effect: «Vas a registrar la compra de
 * 2,5 participaciones de World Index Fund por 300,00 € el 19/09/2026 ·
 * MyInvestor». Told from the event the form built, before it exists, so the
 * figures are the ones just typed; each carries its field, for the form to
 * reveal what the user typed (review of 2026-09-19).
 */
export const draftSentence = (
  candidate: { type: string } & object,
  names: NameIndex,
  events?: EventReferences,
): Sentence => {
  const event = candidate as Record<string, unknown>;
  const asset = event.asset_id ?? event.from_asset_id;
  const accountId = event.account_id ?? event.from_account_id;
  const account = typeof accountId === "string" ? displayName(names, accountId) : undefined;
  const subject = {
    event,
    type: candidate.type,
    asset_id: typeof asset === "string" ? asset : undefined,
  };
  const said = what(subject, names, events, "draft") ?? [
    text(eventLabel(candidate.type).toLowerCase()),
  ];
  const date = DATE_FIELDS.map((field) => event[field]).find(
    (value): value is string => typeof value === "string",
  );
  return [
    text("Vas a registrar "),
    ...said,
    ...(date === undefined ? [] : [closing(date, account)]),
    text("."),
  ];
};
