// What a screen says when a write did not end in success (ADR-0035, §2), in one
// place so that every screen that writes says the same thing: Registrar,
// annulling, the settings, a filing and the chain of ECB rates.

import type { WriteFailure } from "./write.js";

export const CONFLICT_SENTENCE =
  "Tus datos han cambiado mientras rellenabas esto (otro dispositivo, otra pestaña o la consola). Se han vuelto a leer y no se ha guardado nada: revisa el efecto y confirma otra vez.";

export const UNKNOWN_SENTENCE =
  "No sabemos si se ha guardado: la conexión falló justo al enviarlo. Mira el aviso de arriba; no hace falta que repitas nada.";

/** The sentence of a failure that has no screen of its own; `signed_out` goes with `SessionNotice`. */
export const sentenceOf = (failure: WriteFailure): string => {
  switch (failure.kind) {
    case "conflict":
      return CONFLICT_SENTENCE;
    case "unknown":
      return UNKNOWN_SENTENCE;
    case "signed_out":
      return "Tu sesión ha terminado y no se ha guardado nada.";
    case "error":
      return failure.error.message;
    case "duplicate":
      return "Se parece a otra operación ya registrada: no se ha guardado.";
    case "dependents":
      return "Otras operaciones dependen de esta: rectifícalas antes.";
  }
};
