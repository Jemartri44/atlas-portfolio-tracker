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
  duplicate_isin: {
    what: "Dos activos del catálogo tienen el mismo ISIN: para Hacienda son el mismo valor, y la regla de recompra y el FIFO los tratan como dos.",
    todo: "Registra las operaciones de ese valor en un solo activo. Mientras los dos existan, las cifras fiscales de ese valor pueden estar mal.",
  },
  dangling_reference: {
    what: "Un activo apunta a un ETF de referencia que no existe en el catálogo.",
    todo: "Da de alta el activo al que apunta, o quítale la referencia desde la configuración del activo.",
  },
  // --- deepCheck(): the raw lines and the fingerprints -------------------
  duplicate_id: {
    what: "Dos líneas del archivo tienen el mismo identificador.",
    todo: "El archivo se ha editado a mano o se han juntado dos archivos. Recupera una copia y compárala antes de escribir nada más.",
  },
  non_canonical_line: {
    what: "Una línea no está en su forma canónica: el orden de sus campos no es el que escribe la aplicación.",
    todo: "No afecta a ningún cálculo. La orden «atlas compact» de la CLI la reescribe cuando quieras.",
  },
  unknown_field: {
    what: "Una línea trae un campo que su tipo de evento no define.",
    todo: "Suele venir de una edición a mano. El campo se ignora; si sobra, quítalo con una rectificación.",
  },
  outdated_lines: {
    what: "Hay líneas escritas por una versión anterior de la aplicación.",
    todo: "Se leen sin problema porque la aplicación las convierte al cargarlas. La orden «atlas compact» de la CLI las reescribe en el formato actual.",
  },
  fingerprint_mismatch: {
    what: "La huella guardada de un evento no coincide con sus campos: alguien lo editó a mano.",
    todo: "En tus datos nada se edita: un movimiento equivocado se anula y se registra corregido. Recupera la copia anterior a la edición.",
  },
  // --- What was filed (ADR-0020) ----------------------------------------
  filing_fingerprint_lines: {
    what: "Una declaración presentada dice que se calculó sobre un número de movimientos distinto de los que tiene delante en el archivo.",
    todo: "Alguien ha insertado o quitado una línea antes de esa declaración. Recupera la copia anterior y compárala: lo que consta en Hacienda no se puede recalcular sin esos movimientos.",
  },
  filing_fingerprint_mismatch: {
    what: "Los movimientos anteriores a una declaración presentada ya no son los que había cuando se presentó.",
    todo: "Se han editado a mano. Recupera la copia anterior a la edición: sin ellos, la aplicación no puede explicar por qué lo declarado y lo calculado difieren.",
  },
  // **No es una edición**, y por eso no comparte código con el de arriba: los
  // movimientos están ahí, pero escritos en un formato que esta versión no
  // sabe releer en el punto en que la huella lo declara. Mandar restaurar una
  // copia de seguridad no arreglaría nada y acusaría de algo que no ha pasado.
  filing_fingerprint_unreadable: {
    what: "Los movimientos anteriores a una declaración presentada no se pueden leer en el formato que dice su huella, así que no se puede comprobar.",
    todo: "No es una edición y no hay copia que restaurar. El detalle técnico de abajo dice en qué formato habría que poder leerlos; conserva el archivo tal como está y no lo edites a mano.",
  },
  projection_not_reproducible: {
    what: "Volver a leer el archivo da un resultado distinto del que tienes en pantalla.",
    todo: "Es el fallo más grave que hay: no registres nada. Exporta tus datos tal como están, guárdalos aparte y revísalos antes de seguir.",
  },
};

/** Spanish text of a finding; an unknown code falls back to its own code. */
export const describeFinding = (finding: IntegrityFinding): FindingText =>
  FINDING_TEXTS[finding.code] ?? {
    what: "La verificación ha encontrado algo que esta versión todavía no sabe explicar.",
    todo: "Este hallazgo no tiene explicación escrita todavía: el detalle técnico de abajo es lo que hay.",
  };
