// What the card of the sync says (feature 015, E4): the codes of the sync in
// the words of the rest of the web, the three starts with what each one does,
// and the outcome of an order. No JSX: the card and the list of what is held
// read it.

import { Decimal, DomainError, Money } from "@atlas/domain";
import type { Severity } from "../../../components/index.js";
import { formatDate, formatInstantDate } from "../../../format/date.js";
import { countOf } from "../../../format/number.js";
import { toAppError } from "../../../ledger/errors.js";
import type { StartHow, WebOutcome } from "../../../sync/engine.js";

/** A code of the sync, said as the rest of the web says its errors. */
export const said = (code: string, details: Readonly<Record<string, unknown>> = {}): string =>
  toAppError(new DomainError(code, code, { ...details })).message;

/** Codes the engine gives that the domain does not: said here. */
const OWN: Readonly<Record<string, string>> = {
  init_remote_not_empty:
    "La nube ya tiene otros datos: no se suben encima. Únete a ella con «Unirme desde la nube» o «Unirme con mis operaciones».",
  init_remote_not_this_ledger:
    "La nube ya no tiene exactamente tus datos: no se termina de empezar sobre otra cosa. Únete a ella con «Unirme desde la nube» o «Unirme con mis operaciones».",
};

const sayCode = (code: string, details: Readonly<Record<string, unknown>> = {}): string =>
  OWN[code] ?? said(code, details);

export interface Told {
  readonly severity: Severity;
  readonly title: string;
  readonly text: string;
}

export const START: Readonly<Record<StartHow, { label: string; asks: string }>> = {
  init: {
    label: "Subir mis datos a la nube",
    asks: "Se suben tus datos enteros a una nube vacía, y este navegador queda sincronizado. Si la nube ya tiene datos, no se sube nada.",
  },
  join_from_remote: {
    label: "Unirme desde la nube",
    asks: "Tus datos pasan a ser los de la nube. Los de este navegador se archivan aquí, y lo que la nube no tenga queda retenido para que lo revises: nunca se sube solo.",
  },
  join_with_mine: {
    label: "Unirme con mis operaciones",
    asks: "Se parte de la nube y tus operaciones que no estén en ella quedan pendientes de subir. Las inválidas se retendrán al sincronizar.",
  },
};

export const REDOWNLOAD_ASKS =
  "Tus datos pasan a ser los de la nube, que se ha reescrito. Los de este navegador se archivan aquí, y lo que la nube ya no tenga queda retenido para que lo revises.";

export const RESOLUTION: Readonly<Record<string, string>> = {
  confirm: "Confirmar",
  redo: "Rehacer",
  discard: "Descartar",
};

/** The amount of an operation, when it has one: shown only through `Amount`, which the privacy mode masks. */
export const amountOf = (event: Readonly<Record<string, unknown>>): Money | undefined => {
  if (typeof event.amount !== "string" || typeof event.currency !== "string") {
    return undefined;
  }
  try {
    return Money.of(Decimal.parse(event.amount), event.currency as never);
  } catch {
    return undefined;
  }
};

export const dateOf = (event: Readonly<Record<string, unknown>>): string | undefined => {
  const date = event.trade_date ?? event.value_date ?? event.date;
  return typeof date === "string" ? formatDate(date as never) : undefined;
};

/** When it last synced: the day and the hour, so how long ago reads at a glance. */
export const syncedAt = (instant: string): string =>
  `${formatInstantDate(instant)}, ${new Date(instant).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;

/** What an order did, said; `done` titles a sync that went through. */
export const outcomeTold = (outcome: WebOutcome, done: string): Told => {
  if (outcome.status === "refused") {
    return {
      severity: "danger",
      title: "No se ha hecho",
      text: sayCode(outcome.refusal.code, outcome.refusal.details),
    };
  }
  if (outcome.status === "stopped") {
    return {
      severity: "caution",
      title: "No se ha sincronizado",
      text: sayCode(outcome.stop.code, outcome.stop.details),
    };
  }
  const parts = [
    `${countOf(outcome.uploaded, "operación subida", "operaciones subidas")}; ${countOf(outcome.pending, "queda pendiente", "quedan pendientes")}.`,
    ...(outcome.held === undefined ? [] : [said(outcome.held.code)]),
    ...(outcome.notice === undefined ? [] : [said(outcome.notice.code, outcome.notice.details)]),
  ];
  return {
    severity: outcome.held === undefined && outcome.notice === undefined ? "info" : "caution",
    title: done,
    text: parts.join(" "),
  };
};
