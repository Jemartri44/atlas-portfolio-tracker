// Errors about rectification, the local config and price files, the state of the ledger, the store
// and the shape of a line.

import type { Entry, Say, Voice } from "./voice.js";

const counted = (v: Voice, n: number, one: string, many: string): string =>
  `${v.num(n)} ${n === 1 ? one : many}`;

/** A sentence part only when the detail came: « (campo X)». */
const inField = (v: Voice, d: Readonly<Record<string, unknown>>): string =>
  d.field === undefined ? "" : ` (campo ${v.text(d.field)})`;

const notTheFormat = (d: Readonly<Record<string, unknown>>, v: Voice): string =>
  `El archivo no tiene el formato esperado: ${d.line === undefined ? "una línea" : `la línea ${v.text(d.line)}`}`;

/** What each kind of field of the schema has to be, as the person would say it. */
const FIELD_KINDS: Readonly<Record<string, { words: string; example?: string }>> = {
  string: { words: "un texto que no esté vacío" },
  decimal: { words: "un número decimal sin signo", example: "123.45" },
  signed_decimal: { words: "un número decimal", example: "123.45" },
  positive_decimal: { words: "un número decimal mayor que cero", example: "123.45" },
  negative_decimal: { words: "un número decimal negativo" },
  non_positive_decimal: { words: "un número decimal cero o negativo" },
  non_negative_integer: { words: "un entero no negativo" },
  positive_integer: { words: "un entero mayor que cero" },
  date: { words: "una fecha", example: "AAAA-MM-DD" },
  currency: { words: "un código de divisa de tres letras", example: "EUR" },
  country: { words: "un país de dos letras", example: "ES" },
  ratio: { words: "un ratio", example: "4, 0.25 o 4/3" },
  unit_interval: { words: "un número entre 0 y 1" },
  boolean: { words: "verdadero o falso" },
};

const KIND_OF = /is not a valid (\w+)$/;

const invalidFieldSay: Say = (d, v, message) => {
  const where = `${v.fields(d.field ?? d.fields)} no es válido en ${v.kind(d.type)}`;
  const kind = KIND_OF.exec(message)?.[1];
  if (kind !== undefined) {
    const received = d.value === undefined ? "" : ` (recibido: ${v.evidence(d.value)})`;
    return `${where}: tiene que ser ${FIELD_KINDS[kind]?.words ?? kind}${received}.`;
  }
  const exactlyOne = /exactly one of (\w+) or (\w+) is required/.exec(message);
  if (exactlyOne !== null) {
    return `Hace falta exactamente uno de ${v.field(exactlyOne[1])} o ${v.field(exactlyOne[2])} en ${v.kind(d.type)}: ni los dos ni ninguno.`;
  }
  if (message.includes("an asset cannot be swapped for itself")) {
    return "Una permuta no puede cambiar un activo por sí mismo.";
  }
  if (message.includes("value_date must not precede trade_date")) {
    return "La fecha valor no puede ser anterior a la fecha de la operación.";
  }
  if (message.includes("sold_currency and bought_currency must differ")) {
    return "Las divisas vendida y comprada han de ser distintas.";
  }
  return d.field === undefined && d.fields === undefined
    ? `Los datos de ${v.kind(d.type)} no son coherentes entre sí.`
    : `${where}.`;
};

/** The console also says which rule of the schema it was, in the domain's own words. */
const invalidFieldCli: Say = (_d, _v, message) => {
  const kind = KIND_OF.exec(message)?.[1];
  if (kind !== undefined) {
    const example = FIELD_KINDS[kind]?.example;
    return example === undefined ? "" : `Por ejemplo: ${example}.`;
  }
  const known =
    /exactly one of|an asset cannot be swapped for itself|value_date must not precede trade_date|sold_currency and bought_currency must differ/.test(
      message,
    );
  return known ? "" : `(${message})`;
};

