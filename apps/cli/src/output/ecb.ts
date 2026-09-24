// What the console says about the ECB history (feature 012). Spanish, dates
// as dd/mm/aaaa, rates as the history writes them.

import type { CalendarDisagreement, EcbSource, EcbUpdateResult } from "@atlas/domain/ecb";

/** dd/mm/aaaa. */
export const day = (date: string): string =>
  `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

/** The provenance, in words: the API is never called the ZIP. */
export const sourceName = (source: EcbSource): string =>
  source === "zip" ? "el ZIP oficial del BCE" : "la API de datos del BCE";

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
