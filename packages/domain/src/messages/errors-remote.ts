// What the cloud refuses to append (`docs/api.md` §5.2), what a synced ledger refuses, and the
// outcome of a write that was cut. The reasons a cloud gives for refusing a line are written once
// (`REJECTION_REASONS`) and said inside `remote_rejected`.

import type { Details, Entry, Voice } from "./voice.js";
import { render } from "./voice.js";

/**
 * The safe way out of a ledger with Windows line endings: it copies the file first, refusing to
 * overwrite a copy, and only then rewrites `\r\n` as `\n`. The console exports the same string.
 */
export const RAW_LINE_BREAK_FIX = `node -e "const fs=require('fs'),f='ledger.jsonl';fs.copyFileSync(f,f+'.crlf',fs.constants.COPYFILE_EXCL);fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\\r\\n/g,'\\n'))"`;

const has = (value: unknown): boolean => value !== undefined;

/** «, dejaría N operaciones inválidas» when the cloud said which ones. */
const wouldInvalidate = (d: Details, v: Voice): string =>
  has(d.affected) ? ` y dejaría ${v.count(d.affected)} operaciones inválidas` : "";

/** The same ones, for the console, which names them. */
const affectedIds = (d: Details, v: Voice): string =>
  has(d.affected) ? ` Inválidas: ${v.many(d.affected)}.` : "";

/**
 * Why the cloud refused a line, as a clause that follows «La nube ha rechazado la operación:».
 * The remedy of each surface is appended by `render`.
 */
const REJECTION_REASONS: Record<string, Entry> = {
  domain_rejected: {
    say: (d, v) =>
      `sobre lo que ya hay en la nube, tus datos quedarían incoherentes${wouldInvalidate(d, v)}. Rehazla sobre el estado actual.`,
    cli: affectedIds,
  },
  pair_rejected: {
    say: (d, v) =>
      `la corrección se rechaza entera, la anulación y la operación corregida juntas: sobre lo que ya hay en la nube no caben${wouldInvalidate(d, v)}. Ninguna de las dos se ha subido. Rehazla.`,
    cli: (d, v) =>
      has(d.member)
        ? `Miembro: ${v.text(d.member)}, ${v.text(d.member_code)}.${affectedIds(d, v)}`
        : affectedIds(d, v).trim(),
  },
  pair_not_contiguous: {
    say: () =>
      "la operación corregida no va justo detrás de su anulación, que es como se escriben siempre. Rehaz la corrección.",
  },
  pair_incomplete: {
    say: () =>
      "una anulación anunciaba su corrección y no la traía detrás: se sube siempre la pareja entera.",
  },
  pair_declaration_invalid: {
    say: () =>
      "una línea declaraba ser una anulación con corrección, o parte de una cadena, sin serlo; es un fallo de la aplicación.",
  },
  line_unreadable: {
    say: (d, v) =>
      `una línea${has(d.line) ? ` (la ${v.text(d.line)})` : ""} no se podía leer; es un fallo de la aplicación.`,
  },
  line_too_large: {
    say: (d, v) =>
      `una línea es demasiado larga para la nube${has(d.bytes) ? ` (${v.num(d.bytes)} bytes; el tope es ${v.num(d.limit)})` : ""}: acórtala (por ejemplo, las notas).`,
  },
  ledger_too_large: {
    say: (d, v) =>
      `con esto los datos de la nube pasarían de su tamaño máximo${has(d.limit) ? ` (${v.num(d.limit)} bytes)` : ""}.`,
  },
  line_invalid: { say: () => "los datos de la operación no son válidos para la nube." },
  schema_version_unsupported: {
    say: (d, v) =>
      `tus datos usan un formato más nuevo que el de la nube${has(d.found) ? ` (formato ${v.text(d.found)}; la nube entiende hasta el ${v.text(d.supported)})` : ""}: espera a que la nube se actualice.`,
  },
  recorded_at_in_future: {
    say: (d, v) =>
      `su hora de registro${has(d.recorded_at) ? ` (${v.text(d.recorded_at)})` : ""} va por delante del reloj de la nube; revisa la hora de este dispositivo y rehaz la operación.`,
  },
  duplicate_unconfirmed: {
    say: () =>
      "se parece a otra ya registrada y no se confirmó que fuera distinta. Confírmala si de verdad son dos.",
    cli: (d, v) => (has(d.existing ?? d.id) ? `La otra es ${v.text(d.existing ?? d.id)}.` : ""),
  },
  seal_mismatch: {
    say: () =>
      "una declaración presentada ya no cuadra con los movimientos que tendría delante en la nube. Regístrala otra vez sobre tus datos actuales.",
  },
  waiver_not_appendable: {
    say: () =>
      "una renuncia a verificar una huella solo nace al compactar los datos, y nunca se sube línea a línea.",
  },
  partial_write: { say: () => "solo se escribió una parte." },
};

const NOT_ACCEPTED = "no la ha aceptado tal como estaba.";