export const ERRORS_LEDGER: Record<string, Entry> = {
  // The console draws the list of what is invalid under this sentence; the web has a screen for it.
  invalid_events: {
    say: (d, v) =>
      `Tus datos tienen ${v.count(d.affected) === 1 ? "un movimiento inválido" : `${v.count(d.affected)} movimientos inválidos`}: rectifícalos antes de compactar.`,
    web: () => "Está en Ajustes → Verificación.",
  },
  // --- Rectification ---
  reversal_of_reversal: () =>
    "No se puede anular una anulación: vuelve a registrar el evento original.",
  already_reversed: () => "Ese evento ya está anulado.",
  // What it records already happened: the compaction ran without verifying that fingerprint.
  waiver_not_reversible: () =>
    "No se puede anular la renuncia a verificar una huella: registra una compactación que ya ocurrió, y anular la línea que lo cuenta no la deshace. No hay nada que deshacer.",
  waiver_filing_unknown: {
    say: () =>
      "Una renuncia a verificar una huella nombra una declaración que no está en tus datos.",
    cli: (d, v) => `Declaración ${v.text(d.filing_id)}: es una renuncia a nada.`,
  },
  reversal_target_missing: {
    say: () => "El movimiento que se quiere anular no está en tus datos.",
    cli: (d, v) => `Evento: ${v.text(d.reverses_id ?? d.id)}.`,
  },
  not_found: {
    say: () => "Ese movimiento no está en tus datos.",
    cli: (d, v) => `Evento: ${v.text(d.reverses_id ?? d.id)}.`,
  },
  dependent_events: {
    say: () => "Hay movimientos posteriores que se apoyan en este: rectifícalos antes.",
    cli: (d, v) => `Evento: ${v.text(d.target_id)}.`,
  },
  second_live_correction: {
    say: () =>
      "Ese movimiento ya tiene una corrección en vigor: solo puede tener una. Para cambiarlo otra vez, edita la corrección, no el original.",
    cli: (d, v) =>
      `Es ${v.text(d.corrects_id)}, con la corrección ${v.text(d.live_correction_id)} en vigor; anula antes esa corrección, o corrígela a ella (ADR-0026).`,
  },
  dangling_correction: {
    say: () =>
      "La corrección apunta a un movimiento que no está anulado: una corrección va siempre con su anulación.",
    cli: (d, v) => `Movimiento: ${v.text(d.corrects_id)} (ADR-0003).`,
  },
  dangling_reference: {
    say: (d, v) =>
      `Hay ${counted(v, v.count(d.event_ids ?? d.ids), "referencia", "referencias")} a movimientos que no están en tus datos.`,
    cli: (d, v) => `Referencias: ${v.many(d.event_ids ?? d.ids)}.`,
  },
  // --- Local config, price and symbols files ---
  invalid_local_config: {
    say: () =>
      "La configuración local de la carpeta (atlas.config.json) no se entiende. Corrígela en la carpeta o bórrala para volver a los valores por defecto.",
    cli: (d, v) => (d.field === undefined ? "" : `Campo: ${v.text(d.field)}.`),
  },
  invalid_price_config: {
    say: () => "La configuración de las fuentes de precios de la carpeta no se entiende.",
    web: () => "La escribe el usuario: corrígela desde la consola.",
    cli: (d, v) =>
      `Fichero prices/config.json${inField(v, d)}: corrígelo o bórralo para volver a los valores por defecto. La aplicación nunca lo escribe.`,
  },
  invalid_price_status: {
    say: () =>
      "El registro de las fuentes de precios de la carpeta no se entiende: la consola no descargará nada hasta que se arregle, porque dice lo gastado hoy de cada cupo.",
    cli: (d, v) => `Fichero prices/_status.json${inField(v, d)}.`,
  },
  invalid_symbols_file: {
    say: () => "La correspondencia de símbolos importada no se entiende.",
    web: () =>
      "Se arregla desde la consola, declarando otra vez los símbolos, y se vuelve a importar.",
    cli: (d, v) =>
      `Fichero prices/symbols.json${inField(v, d)}: corrígelo, o vuelve a declarar los símbolos con «atlas prices symbols set».`,
  },
  symbols_file_newer_version: {
    say: () =>
      "La correspondencia de símbolos importada es de una versión más nueva de la aplicación.",
    web: () => "Recarga la aplicación para actualizarla.",
    cli: (d, v) =>
      `Fichero prices/symbols.json, formato ${v.text(d.format)}: esta consola no lo lee ni lo escribe. Actualiza la aplicación.`,
  },
  // Said by the console only.
  invalid_cloud_pull: (d, v) =>
    `prices/_cloud.json, lo que la carpeta guarda de su última descarga de la nube, no se entiende (${v.text(d.field)}): bórralo y vuelve a ejecutar «atlas prices update», que lo rehace sin tocar ningún cierre.`,
  json_key_repeated: {
    say: () =>
      "Un fichero de precios importado repite un dato y dice dos cosas a la vez: no se usa.",
    web: () => "Se arregla desde la consola y se vuelve a importar.",
    cli: (d, v) =>
      `${v.text(d.file)}${d.line === undefined ? "" : `, línea ${v.text(d.line)},`} repite la clave ${v.text(d.key)}. Quita una de las dos; la aplicación nunca escribe una clave dos veces.`,
  },
  symbols_file_unknown_key: {
    say: () => "La correspondencia de símbolos importada tiene un dato que no es suyo.",
    web: () => "Se arregla desde la consola y se vuelve a importar.",
    cli: (d, v) =>
      `La clave de primer nivel ${v.text(d.key)} no es suya: quítala de prices/symbols.json. Solo lleva symbols_format y assets; nunca se sube ni se lee con otra cosa.`,
  },
  symbols_misstored_pending: {
    say: (d, v) =>
      `${v.one(d.asset_id)} tiene cierres${d.source === undefined ? "" : ` de ${v.text(d.source)}`} guardados en una divisa equivocada, pendientes de purgar: mientras tanto no se puede quitar esa fuente ni el activo, porque volverían a contar en euros sin aviso.`,
    web: () => "Se purgan desde la consola.",
    cli: (d, v) =>
      `Púrgalos con «atlas prices purge ${v.text(d.asset_id)} --source ${v.text(d.source)}».`,
  },
  symbols_not_declared: {
    say: (d, v) =>
      `${v.one(d.asset_id)} no tiene símbolo declarado para ${d.source === undefined ? "esa fuente" : v.text(d.source)}: no hay con qué comparar sus cierres.`,
    web: () => "Se declara desde la consola.",
    cli: () => "Declara antes su símbolo y su divisa con «atlas prices symbols set».",
  },
  price_file_newer_version: {
    say: (d, v) =>
      `Los precios de ${v.one(d.asset_id)} los escribió una versión más nueva de la aplicación: ese activo se queda sin precio automático y no se añade nada a su fichero.`,
    web: () => "Recarga la aplicación para actualizarla.",
    cli: (d, v) =>
      `Fichero prices/${v.text(d.asset_id)}.jsonl, línea ${v.text(d.line)}. Actualiza la aplicación.`,
  },
  price_line_invalid: {
    say: (d, v) =>
      `Los precios de ${v.one(d.asset_id)} tienen una línea que no se entiende: ese activo se queda sin precio automático, porque nunca se leen a medias.`,
    cli: (d, v) =>
      `Fichero prices/${v.text(d.asset_id)}.jsonl, línea ${v.text(d.line)}${inField(v, d)}.`,
  },
  // --- Amounts settled by the broker ---
  broker_settled_eur_in_eur: {
    say: () =>
      "Lo liquidado por el bróker en euros solo se indica en una operación en otra divisa: en euros repetiría el importe.",
    cli: () => "Opción --broker-settled-eur.",
  },
  broker_settled_eur_negative: {
    say: () =>
      "Lo liquidado por el bróker en euros nunca es negativo: el sentido lo da el tipo de movimiento. Indica lo que movió el bróker, sin signo.",
    cli: () => "Opción --broker-settled-eur.",
  },
  broker_settled_eur_zero: {
    say: () =>
      "Lo liquidado por el bróker en euros no puede ser cero en una compra, una venta o una comisión. Si el extracto no da la cifra, déjalo vacío (sin él, la cifra queda como desconocida).",
    cli: () => "Opción --broker-settled-eur.",
  },
  // --- ECB history ---
  ecb_history_unreadable: {
    say: (d, v) =>
      `El histórico del BCE no tiene el formato esperado${d.line === undefined ? "" : ` (línea ${v.text(d.line)})`}: no se ha usado.`,
    web: () => "Descárgalo otra vez con la consola o importa el archivo del BCE.",
    cli: () => "Vuelve a descargarlo con `atlas fx update`.",
  },
  ecb_history_future: {
    say: (d, v) =>
      `El histórico del BCE trae un día posterior a hoy${d.latest === undefined ? "" : ` (${v.date(d.latest)})`}: no se ha usado.`,
    web: () => "Comprueba la fecha del dispositivo o descarga el archivo otra vez.",
    cli: () => "Comprueba la fecha del equipo y vuelve a descargarlo con `atlas fx update`.",
  },
  ecb_history_empty: {
    say: () => "El histórico del BCE no trae ninguna publicación: no se ha usado.",
    web: () => "Descárgalo otra vez con la consola o importa el archivo del BCE.",
    cli: () => "Vuelve a descargarlo con `atlas fx update`.",
  },
  // --- Size limits and drafts ---
  line_too_large: () =>
    "Una línea es demasiado larga para guardarse en la nube: acórtala, por ejemplo las notas.",
  ledger_too_large: () =>
    "Los datos de la nube han llegado al tamaño máximo que admiten: no se ha guardado nada más.",
  draft_not_needed: {
    say: () => "Ningún tipo de esta operación está esperando al BCE: regístrala como siempre.",
    web: () => "No hace falta borrador.",
    cli: () => "Sin --draft.",
  },
  draft_changed: {
    say: (d) =>
      d.now === "gone"
        ? "Ese borrador ya no está pendiente: se ha confirmado o descartado en otro dispositivo, en otra pestaña, en la consola o desde otra orden. No se ha registrado nada."
        : "Ese borrador se está confirmando en otro sitio (ya lleva el id de su registro): no se ha registrado nada.",
    web: (d) =>
      d.now === "gone"
        ? "Mira tus movimientos y tus borradores."
        : "Mira tus borradores dentro de un momento.",
    cli: (d) =>
      d.now === "gone"
        ? "Ya no está en drafts/: consulta `atlas draft list` y el libro."
        : "Espera y consulta `atlas draft list`.",
  },
  draft_unreadable: {
    say: () => "Un borrador no tiene el formato esperado: no se ha tocado.",
    cli: () => "Está en drafts/: revísalo a mano; puede ser la única copia de una operación.",
  },
  // --- Ledger state ---
  ledger_has_invalid_events: {
    say: (d, v) =>
      `Tus datos ya tenían ${counted(v, Number(d.invalid_count ?? 0), "movimiento inválido", "movimientos inválidos")} antes de esta operación, y sobre unos datos así solo se puede escribir un cambio de configuración. El primero es ${v.kind(d.offending_type)}: ${v.evidence(d.offending_error)}.`,
    web: () => "Arréglalo en Ajustes → Verificación.",
    cli: (d, v) =>
      `Es el evento ${v.text(d.offending_id)}. Ejecuta \`atlas check\` y rectifícalo antes (ADR-0015).`,
  },
  duplicate_fingerprint: {
    say: () =>
      "Ya hay un movimiento idéntico en tus datos. Si es una repetición legítima, confírmalo.",
    cli: () => "Añade --confirm-duplicate.",
  },
  duplicate_id: () => "Hay dos movimientos con el mismo identificador: tus datos están dañados.",
  unsupported_event: {
    say: (d, v) =>
      `El tipo de evento «${v.text(d.type)}» es de una versión posterior de la aplicación y esta no lo entiende.`,
    cli: () => "Está reservado para una feature posterior y esta CLI no lo proyecta.",
  },
  unknown_event_type: (d, v) => `Tipo de evento desconocido: «${v.text(d.type)}».`,
  negative_position: (d, v) =>
    `Posición negativa en ${
      typeof d.key === "string"
        ? d.key
            .split("|")
            .map((part) => v.one(part))
            .join(" · ")
        : "una cuenta"
    }: falta una compra o sobra una venta.`,
  lots_mismatch: (d, v) =>
    `Los lotes fiscales de ${v.one(d.asset_id)} no cuadran con la posición física.`,
  filing_fingerprint_lines: () =>
    "Una declaración presentada dice que se calculó sobre otros movimientos de los que tiene delante en el archivo: se ha insertado o quitado una línea antes de ella.",
  filing_fingerprint_mismatch: () =>
    "Los movimientos anteriores a una declaración presentada ya no son los que había cuando se presentó (editados a mano). Recupera la copia anterior a la edición.",
  // Not an edit: they are there but cannot be read in the format the fingerprint declares.
  filing_fingerprint_unreadable: {
    say: () =>
      "Los movimientos anteriores a una declaración presentada no se pueden leer en el formato que dice su huella: no se puede comprobar. No es una edición y no hay copia que restaurar.",
    cli: () =>
      "Para poder compactar, acéptalo a propósito con «atlas compact --accept-unverified <id>», y quedará registrado.",
  },
  filing_fingerprint_waived: () =>
    "La huella de una declaración presentada nunca llegó a comprobarse, y tú lo diste por bueno para poder compactar: queda registrado, con su motivo y su fecha.",
  // --- Store and schema ---
  conflict: {
    say: () => "Tus datos han cambiado desde que se cargaron.",
    web: () => "La CLI u otra pestaña han escrito: se recargan y se vuelve a intentar.",
    cli: () => "Repite el comando.",
  },
  schema_too_new: {
    say: (d, v) =>
      `Tus datos los ha escrito una versión más nueva de la aplicación (formato ${v.text(d.found)}; esta entiende hasta el ${v.text(d.supported)}).`,
    web: () => "Actualiza la aplicación recargando con conexión.",
    cli: () => "Actualiza la aplicación.",
  },
  missing_migration: (d, v) =>
    `Esta aplicación no sabe leer el formato ${v.text(d.from ?? d.version)} de tus datos.`,
  archive_exists: (d, v) =>
    `El archivo ${v.text(d.archive_name)} ya existe y nunca se sobrescribe.`,
  projection_changed: {
    say: () => "La reescritura cambiaría los cálculos: no se ha escrito nada.",
    cli: (d, v) => (d.keys === undefined ? "" : `Cambia: ${v.many(d.keys)}.`),
  },
  // --- Line shape ---
  invalid_line: {
    say: (d, v) => `${notTheFormat(d, v)} no es un evento.`,
    cli: (d, v) => (d.value === undefined ? "" : `Contenido: ${v.text(d.value)}.`),
  },
  invalid_json: {
    say: (d, v) => `${notTheFormat(d, v)} no se puede leer como datos de Atlas.`,
    cli: () => "No es JSON válido: el fichero no es un libro de Atlas.",
  },
  // An annulment cannot be annulled: its only remedy is the file itself.
  duplicate_key: {
    say: (d) =>
      d.type === "reversal"
        ? "Esta anulación repite un campo en su línea (lo deja así una edición a mano del archivo): cuenta como inválida, no anula nada y no se sincroniza. Una anulación no se puede anular: corrígela a mano en el archivo, quitando el campo repetido."
        : "Esta operación repite un campo en su línea (lo deja así una edición a mano del archivo): se lee con el último valor, pero cuenta como inválida y no se sincroniza. Anúlala y regístrala bien.",
    cli: (d) =>
      d.type === "reversal" ? "" : "Anúlala (atlas delete) y registra el evento correcto.",
  },
  invalid_envelope: (d, v) =>
    `La cabecera de la línea no es válida (falta o sobra ${v.field(d.field)}).`,
  missing_field: (d, v) => `Falta ${v.field(d.field)} en ${v.kind(d.type)}.`,
  invalid_field: { say: invalidFieldSay, cli: invalidFieldCli },
  invalid_decimal: {
    say: (d, v) =>
      `Valor numérico no válido: ${v.text(d.value)}. Se escribe con coma decimal, por ejemplo 123,45.`,
    cli: () => "Las cadenas decimales se escriben como 123.45.",
  },
  invalid_date: {
    say: (d, v) => `${v.field(d.field)} tiene que ser una fecha válida.`,
    cli: () => "Formato YYYY-MM-DD.",
  },
  invalid_instant: {
    say: () => "La fecha de registro del evento no es válida.",
    cli: () => "Es la marca de tiempo recorded_at.",
  },
  invalid_currency: {
    say: (d, v) => `Divisa no válida: ${v.text(d.value)} (tres letras, como EUR o USD).`,
    cli: () => "Es un código ISO 4217.",
  },
  invalid_fx_rate: (d, v) => `Tipo de cambio no válido: ${v.text(d.value)}.`,
  // It cannot happen: every operation carries the rate of its currency. If it does, it is a defect.
  fx_rate_unknown: {
    say: (d, v) =>
      `Hay saldo en ${v.text(d.currency)} y no consta ningún tipo del BCE para esa divisa, así que no se puede valorar. Es un fallo de la aplicación, no de tus datos.`,
    cli: () =>
      "No debería poder pasar, porque toda operación lleva su tipo: repórtalo con el libro a mano.",
  },
  ulid_overflow: () => "Se han agotado los identificadores de este milisegundo: repite la acción.",
};
