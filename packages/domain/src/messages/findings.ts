// The integrity findings: what each means and what to do, shared by the console and the web.
// `facts` is the same finding told with the details the domain gave (the console prints it);
// `cli` is the remedy only the console can give (a command to run).

import type { Details, Say, Voice } from "./voice.js";

/** What an integrity finding means and what to do about it. */
export interface FindingEntry {
  what: Say;
  todo: Say;
  /** The finding with its facts (which currency, which date, which rate). */
  facts?: Say;
  /** The remedy only the console can give, after the facts. */
  cli?: Say;
}

const rate = (value: unknown, v: Voice): string => (value === undefined ? "?" : v.text(value));
const when = (value: unknown, v: Voice): string => (value === undefined ? "?" : v.date(value));
const where = (d: Details, v: Voice): string =>
  `${v.field(d.field ?? "fx_rate")} (${v.text(d.currency ?? "?")})`;
const whose = (d: Details): string =>
  d.basis === "fiscal" ? "la fecha fiscal" : "la fecha de la operación";

export const FINDINGS: Record<string, FindingEntry> = {
  negative_position: {
    what: () => "Una posición física ha quedado negativa: hay más vendido que comprado.",
    todo: () =>
      "Falta registrar una compra, o sobra una venta. Búscala en Movimientos y rectifícala.",
  },
  lots_mismatch: {
    what: () => "Los lotes fiscales de un activo no suman su posición física.",
    todo: () =>
      "Es un desajuste del motor FIFO: no registres nada más sobre ese activo y revisa sus operaciones desde la primera.",
  },
  duplicate_fingerprint: {
    what: () =>
      "Dos eventos tienen la misma huella: puede ser la misma operación registrada dos veces.",
    todo: () =>
      "Abre los dos en Movimientos. Si son la misma, anula uno; si son dos operaciones idénticas de verdad, no hay nada que hacer.",
  },
  duplicate_isin: {
    what: () =>
      "Dos activos del catálogo tienen el mismo ISIN: para Hacienda son el mismo valor, y la regla de recompra y el FIFO los tratan como dos.",
    todo: () =>
      "Registra las operaciones de ese valor en un solo activo. Mientras los dos existan, las cifras fiscales de ese valor pueden estar mal.",
  },
  dangling_reference: {
    what: () => "Un activo apunta a un ETF de referencia que no existe en el catálogo.",
    todo: () =>
      "Da de alta el activo al que apunta, o quítale la referencia desde la configuración del activo.",
  },
  fx_rate_mismatch: {
    what: () => "Un tipo del BCE del libro no es el oficial de su fecha.",
    todo: () =>
      "Si es un error, corrige el movimiento: se anula y se registra de nuevo con el tipo bueno. Si lo confirmaste a sabiendas, no hay nada que hacer.",
    facts: (d, v) =>
      `${where(d, v)}: ${rate(d.rate, v)} del ${when(d.rate_date, v)} no es el tipo oficial de ese día, ${rate(d.official, v)}.`,
    cli: () => "Si es un error, corrígelo con atlas edit.",
  },
  fx_rate_date_unpublished: {
    what: () => "Un tipo del libro está fechado en un día en que el BCE no publicó.",
    todo: () => "Corrige el movimiento con el último tipo publicado en o antes de su fecha fiscal.",
    facts: (d, v) =>
      `${where(d, v)}: el BCE no publicó tipo de ${v.text(d.currency ?? "?")} el ${when(d.rate_date, v)}.`,
    cli: (d) => `Corrígelo con el último publicado en o antes de ${whose(d)}.`,
  },
  fx_rate_date_not_latest: {
    what: () =>
      "La fecha del tipo no es la última publicación en o antes de la fecha fiscal del movimiento.",
    todo: () =>
      "Corrige el movimiento con el tipo que corresponde. Si cambió la regla de la fecha fiscal, la solución es la misma: anular y registrar de nuevo, nunca recalcular.",
    facts: (d, v) =>
      `${where(d, v)}: para ${whose(d)} (${when(d.reference, v)}) el tipo aplicable es ${rate(d.official, v)} del ${when(d.official_date, v)}, no el del ${when(d.rate_date, v)}.`,
    cli: () =>
      "Si la regla de la fecha fiscal cambió, la corrección es anular y registrar de nuevo, nunca recalcular.",
  },
  fx_rate_currency_unlisted: {
    what: () => "El BCE no publica la divisa de un movimiento, o no la publicaba en su fecha.",
    todo: () => "Ese tipo no se puede contrastar con el oficial: revísalo con el extracto.",
    facts: (d, v) =>
      `${where(d, v)}: el BCE no publica ${v.text(d.currency ?? "esa divisa")} (o no la publicaba el ${when(d.reference, v)}): el tipo no se puede contrastar con el oficial.`,
  },
  fx_rate_currency_stale: {
    what: () => "El BCE dejó de publicar la divisa de un movimiento antes de su fecha.",
    todo: () => "Ese tipo no se puede contrastar con el oficial: revísalo con el extracto.",
    facts: (d, v) =>
      `${where(d, v)}: el BCE dejó de publicar ${v.text(d.currency ?? "esa divisa")} el ${when(d.last, v)}: el tipo no se puede contrastar con el oficial.`,
  },
  fx_rate_not_yet_in_history: {
    what: () =>
      "El histórico del BCE no llega todavía a la fecha de un movimiento: su tipo está sin contrastar.",
    todo: () => "Actualiza el histórico (la consola lo descarga, o impórtalo en Ajustes).",
    facts: (d, v) =>
      `${where(d, v)}: el histórico llega hasta el ${when(d.latest, v)} y ${whose(d)} es el ${when(d.reference, v)}: sin contrastar.`,
    cli: () => "Actualízalo con atlas fx update.",
  },
  target_calendar_mismatch: {
    what: () =>
      "El calendario TARGET y el histórico del BCE no coinciden en un día de los años que usa el libro.",
    todo: () =>
      "No bloquea nada: o al histórico le falta un día o el calendario cambió. Descarga de nuevo el histórico y, si sigue, avísalo.",
    facts: (d, v) =>
      d.kind === "working_day_without_publication"
        ? `El ${when(d.date, v)} es hábil según el calendario TARGET y el histórico no trae publicación: o le falta un día o el calendario cambió. No bloquea nada.`
        : `El ${when(d.date, v)} es de cierre según el calendario TARGET y el histórico trae publicación: o el calendario cambió o el archivo está mal. No bloquea nada.`,
  },
  duplicate_id: {
    what: () => "Dos líneas del archivo tienen el mismo identificador.",
    todo: () =>
      "El archivo se ha editado a mano o se han juntado dos archivos. Recupera una copia y compárala antes de escribir nada más.",
  },
  non_canonical_line: {
    what: () =>
      "Una línea no está en su forma canónica: el orden de sus campos no es el que escribe la aplicación.",
    todo: () =>
      "No afecta a ningún cálculo. La orden «atlas compact» de la CLI la reescribe cuando quieras.",
  },
  unknown_field: {
    what: () => "Una línea trae un campo que su tipo de evento no define.",
    todo: () =>
      "Suele venir de una edición a mano. El campo se ignora; si sobra, quítalo con una rectificación.",
  },
  outdated_lines: {
    what: () => "Hay líneas escritas por una versión anterior de la aplicación.",
    todo: () =>
      "Se leen sin problema porque la aplicación las convierte al cargarlas. La orden «atlas compact» de la CLI las reescribe en el formato actual.",
  },
  fingerprint_mismatch: {
    what: () =>
      "La huella guardada de un evento no coincide con sus campos: alguien lo editó a mano.",
    todo: () =>
      "En tus datos nada se edita: un movimiento equivocado se anula y se registra corregido. Recupera la copia anterior a la edición.",
  },
  filing_fingerprint_lines: {
    what: () =>
      "Una declaración presentada dice que se calculó sobre un número de movimientos distinto de los que tiene delante en el archivo.",
    todo: () =>
      "Alguien ha insertado o quitado una línea antes de esa declaración. Recupera la copia anterior y compárala: lo que consta en Hacienda no se puede recalcular sin esos movimientos.",
  },
  filing_fingerprint_mismatch: {
    what: () =>
      "Los movimientos anteriores a una declaración presentada ya no son los que había cuando se presentó.",
    todo: () =>
      "Se han editado a mano. Recupera la copia anterior a la edición: sin ellos, la aplicación no puede explicar por qué lo declarado y lo calculado difieren.",
  },
  filing_fingerprint_unreadable: {
    what: () =>
      "Los movimientos anteriores a una declaración presentada no se pueden leer en el formato que dice su huella, así que no se puede comprobar.",
    todo: () =>
      "No es una edición y no hay copia que restaurar. El detalle técnico de abajo dice en qué formato habría que poder leerlos; conserva el archivo tal como está y no lo edites a mano.",
  },
  filing_fingerprint_waived: {
    what: () =>
      "La huella de una declaración presentada nunca llegó a comprobarse, y tú lo diste por bueno para poder compactar.",
    todo: () =>
      "No hay nada que hacer: queda escrito aquí para siempre, con el motivo y el día en que lo aceptaste. Lo que esa declaración dice sobre sí misma no se ha podido contrastar con tus movimientos.",
  },
  projection_not_reproducible: {
    what: () => "Volver a leer el archivo da un resultado distinto del que tienes en pantalla.",
    todo: () =>
      "Es el fallo más grave que hay: no registres nada. Exporta tus datos tal como están, guárdalos aparte y revísalos antes de seguir.",
  },
};
