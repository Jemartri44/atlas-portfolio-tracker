// What the summary says about the tax side, **loaded after the first paint**.
//
// This module is the only thing of the summary that reaches the tax engine,
// and it is imported dynamically for that reason alone: the engine and the
// informative returns are 21 KB gzip that a screen opened a handful of times a
// year has no business putting on the boot path (`check-bundle.mjs` fails the
// build if they land there). The card paints its skeleton, this arrives, and
// the card fills in.
//
// **The domain decides what is pending and whether it is urgent** (question
// Q11): a rule about when a return is due is a fiscal rule, not a rule of the
// web. What is added here is the Spanish.

import type { LedgerEvent } from "@atlas/domain";
import { fiscalAttention, type InformativeTodo } from "@atlas/domain/fiscal";

export interface FiscalStatus {
  /** The card goes to the top of the summary: season, or something to do. */
  prominent: boolean;
  season: boolean;
  /** One line per thing to do, already in Spanish. */
  lines: string[];
  /** Past years with figures and no income tax return recorded. */
  unfiled: number[];
  invalid: number;
}

const MODEL_NAMES: Record<string, string> = { "720": "Modelo 720", "721": "Modelo 721" };

const CATEGORY_NAMES: Record<string, string> = {
  accounts: "las cuentas en el extranjero",
  securities: "los valores y fondos en el extranjero",
  crypto: "las monedas virtuales en el extranjero",
};

const todoText = (todo: InformativeTodo): string => {
  const model = MODEL_NAMES[todo.model] ?? todo.model;
  const what = CATEGORY_NAMES[todo.category] ?? todo.category;
  if (todo.reason === "file") {
    return `Te toca presentar el ${model} de ${todo.year} por ${what}.`;
  }
  if (todo.reason === "undetermined") {
    return `No se puede saber si te toca el ${model} de ${todo.year}: faltan valoraciones a 31 de diciembre.`;
  }
  return `${model} de ${todo.year}: ${what} se acerca al umbral.`;
};

export const fiscalStatus = (events: readonly LedgerEvent[], today: string): FiscalStatus => {
  const attention = fiscalAttention(events, today);
  return {
    prominent: attention.prominent,
    season: attention.season,
    lines: attention.todo.map(todoText),
    unfiled: attention.unfiled_years,
    invalid: attention.invalid_events,
  };
};
