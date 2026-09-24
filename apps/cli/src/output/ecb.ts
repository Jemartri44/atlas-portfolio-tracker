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

const rate = (value: string | undefined): string => (value === undefined ? "?" : value);
const when = (value: string | undefined): string => (value === undefined ? "?" : day(value));
const whose = (basis: string | undefined): string =>
  basis === "fiscal" ? "la fecha fiscal" : "la fecha de la operación";

/**
 * The findings of the ECB check, in Spanish (decision (z) of prompt 012): a
 * catalogue **limited to the codes of the ECB** — translating every finding of
 * the console is another feature —, and the drift test of the messages
 * demands an entry here for each code the domain can raise. Each with the
 * facts the domain gave, and what to do.
 */
export const describeEcbFinding = (
  code: string,
  d: Readonly<Record<string, string>>,
): string | undefined => {
  const where = `${d.field ?? "fx_rate"} (${d.currency ?? "?"})`;
  switch (code) {
    case "fx_rate_mismatch":
      return `${where}: ${rate(d.rate)} del ${when(d.rate_date)} no es el tipo oficial de ese día, ${rate(d.official)}. Si es un error, corrígelo con atlas edit.`;
    case "fx_rate_date_unpublished":
      return `${where}: el BCE no publicó tipo de ${d.currency ?? "?"} el ${when(d.rate_date)}. Corrígelo con el último publicado en o antes de ${whose(d.basis)}.`;
    case "fx_rate_date_not_latest":
      return `${where}: para ${whose(d.basis)} (${when(d.reference)}) el tipo aplicable es ${rate(d.official)} del ${when(d.official_date)}, no el del ${when(d.rate_date)}. Si la regla de la fecha fiscal cambió, la corrección es anular y registrar de nuevo, nunca recalcular.`;
    case "fx_rate_currency_unlisted":
      return `${where}: el BCE no publica ${d.currency ?? "esa divisa"} (o no la publicaba el ${when(d.reference)}): el tipo no se puede contrastar con el oficial.`;
    case "fx_rate_currency_stale":
      return `${where}: el BCE dejó de publicar ${d.currency ?? "esa divisa"} el ${when(d.last)}: el tipo no se puede contrastar con el oficial.`;
    case "fx_rate_not_yet_in_history":
      return `${where}: el histórico llega hasta el ${when(d.latest)} y ${whose(d.basis)} es el ${when(d.reference)}: sin contrastar. Actualízalo con atlas fx update.`;
    case "target_calendar_mismatch":
      return d.kind === "working_day_without_publication"
        ? `El ${when(d.date)} es hábil según el calendario TARGET y el histórico no trae publicación: o le falta un día o el calendario cambió. No bloquea nada.`
        : `El ${when(d.date)} es de cierre según el calendario TARGET y el histórico trae publicación: o el calendario cambió o el archivo está mal. No bloquea nada.`;
    default:
      return undefined;
  }
};
