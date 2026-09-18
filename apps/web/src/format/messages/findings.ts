// The integrity findings, in Spanish (Q11 of prompt 007).
//
// The verification screen used to print a Spanish title and then the domain's
// **English** message underneath. A check whose whole purpose is to be read when
// something has gone wrong is useless in a language the reader may not have,
// and that is exactly the moment it has to be clear.
//
// Each code gets three things: what it means, what to do about it, and how bad
// it is. The domain's own message keeps the evidence — which asset, which line,
// which identifier — and stays available folded away, like the code of an
// `AppError`: the explanation is Spanish, the evidence is raw.

import type { IntegrityFinding } from "@atlas/domain";

export interface FindingText {
  /** What it means, in one line. */
  what: string;
  /** What to do about it. */
  todo: string;
}

export const FINDING_TEXTS: Record<string, FindingText> = {
  // --- integrity(): the projection against itself ------------------------
  negative_position: {
    what: "Una posición física ha quedado negativa: hay más vendido que comprado.",
    todo: "Falta registrar una compra, o sobra una venta. Búscala en Movimientos y rectifícala.",
  },
  lots_mismatch: {
    what: "Los lotes fiscales de un activo no suman su posición física.",
    todo: "Es un desajuste del motor FIFO: no registres nada más sobre ese activo y revisa sus operaciones desde la primera.",
  },
  duplicate_fingerprint: {
    what: "Dos eventos tienen la misma huella: puede ser la misma operación registrada dos veces.",
    todo: "Abre los dos en Movimientos. Si son la misma, anula uno; si son dos operaciones idénticas de verdad, no hay nada que hacer.",
  },
  dangling_reference: {
    what: "Un activo apunta a un ETF de referencia que no existe en el catálogo.",
    todo: "Da de alta el activo al que apunta, o quítale la referencia desde la configuración del activo.",
  },
  // --- deepCheck(): the raw lines and the fingerprints -------------------
  duplicate_id: {
    what: "Dos líneas del fichero tienen el mismo identificador.",
    todo: "El fichero se ha editado a mano o se han concatenado dos libros. Recupera una copia y compárala antes de escribir nada más.",
  },
  non_canonical_line: {
    what: "Una línea no está en su forma canónica: el orden de sus campos no es el que escribe la aplicación.",
    todo: "No afecta a ningún cálculo. `atlas compact` la reescribe cuando quieras.",
  },
  unknown_field: {
    what: "Una línea trae un campo que su tipo de evento no define.",
    todo: "Suele venir de una edición a mano. El campo se ignora; si sobra, quítalo con una rectificación.",
  },
  outdated_lines: {
    what: "Hay líneas de una versión anterior del esquema.",
    todo: "Se leen sin problema porque la aplicación las migra al cargarlas. `atlas compact` las reescribe en la versión actual.",
  },
  fingerprint_mismatch: {
    what: "La huella guardada de un evento no coincide con sus campos: alguien lo editó a mano.",
    todo: "El libro es append-only: un evento no se edita, se anula y se registra corregido. Recupera la copia anterior a la edición.",
  },
  projection_not_reproducible: {
    what: "Volver a leer el fichero da un resultado distinto del que tienes en pantalla.",
    todo: "Es el fallo más grave que hay: no registres nada. Exporta el libro tal como está, guárdalo aparte y revísalo antes de seguir.",
  },
};

/** Spanish text of a finding; an unknown code falls back to its own code. */
export const describeFinding = (finding: IntegrityFinding): FindingText =>
  FINDING_TEXTS[finding.code] ?? {
    what: finding.code,
    todo: "Este hallazgo no tiene explicación escrita todavía: el detalle técnico de abajo es lo que hay.",
  };