export const ERRORS_REMOTE: Record<string, Entry> = {
  // --- What the cloud refuses to append ------------------------------------
  // Nothing is stored on the device: a rejected operation is simply not saved.
  domain_rejected: (d, v) =>
    `La nube la rechaza: con lo que ya hay, tus datos${has(d.affected) ? ` dejarían ${v.count(d.affected)} operaciones inválidas` : " quedarían incoherentes"}. No se ha guardado nada; rehazla sobre lo actual.`,
  pair_rejected: (d, v) =>
    `La nube rechaza la corrección entera, la anulación y la operación corregida juntas: con lo que ya hay no cabe${has(d.affected) ? ` y dejaría ${v.count(d.affected)} operaciones inválidas` : ""}. No se ha guardado ninguna de las dos; rehazla.`,
  pair_not_contiguous: () =>
    "La operación corregida no va justo detrás de su anulación, que es como se escriben siempre. No se ha guardado nada; rehaz la corrección.",
  pair_incomplete: () =>
    "La nube ha rechazado una anulación que anunciaba su corrección y no la traía detrás: se sube siempre la pareja entera.",
  pair_declaration_invalid: () =>
    "La nube ha rechazado la petición: una línea decía ser parte de una corrección sin serlo. Es un fallo de la aplicación.",
  line_unreadable: () => "La nube no ha podido leer una operación. No se ha guardado.",
  line_invalid: () => "La nube ha rechazado una operación por su forma. No se ha guardado.",
  schema_version_unsupported: () =>
    "La nube no conoce todavía el formato de esta operación. No se ha guardado; vuelve a intentarlo cuando la nube se actualice.",
  recorded_at_in_future: () =>
    "Su hora de registro va por delante del reloj de la nube. Revisa la hora de este dispositivo y rehazla.",
  duplicate_unconfirmed: () =>
    "La nube pide confirmar una operación que parece repetida. No se ha guardado: regístrala otra vez confirmando que de verdad son dos.",
  seal_mismatch: () =>
    "La declaración ya no cuadra con los movimientos que tendría delante en la nube. Regístrala otra vez sobre tus datos actuales.",
  waiver_not_appendable: () =>
    "Una renuncia a verificar una huella solo nace al compactar en la consola y nunca se sube sola. No se ha guardado.",
  // --- What a synced ledger refuses ----------------------------------------
  accept_invalid_while_synced: {
    say: (d, v) =>
      `Tus datos se sincronizan, y este cambio dejaría ${v.count(d.affected)} operaciones inválidas: tus datos quedarían inválidos, no se podrían sincronizar y la sincronización se pararía. La nube rechaza siempre datos inválidos.`,
    cli: () =>
      "--accept-invalid solo vale en una carpeta local sin nube ni sincronización (ADR-0035). Repara antes esos eventos (atlas check te los enseña).",
    web: () =>
      "Repara antes esas operaciones (Ajustes → Verificación) o desactiva la sincronización de forma explícita.",
  },
  raw_lone_surrogate: (d, v) =>
    `La línea ${v.text(d.line)} lleva un carácter que no es Unicode (un suplente suelto): sus bytes no serían UTF-8 y los datos no se podrían leer. No se ha guardado nada; esa línea no la escribe la aplicación.`,
  raw_line_break: {
    say: (d, v) =>
      `La línea ${v.text(d.line)} lleva dentro un salto de línea o un retorno de carro (\\r): el fichero tiene finales de línea de Windows, que solo deja una edición a mano, y así no se escribe tal cual.`,
    cli: () =>
      `Atlas no lo arregla solo. Conviértelo a finales LF desde la carpeta del libro, con una copia previa en ledger.jsonl.crlf (se niega si ya existe): ${RAW_LINE_BREAK_FIX}.`,
    web: () =>
      "Conviértelo a finales LF en la consola, desde la carpeta del libro, con la orden que da «atlas» para este mismo error (copia antes el fichero en ledger.jsonl.crlf y cambia solo los finales de línea), y después vuelve a sincronizar. Aquí no se puede importar un fichero mientras la sincronización esté configurada.",
  },
  // --- A write that was refused or cut ---------------------------------------
  write_outcome_unknown: () =>
    "La conexión se cortó al guardar y no se sabe si la operación quedó registrada: cuando vuelva la conexión, comprueba el libro antes de repetirla.",
  remote_rejected: {
    say: (d, v, message) => {
      const reason = REJECTION_REASONS[String(d.remote_code)];
      const why = reason === undefined ? NOT_ACCEPTED : render(reason, d, v, message);
      const tail =
        d.accepted === 0
          ? "No se ha guardado nada."
          : `Se han guardado ${v.num(Math.floor(Number(d.accepted) || 0))} líneas y el resto no. Mira el libro antes de repetir: lo ya guardado está y repetir la operación desde cero lo duplicaría.`;
      return `La nube ha rechazado la operación: ${why} ${tail}`;
    },
    cli: (d, v) =>
      `(${v.text(d.remote_code)}${has(d.domain_code) ? `, ${v.text(d.domain_code)}` : ""})`,
  },
};
