// What the console says about the ECB history. Spanish, dates
// as dd/mm/aaaa, rates as the history writes them.

import type { CalendarDisagreement, EcbSource, EcbUpdateResult } from "@atlas/domain/ecb";
import { FINDINGS } from "@atlas/domain/messages";
import { CLI_VOICE } from "./voice.js";

/** dd/mm/aaaa. */
export const day = (date: string): string =>
  `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

/** The provenance, in words: the API is never called the ZIP. */
export const sourceName = (source: EcbSource): string =>
  source === "zip" ? "el ZIP oficial del BCE" : "la API de datos del BCE";

/** What is wrong with the stored history, by the file that does not match. */
export const describeEcbDamage = (file: string): string =>
  file === "manifest.json"
    ? "reference/ecb/manifest.json no se puede leer: está cortado o alguien lo ha cambiado. No se ha usado el histórico; bórralo junto con los archivos de reference/ecb y descárgalo otra vez con `atlas fx update`."
    : `reference/ecb/${file} no es el archivo que registra su manifiesto: alguien lo ha cambiado. No se ha usado; bórralo junto con reference/ecb/manifest.json y descárgalo otra vez con \`atlas fx update\`.`;

/** The tax report goes on without the ECB check, and says so. */
export const ecbCheckSkipped = (file: string): string =>
  `Aviso: no se ha comprobado el histórico del BCE y el informe sigue sin esa comprobación. ${describeEcbDamage(file)}`;

export const describeRejected = (
  result: Extract<EcbUpdateResult, { kind: "rejected" }>,
): string[] => [
  `Hallazgo: el histórico descargado no coincide con el que está en vigor en ${result.total} ${result.total === 1 ? "tipo ya publicado" : "tipos ya publicados"}. No se ha usado: sigue en vigor reference/ecb/${result.active.file}, y el descargado se guarda aparte en reference/ecb/${result.kept.file}.`,
  ...result.conflicts.map(
    (conflict) =>
      `  ${conflict.currency} del ${day(conflict.date)}: ${conflict.before} en el que está en vigor, ${conflict.after ?? "ausente"} en el descargado.`,
  ),
  "O el BCE ha corregido un tipo ya publicado, o la descarga está mal: en los dos casos hay que saber por qué antes de usarlo.",
];

/** A disagreement with the TARGET calendar: a warning, never a block. */
export const describeCalendar = (disagreements: readonly CalendarDisagreement[]): string[] =>
  disagreements.length === 0
    ? []
    : [
        `Aviso: el calendario TARGET y el histórico no coinciden en ${disagreements.length} ${disagreements.length === 1 ? "día" : "días"} de los años que usa el libro. No bloquea nada: la fuente de verdad es el histórico, y o le falta un día o el calendario ha cambiado.`,
        ...disagreements.map((entry) =>
          entry.kind === "working_day_without_publication"
            ? `  ${day(entry.date)}: día hábil sin publicación.`
            : `  ${day(entry.date)}: día de cierre con publicación.`,
        ),
      ];

/**
 * The findings of the ECB check, in Spanish, from the one catalogue: each with the facts the domain
 * gave and what to do. The console translates only these findings; the rest print the domain's
 * English (a known gap).
 */
const DATE_DETAILS = ["rate_date", "reference", "official_date", "last", "latest", "date"];

/** The catalogue's sentence for the console, with the dates of the details as dd/mm/aaaa. */
const fromCatalogue = (code: string, d: Readonly<Record<string, string>>): string | undefined => {
  const entry = FINDINGS[code];
  if (entry?.facts === undefined) {
    return undefined;
  }
  const dated: Record<string, string> = { ...d };
  for (const key of DATE_DETAILS) {
    const value = d[key];
    if (value !== undefined) {
      dated[key] = day(value);
    }
  }
  const remedy = entry.cli?.(dated, CLI_VOICE, "");
  const facts = entry.facts(dated, CLI_VOICE, "");
  return remedy === undefined ? facts : `${facts} ${remedy}`;
};

export const describeEcbFinding = (
  code: string,
  d: Readonly<Record<string, string>>,
): string | undefined => {
  const catalogued = fromCatalogue(code, d);
  if (catalogued !== undefined) {
    return catalogued;
  }
  return undefined;
};
