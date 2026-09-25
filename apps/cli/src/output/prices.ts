// How the console says a price (feature 013): where it came from, how old it
// is, whether it is an approximation, and when a quote has no value in euros.
// The domain decides **whether** each thing is said; this only picks words.

import type { SecretsError } from "@atlas/adapters";
import type { PriceLookup } from "@atlas/domain";
import type {
  MismatchedCloses,
  QuoteFailureKind,
  QuoteSource,
  UnservedDays,
} from "@atlas/domain/quotes";
import { fxMissingText } from "./messages.js";

export const SOURCE_NAMES: Record<QuoteSource, string> = {
  eodhd: "EODHD",
  alpha_vantage: "Alpha Vantage",
};

/** Manual, or the source, marked when it is an approximation through the reference ETF. */
export const originText = (price: PriceLookup): string =>
  price.origin === "manual"
    ? "manual"
    : `${SOURCE_NAMES[price.source as QuoteSource]}${price.approximate === true ? " ≈ aprox." : ""}`;

/** The columns of a price in a table: value, currency, rate, date, age, origin. */
export const priceColumns = (price: PriceLookup | undefined): string[] =>
  price === undefined
    ? ["sin precio", "", "", "", "", ""]
    : [
        price.unit_value.toString(),
        price.currency,
        price.fx_rate?.toString() ?? "sin tipo BCE",
        price.date,
        `${price.age_days}${price.stale ? " ⚠" : ""}`,
        originText(price),
      ];

export const PRICE_HEADERS = ["precio", "divisa", "tipo BCE", "precio de", "antigüedad", "origen"];

/** A price in `--json`: the same data as the table, nothing less. */
export const priceJson = (price: PriceLookup | undefined) =>
  price === undefined
    ? undefined
    : {
        unit_value: price.unit_value.toString(),
        currency: price.currency,
        fx_rate: price.fx_rate?.toString(),
        fx_rate_date: price.fx_rate_date,
        fx_missing: price.fx_missing,
        unit_value_eur: price.unit_value_eur?.amount.toString(),
        price_date: price.date,
        price_age_days: price.age_days,
        price_stale: price.stale,
        origin: price.origin,
        source: price.source,
        approximate: price.approximate === true,
        newer_quote:
          price.newer_quote === undefined
            ? undefined
            : {
                unit_value: price.newer_quote.unit_value.toString(),
                currency: price.newer_quote.currency,
                date: price.newer_quote.date,
                source: price.newer_quote.source,
                fx_missing: price.newer_quote.fx_missing,
              },
      };

/** The notes under a table with prices: what has no value in euros, what is an approximation. */
export const priceNotes = (prices: readonly (PriceLookup | undefined)[]): string[] => {
  const notes: string[] = [];
  for (const price of prices) {
    const newer = price?.newer_quote;
    if (price !== undefined && newer !== undefined) {
      notes.push(
        `${price.asset_id}: hay una cotización más reciente (${newer.unit_value.toString()} ${newer.currency} del ${newer.date}) sin valor en euros (${fxMissingText(newer.fx_missing)}); se usa el último precio que sí lo tiene, del ${price.date}.`,
      );
    }
    if (price?.fx_missing !== undefined) {
      notes.push(
        `${price.asset_id}: la cotización está en ${price.currency} y falta su valor en euros (${fxMissingText(price.fx_missing)}); no suma en ningún total.`,
      );
    }
  }
  if (prices.some((price) => price?.approximate === true)) {
    notes.push(
      "≈ aprox.: valor aproximado con el movimiento de su ETF de referencia desde el último valor liquidativo real; informativo, nunca fiscal.",
    );
  }
  return notes;
};

export const FAILURE_TEXT: Record<QuoteFailureKind, string> = {
  unavailable: "no responde",
  not_found: "no tiene ese símbolo (o la clave no da acceso a él)",
  rate_limited: "ha limitado las llamadas",
  blocked: "ha rechazado la clave",
  invalid_response: "ha respondido algo que no se entiende",
  budget_exhausted: "sin cupo hoy",
  currency_mismatch: "la divisa no coincide con la declarada",
};

/** A problem of the file of the keys, never with its content nor a value. */
export const describeSecretsError = (error: SecretsError): string => {
  switch (error.code) {
    case "secrets_inside_ledger_folder":
      return `el fichero de claves (${error.path}) y la carpeta del libro están uno dentro del otro. Las claves no pueden viajar con el libro, que se copia y se exporta: pon el libro fuera de la carpeta de configuración, o al revés. No se hace nada hasta entonces.`;
    case "secrets_too_open":
      return `${error.path} lo pueden leer otros usuarios: «chmod 600 ${error.path}».`;
    case "secrets_unknown_key":
      return `${error.path}: la entrada número ${error.position} no es una clave que se conozca. Solo valen «eodhd» y «alpha_vantage». No se enseña su nombre, por si fuera la clave misma.`;
    case "secrets_invalid_value":
      return `${error.path}: el valor de «${error.key}» no es una clave (tiene que ser un texto no vacío).`;
    default:
      return `${error.path} no se puede leer como JSON. No se enseña su contenido: ábrelo tú y corrígelo.`;
  }
};

/**
 * Closes stored in a currency their source does not declare (feature 013
 * stored the pence of Alpha Vantage as pounds): left out of every figure in
 * euros, said, and purged on request (review of PR #80).
 */
export const mismatchedNotes = (mismatched: readonly MismatchedCloses[]): string[] =>
  mismatched.map((m) => {
    const closes = m.count === 1 ? "1 cierre" : `${m.count} cierres`;
    const what =
      m.misstored === undefined
        ? `${m.count === 1 ? "está guardado" : "están guardados"} en una divisa que no es la declarada para esa fuente (${m.declared})`
        : `se ${m.count === 1 ? "guardó" : "guardaron"} en ${m.misstored}, pero esa fuente dijo otra divisa y la versión anterior la confirmó por encima`;
    return `Aviso: ${m.asset_id}: ${closes} de ${SOURCE_NAMES[m.source]} ${what}; ${m.count === 1 ? "no se usa" : "no se usan"} en ninguna cifra en euros. Púrga${m.count === 1 ? "lo" : "los"} con «atlas prices purge ${m.asset_id} --source ${m.source}» y la próxima descarga vuelve a pedir esos días una vez.`;
  });

/** The days asked for again once that no source served: a hole, said. */
export const unservedNotes = (unserved: readonly UnservedDays[]): string[] =>
  unserved.map(
    (u) =>
      `Aviso: ${u.asset_id}: ${u.dates.length === 1 ? "1 día quitado" : `${u.dates.length} días quitados`} de ${SOURCE_NAMES[u.source]} (${u.dates.join(", ")}) se ${u.dates.length === 1 ? "pidió" : "pidieron"} otra vez y ninguna fuente ${u.dates.length === 1 ? "lo sirvió: queda como hueco" : "los sirvió: quedan como hueco"}. No se vuelve${u.dates.length === 1 ? "" : "n"} a pedir.`,
  );
