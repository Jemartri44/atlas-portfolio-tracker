// How the console says a price source: its name and why a download failed.

import type { SecretsError } from "@atlas/adapters";
import type {
  MismatchedCloses,
  QuoteFailureKind,
  QuoteSource,
  UnservedDays,
} from "@atlas/domain/quotes";

export const SOURCE_NAMES: Record<QuoteSource, string> = {
  eodhd: "EODHD",
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
      return `${error.path} lo pueden leer otros usuarios, o su carpeta les deja entrar: «chmod 600 ${error.path}» y «chmod 700» de su carpeta.`;
    case "secrets_not_yours":
      return `${error.path} no es de tu usuario: las claves tienen que ser de quien ejecuta la consola. No se usan.`;
    case "secrets_unknown_key":
      return `${error.path}: la entrada número ${error.position} no es una clave que se conozca. Solo vale «eodhd». No se enseña su nombre, por si fuera la clave misma.`;
    case "secrets_invalid_value":
      return `${error.path}: el valor de «${error.key}» no es una clave (tiene que ser un texto no vacío).`;
    default:
      return `${error.path} no se puede leer como JSON. No se enseña su contenido: ábrelo tú y corrígelo.`;
  }
};

/**
 * Closes stored in a currency their source does not declare: left out of every figure in
 * euros, said, and purged on request.
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
