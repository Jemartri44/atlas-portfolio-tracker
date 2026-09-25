// Domain error codes in Spanish, with the remedy **of the web**.
//
// The domain speaks English by contract (`errors.ts`) and each interface
// translates: the CLI sends you to a command, the web to the screen where it is
// fixed (decision (i) of the prompt). A drift test checks that both catalogues
// cover every code the domain can raise, and an unknown code falls back to the
// domain's own message so a new error is never swallowed.
//
// A message is read by the user, so it names things the way the screens do:
// fields by their label, types by their Spanish name, dates as dd/mm/aaaa, and
// never an identifier of an event or a document of the project.
//
// LINE BUDGET: one entry per code the domain can raise — about ninety — and
// the value of the file is reading them side by side, which is how a message
// that still says "amount" or cites a document gets caught. Splitting it by
// area would scatter the drift test's target over five files.

import type { DomainError } from "@atlas/domain";
import { type Naming, NO_NAMES, namingOf } from "../names.js";
import { countOf } from "../number.js";
import { type Figures, figuresOf, maskFigures, type Prose } from "../privacy.js";
import {
  count,
  type Details,
  day,
  enumValue,
  field,
  fields,
  kind,
  num,
  setting,
  text,
} from "./prose.js";

/**
 * The failures of the remote one by one (`docs/api.md` §7; feature 014), each
 * with its own sentence. Exported so that a test holds it level with the
 * closed list of the domain.
 */
export const REMOTE_FAILURES: Readonly<Record<string, string>> = {
  unauthenticated: "la nube pide iniciar sesión.",
  credentials_ambiguous:
    "la petición llevaba dos credenciales a la vez; es un fallo de la aplicación.",
  session_invalid: "la sesión ha caducado: vuelve a iniciar sesión.",
  device_token_invalid: "la credencial de este dispositivo no vale.",
  device_token_revoked: "la credencial de este dispositivo está revocada.",
  device_token_expired: "la credencial de este dispositivo ha caducado.",
  not_allowed: "esa cuenta de Google no está en la lista permitida.",
  forbidden_for_credential: "esta credencial no puede hacer eso; es un fallo de la aplicación.",
  origin_rejected: "la petición no venía de la propia aplicación.",
  body_invalid: "la nube no ha entendido la petición; es un fallo de la aplicación.",
  body_not_json: "la petición no tenía el formato esperado; es un fallo de la aplicación.",
  precondition_required:
    "la petición no decía sobre qué versión escribía; es un fallo de la aplicación.",
  precondition_failed: "otro dispositivo ha escrito en la nube a la vez.",
  init_rejected: "la nube no ha aceptado tus datos para empezar.",
  not_found: "esa ruta de la nube no existe; es un fallo de la aplicación.",
  internal: "la nube ha tenido un fallo interno y no ha escrito nada.",
  transport_rejected: "la red ha rechazado la petición antes de llegar a la nube.",
  network_failed: "no hay conexión con la nube.",
};

/** «El archivo no tiene el formato esperado: la línea 3», or without a line when none came. */
const notTheFormat = (d: Details): string =>
  `El archivo no tiene el formato esperado: ${d.line === undefined ? "una línea" : `la línea ${text(d.line)}`}`;

/**
 * The settings whose value is an **amount**. The rest of them are percentages,
 * points, whole days or a country code, and those stay visible: `invalid_settings`
 * is the one message whose figure changes meaning with the field it names.
 */
const MONEY_SETTINGS: ReadonlySet<string> = new Set([
  "monthly_contribution_eur",
  "bucket_max_cumulative_contribution",
  "model_720_threshold_eur",
  "model_720_increase_eur",
  "model_720_alert_threshold_eur",
  "model_721_threshold_eur",
  "model_721_increase_eur",
  "model_721_alert_threshold_eur",
]);

export const ERROR_MESSAGES: Record<string, (d: Details, n: Naming, f: Figures) => string> = {
  // --- Catalogue ---------------------------------------------------------
  unknown_account: (d, n) => `La cuenta ${n.one(d.account_id)} no existe.`,
  unknown_asset: (d, n) => `El activo ${n.one(d.asset_id)} no existe.`,
  // --- Corporate actions composed from parameters (feature 007) ------------
  missing_source_document: (d) =>
    `Un evento corporativo de tipo ${enumValue(d.kind)} necesita su fuente documental: la dirección o el PDF de la nota del emisor. No es opcional.`,
  missing_effect_parameter: (d) =>
    `Falta ${field(d.parameter)}: un evento corporativo de tipo ${enumValue(d.kind)} no se puede componer sin ese dato.`,
  no_wizard_for_kind: (d) =>
    `Un evento corporativo de tipo ${enumValue(d.kind)} no tiene formulario: sus efectos se indican uno a uno, y eso de momento solo se hace desde la CLI.`,
  fee_account_not_selling: (d, n) =>
    `La cuenta ${n.one(d.account_id)} no participa en la venta forzosa, así que no puede llevar comisión.`,
  duplicate_account: (d, n) => `La cuenta ${n.one(d.account_id)} ya existe.`,
  duplicate_asset: (d, n) => `El activo ${n.one(d.asset_id)} ya existe.`,
  duplicate_isin: (d, n) =>
    `El ISIN ${text(d.isin)} ya es de ${n.one(d.existing_asset_id)}: un mismo valor no puede ser dos activos, porque la regla de recompra y el FIFO los tratarían como distintos. Registra las operaciones en ${n.one(d.existing_asset_id)}.`,
  asset_book_change: (d, n) =>
    `El activo ${n.one(d.asset_id)} no puede pasar de la cartera principal al cubo ni al revés: da de alta un activo nuevo.`,
  asset_type_change: (d, n) =>
    `El activo ${n.one(d.asset_id)} no puede cambiar de tipo (${enumValue(d.from)} → ${enumValue(d.to)}): alteraría la fecha fiscal de todas sus operaciones. Da de alta un activo nuevo.`,
  asset_currency_change: (d, n) =>
    `El activo ${n.one(d.asset_id)} no puede cambiar de divisa (${text(d.from)} → ${text(d.to)}): alteraría la base de coste de todas sus operaciones. Da de alta un activo nuevo.`,
  account_book_change: (d, n) =>
    `La cuenta ${n.one(d.account_id)} tiene operaciones registradas: ya no puede pasar de la cartera principal al cubo ni al revés.`,
  book_mismatch: () =>
    "La cuenta y el activo pertenecen a carteras distintas: la cartera principal y el cubo no se mezclan.",
  // --- Bucket theses -----------------------------------------------------
  thesis_required: () =>
    "Las compras del cubo exigen una tesis abierta antes de comprar. Ábrela en Registrar → Abrir una tesis y vuelve.",
  unknown_thesis: (d, n) => `La tesis ${n.thesis(d.thesis_id)} no existe.`,
  thesis_mismatch: (d, n) =>
    `La tesis ${n.thesis(d.thesis_id)} es de ${n.one(d.asset_id)} en ${n.one(d.account_id)}, no de esta operación.`,
  thesis_not_open: (d, n) =>
    `La tesis ${n.thesis(d.thesis_id)} no está abierta en ese momento: se abre antes de comprar y no se cierra antes.`,
  thesis_not_allowed: (d, n) =>
    `Solo las cuentas del cubo llevan tesis; ${n.one(d.account_id)} es de la cartera principal.`,
  duplicate_thesis: (d) =>
    `Ya hay una tesis con el identificador «${text(d.thesis_id)}»: elige otro.`,
  thesis_already_open: (d, n) =>
    `Ya hay una tesis abierta sobre ${n.one(d.asset_id)} en ${n.one(d.account_id)}: ciérrala antes.`,
  thesis_already_closed: (d, n) => `La tesis ${n.thesis(d.thesis_id)} ya está cerrada.`,
  not_bucket: (d, n) =>
    `Una tesis exige cuenta y activo del cubo (${n.one(d.account_id)}, ${n.one(d.asset_id)}).`,
  // --- Corporate actions -------------------------------------------------
  effects_not_allowed_for_kind: (d) =>
    `Un evento corporativo de tipo ${enumValue(d.kind)} no admite esa combinación de efectos: revisa el tipo elegido.`,
  liquidation_must_cover_all_accounts: (d, n) =>
    `Una liquidación vende todo en exactamente las cuentas con posición de ${n.one(d.asset_id)} (faltan: ${n.many(d.missing)}; sobran: ${n.many(d.extra)}; parciales: ${n.many(d.partial)}).`,
  no_open_lots: (d, n) =>
    `El activo ${n.one(d.asset_id)} no tiene lotes abiertos en la fecha de efecto: no hay nada que transformar.`,
  same_asset: (d, n) => `El activo de destino no puede ser el propio ${n.one(d.asset_id)}.`,
  duplicate_account_in_effect: (d, n) =>
    `La cuenta ${n.one(d.account_id)} aparece dos veces en el mismo efecto.`,
  invalid_ratio: (d) =>
    `Proporción no válida: ${num(d.value)}. Escribe un número positivo (1,5) o una fracción de títulos nuevos entre antiguos (4/3).`,
  // --- Operations --------------------------------------------------------
  insufficient_position: (d, n, f) =>
    `La cuenta ${n.one(d.account_id)} no tiene suficiente ${n.one(d.asset_id)} en esa fecha (disponibles: ${f.titles(d.available)}).`,
  insufficient_lots: (d, n, f) =>
    `Los lotes abiertos de ${n.one(d.asset_id)} no cubren la cantidad (abiertos: ${f.titles(d.open ?? d.missing)}).`,
  missing_basis: () =>
    "Falta la base de la operación: indica el importe liquidado o el precio unitario.",
  not_transferable: (d, n) =>
    d.asset_id === undefined
      ? "Un traspaso fiscal exige que los dos activos sean traspasables."
      : `El activo ${n.one(d.asset_id)} no es traspasable: un traspaso fiscal exige que los dos lo sean.`,
  not_core_asset: (d, n) =>
    `El activo ${n.one(d.asset_id)} no pertenece a la cartera principal: el simulador de traspaso solo opera sobre ella.`,
  eur_fx_rate_not_one: (d) =>
    `${field(d.field)} debe ser exactamente 1 cuando la divisa es el euro (recibido: ${num(d.value)}): el BCE no publica un tipo del euro contra sí mismo.`,
  fx_rate_date_weekend: (d) =>
    `${field(d.field)} (${day(d.value)}) cae en fin de semana y el BCE no publica: usa el último día hábil anterior.`,
  transfer_fee_not_allowed: () =>
    "Un traspaso no lleva comisión: registra el cargo del depositario como una comisión aparte.",
  currency_mismatch: (d) => `No se pueden operar ${text(d.left)} con ${text(d.right)}.`,
  division_by_zero: () => "División por cero en un cálculo interno: no se ha registrado nada.",
  invalid_amount: (d, _n, f) =>
    `El importe debe ser mayor que cero (recibido: ${f.money(d.value)}).`,
  invalid_quantity: (d, _n, f) =>
    `La cantidad debe ser mayor que cero (recibido: ${f.titles(d.value)}).`,
  // --- Views that need prices or settings --------------------------------
  missing_manual_prices: (d, n) =>
    `${count(d.assets) === 1 ? "Falta un precio en euros" : "Faltan precios en euros"} a ${day(d.date)}: ${n.many(d.assets)}. Registra una valoración o, si tiene una cotización en otra divisa, trae el histórico del BCE.`,
  missing_target_weights: () =>
    "No hay pesos objetivo configurados: fíjalos en Ajustes → Configuración.",
  missing_bucket_pct: () =>
    "Falta el porcentaje del cubo sobre la aportación: fíjalo en Ajustes → Configuración.",
  missing_amount: () =>
    "Falta el importe de la aportación: indícalo, o fija la aportación mensual en Ajustes → Configuración.",
  no_target_weight_in_table: (d, n) =>
    `Los pesos objetivo vigentes no apuntan a ningún activo de la cartera principal${
      count(d.assets) === 0 ? " (la tabla está vacía)" : `: ${n.many(d.assets)} están todos al 0 %`
    }. Revísalos en Ajustes → Configuración.`,
  split_not_exact: (d, _n, f) =>
    `El reparto de la aportación no cuadra (${f.money(d.distributed)} repartidos de ${f.money(d.core)}): es un fallo interno de la calculadora, no registres nada.`,
  // --- Settings ----------------------------------------------------------
  invalid_settings: (d, _n, f) => {
    // `min` and `max` are the bounds written in the domain, not the user's
    // money: they say what is allowed and they stay visible.
    const received = MONEY_SETTINGS.has(text(d.field)) ? f.money(d.value) : num(d.value);
    if (d.total !== undefined) {
      return `Los pesos objetivo deben sumar 100 y suman ${num(d.total)}.`;
    }
    if (d.min !== undefined) {
      const range =
        d.max === undefined
          ? `${num(d.min)} o mayor`
          : `un valor entre ${num(d.min)} y ${num(d.max)}`;
      return `${setting(d.field)} debe ser ${range} (recibido: ${received}).`;
    }
    if (d.value === undefined) {
      return `Falta ${setting(d.field)}.`;
    }
    return `${setting(d.field)} no admite ese valor (recibido: ${received}).`;
  },
  invalid_wash_sale_window: (d) =>
    `La ventana de recompra de ${enumValue(d.asset_type)} no es válida: elige dos meses, un año o un número de días.`,
  // --- What was filed (ADR-0020) -----------------------------------------
  filing_year_unsupported: (d) =>
    `El ${enumValue(d.model)} no existe para el ejercicio ${num(d.tax_year)}: el primero que puedes registrar es ${num(d.first_supported)}.`,
  filed_at_not_after_year: (d) =>
    `Una declaración del ejercicio ${num(d.tax_year)} no se pudo presentar el ${day(d.filed_at)}: la fecha tiene que ser posterior al final de ese ejercicio.`,
  filed_at_in_future: (d) =>
    `La presentaste el ${day(d.filed_at)}, que es posterior a hoy: no se registra lo que todavía no se ha presentado.`,
  as_of_before_year_end: (d) =>
    `El cálculo guardado con la declaración es del ${day(d.as_of)}, anterior al cierre de ${num(d.tax_year)}: no cubre el ejercicio entero.`,
  as_of_in_future: (d) =>
    `El cálculo guardado con la declaración es del ${day(d.as_of)}, posterior al día en que se registra: no se calcula en el futuro.`,
  duplicate_pending_loss: (d) =>
    `Los saldos pendientes declarados repiten el ejercicio ${num(d.origin_year)} en ${enumValue(d.category)}: cada origen va una sola vez.`,
  duplicate_filed_item: (d, n) =>
    `Los bienes declarados repiten ${n.one(d.asset_id ?? d.account_id)}: cada uno va una sola vez.`,
  alert_above_threshold: (d, _n, f) =>
    `El aviso previo del Modelo ${num(d.model)} (${f.money(d.alert)}) no puede superar el umbral que obliga a presentarlo (${f.money(d.threshold)}): nunca llegaría a saltar.`,
  // Named in words and never by its key: there are only two fields, and a
  // fallback to the raw name would print `renta_season_start` at the user.
  invalid_renta_season: (d) =>
    d.value === undefined
      ? `La temporada de Renta empieza el ${num(d.start)} y termina el ${num(d.end)}: el inicio no puede ser posterior al fin.`
      : `${text(d.field) === "renta_season_end" ? "El fin" : "El inicio"} de la temporada de Renta se escribe como MM-DD, mes y día (recibido: ${num(d.value)}).`,
  tax_ledger_invalid: (d) =>
    `Tus datos tienen ${num(d.count)} ${Number(d.count) === 1 ? "movimiento inválido" : "movimientos inválidos"}: un cálculo fiscal sobre ellos sería aproximado. Repáralo antes en Ajustes → Verificación.`,
  tax_year_unsupported: (d) =>
    `El cálculo fiscal aplica el régimen de compensación vigente desde ${num(d.first_supported)}; ${num(d.year)} es anterior.`,
  // The value received is the user's word, shown as typed (`num` only turns a
  // number into Spanish, and leaves a word as it is).
  invalid_fiscal_date_rule: (d) =>
    `La fecha fiscal de ${enumValue(d.asset_type)} debe ser la de contratación o la fecha valor (recibido: ${num(d.value)}): decide el ejercicio de cada operación.`,
  invalid_income_category: (d) =>
    `La categoría de renta de ${enumValue(d.asset_type)} debe ser ganancia patrimonial o rendimiento del capital mobiliario (recibido: ${num(d.value)}): decide en qué parte de la base del ahorro entra cada venta.`,
  negative_target_weight: (d, n) =>
    `El peso objetivo de ${n.one(d.asset_id)} no puede ser negativo (recibido: ${num(d.value)}).`,
  accept_invalid_not_allowed: (d) =>
    `Sobre eventos que quedan inválidos solo puede escribirse un cambio de configuración, no ${kind(d.type)}.`,
  newly_invalid_events: (d) =>
    `Este cambio de configuración deja inválidos ${countOf(count(d.affected), "evento ya registrado", "eventos ya registrados")}.`,
  // --- Rectification -----------------------------------------------------
  reversal_of_reversal: () =>
    "No se puede anular una anulación: vuelve a registrar el evento original.",
  already_reversed: () => "Ese evento ya está anulado.",
  // Lo que registra ya pasó: la compactación ocurrió sin verificar esa huella,
  // y anular la línea que lo cuenta no la deshace (ADR-0025).
  waiver_not_reversible: () =>
    "No se puede anular la renuncia a verificar una huella: registra una compactación que ya ocurrió, y anular la línea que lo cuenta no la deshace.",
  waiver_filing_unknown: () =>
    "Una renuncia a verificar una huella nombra una declaración que no está en tus datos.",
  reversal_target_missing: () => "El movimiento que se quiere anular no está en tus datos.",
  not_found: () => "Ese movimiento no está en tus datos.",
  dependent_events: () => "Hay movimientos posteriores que se apoyan en este: rectifícalos antes.",
  invalid_local_config: () =>
    "La configuración local de la carpeta (atlas.config.json) no se entiende. Corrígela en la carpeta o bórrala para volver a los valores por defecto.",
  invalid_price_config: () =>
    "La configuración de las fuentes de precios de la carpeta no se entiende. La escribe el usuario: corrígela desde la consola.",
  invalid_price_status: () =>
    "El registro de las fuentes de precios de la carpeta no se entiende: la consola no descargará nada hasta que se arregle.",
  invalid_symbols_file: () =>
    "La correspondencia de símbolos de la carpeta no se entiende. Se arregla desde la consola, declarando otra vez los símbolos.",
  symbols_file_newer_version: () =>
    "La correspondencia de símbolos de la carpeta es de una versión más nueva de la aplicación. Recarga la aplicación para actualizarla.",
  symbols_misstored_pending: (d, n) =>
    `${n.one(d.asset_id)} tiene cierres guardados en una divisa equivocada, pendientes de purgar desde la consola: mientras tanto no se puede quitar esa fuente ni el activo.`,
  symbols_not_declared: (d, n) =>
    `${n.one(d.asset_id)} no tiene símbolo declarado para esa fuente: no hay con qué comparar sus cierres. Se declara desde la consola.`,
  price_file_newer_version: (d, n) =>
    `Los precios de ${n.one(d.asset_id)} los escribió una versión más nueva de la aplicación: ese activo se queda sin precio automático. Recarga la aplicación para actualizarla.`,
  price_line_invalid: (d, n) =>
    `Los precios de ${n.one(d.asset_id)} tienen una línea que no se entiende: ese activo se queda sin precio automático, porque nunca se leen a medias.`,
  second_live_correction: () =>
    "Ese movimiento ya tiene una corrección en vigor: solo puede tener una. Para cambiarlo otra vez, edita la corrección, no el original.",
  broker_settled_eur_in_eur: () =>
    "Lo liquidado por el bróker en euros solo se indica en una operación en otra divisa: en euros repetiría el importe.",
  broker_settled_eur_negative: () =>
    "Lo liquidado por el bróker en euros nunca es negativo: el sentido lo da el tipo de movimiento.",
  broker_settled_eur_zero: () =>
    "Lo liquidado por el bróker en euros no puede ser cero en una compra, una venta o una comisión. Si el extracto no da la cifra, déjalo vacío.",
  ecb_history_unreadable: (d) =>
    `El histórico del BCE no tiene el formato esperado${d.line === undefined ? "" : ` (línea ${text(d.line)})`}: no se ha usado. Descárgalo otra vez con la consola o importa el archivo del BCE.`,
  draft_not_needed: () =>
    "Ningún tipo de esta operación está esperando al BCE: regístrala como siempre, no hace falta borrador.",
  draft_changed: (d) =>
    d.now === "gone"
      ? "Ese borrador ya no está en este navegador: se ha confirmado o descartado en otra pestaña. No se ha registrado nada; mira tus movimientos y tus borradores."
      : "Ese borrador se está confirmando en otra pestaña: no se ha registrado nada. Mira tus borradores dentro de un momento.",
  draft_unreadable: () =>
    "Un borrador guardado en este navegador no tiene el formato esperado: no se ha tocado.",
  ecb_history_empty: () =>
    "El histórico del BCE no trae ninguna publicación: no se ha usado. Descárgalo otra vez con la consola o importa el archivo del BCE.",
  dangling_correction: () => "La corrección apunta a un movimiento que no está anulado.",
  dangling_reference: (d) =>
    `Hay ${countOf(count(d.event_ids ?? d.ids), "referencia", "referencias")} a movimientos que no están en tus datos.`,
  // --- Orders and transfer requests --------------------------------------
  unknown_order: () => "La orden elegida no existe en esa fecha.",
  // The stage in Spanish, never the ledger's word: «(filled)» reached the screen.
  order_closed: (d) =>
    d.stage === "filled"
      ? "La orden elegida ya se ejecutó: otra operación la cerró."
      : `La orden elegida está ${enumValue(d.stage)}: ya no se puede ejecutar.`,
  order_mismatch: () =>
    "La orden elegida no coincide con la cuenta, el activo o el sentido de la operación.",
  unknown_request: () => "La solicitud de traspaso elegida no existe en esa fecha.",
  request_closed: (d) =>
    d.stage === "completed"
      ? "La solicitud de traspaso elegida ya se completó."
      : `La solicitud de traspaso elegida está ${enumValue(d.stage)}: ya no admite más pasos.`,
  request_mismatch: () =>
    "La solicitud de traspaso elegida se refiere a otras cuentas o a otros fondos.",
  // --- Ledger state ------------------------------------------------------
  ledger_has_invalid_events: (d, _n, f) => {
    const invalid = Number(d.invalid_count ?? 0);
    // `offending_error` is the domain's own message, in English and free-form:
    // it goes through the blunt masker, like any other raw evidence.
    return `Tus datos ya tenían ${countOf(invalid, "movimiento inválido", "movimientos inválidos")} antes de esta operación, y sobre unos datos así solo se puede escribir un cambio de configuración. El primero es ${kind(d.offending_type)}: ${f.evidence(d.offending_error)}. Arréglalo en Ajustes → Verificación.`;
  },
  invalid_events: (d) =>
    `Tus datos tienen ${countOf(count(d.affected), "movimiento inválido", "movimientos inválidos")}: rectifícalos antes (Ajustes → Verificación).`,
  duplicate_fingerprint: () =>
    "Ya hay un movimiento idéntico en tus datos. Si es una repetición legítima, confírmalo.",
  duplicate_id: () => "Hay dos movimientos con el mismo identificador: tus datos están dañados.",
  unsupported_event: (d) =>
    `El tipo de evento «${text(d.type)}» es de una versión posterior de la aplicación y esta no lo entiende.`,
  unknown_event_type: (d) => `Tipo de evento desconocido: «${text(d.type)}».`,
  negative_position: (d, n) =>
    `Posición negativa en ${
      typeof d.key === "string" ? n.many(d.key.split("|")).replace(", ", " · ") : "una cuenta"
    }.`,
  lots_mismatch: (d, n) =>
    `Los lotes fiscales de ${n.one(d.asset_id)} no cuadran con la posición física.`,
  filing_fingerprint_lines: () =>
    "Una declaración presentada dice que se calculó sobre otros movimientos de los que tiene delante en el archivo.",
  filing_fingerprint_mismatch: () =>
    "Los movimientos anteriores a una declaración presentada ya no son los que había cuando se presentó.",
  filing_fingerprint_unreadable: () =>
    "Los movimientos anteriores a una declaración presentada no se pueden leer en el formato que dice su huella: no se puede comprobar.",
  filing_fingerprint_waived: () =>
    "La huella de una declaración presentada nunca llegó a comprobarse, y tú lo diste por bueno para poder compactar.",
  // --- Store and schema --------------------------------------------------
  // --- The sync of the ledger (feature 014) ------------------------------
  // Why an operation is held back: it waits in «Retenidas» until you confirm,
  // redo or discard it, and nothing behind it goes up meanwhile. Resolving
  // never needs the rest of your data to be valid.
  domain_rejected: (d) =>
    `Retenida: con lo que ya hay en la nube, tus datos la rechazan${d.affected === undefined ? "" : ` y dejaría ${count(d.affected)} operaciones inválidas`}. Rehazla sobre lo actual o descártala en «Retenidas»; mientras, lo que va detrás espera y tus datos aquí pueden quedar incompletos.`,
  pair_rejected: (d) =>
    `Retenida la corrección entera, la anulación y la operación corregida juntas: con lo que ya hay en la nube no cabe${d.affected === undefined ? "" : ` y dejaría ${count(d.affected)} operaciones inválidas`}. No se ha subido ninguna de las dos. Rehazla o descártala en «Retenidas»; mientras, lo que va detrás espera y tus datos aquí pueden quedar incompletos.`,
  pair_not_contiguous: () =>
    "Retenida: la operación corregida no va justo detrás de su anulación, que es como se escriben siempre. Descártala o rehaz la corrección en «Retenidas».",
  pair_incomplete: () =>
    "La nube ha rechazado una anulación que anunciaba su corrección y no la traía detrás: se sube siempre la pareja entera.",
  pair_declaration_invalid: () =>
    "La nube ha rechazado la petición: una línea decía ser parte de una corrección sin serlo. Es un fallo de la aplicación.",
  line_unreadable: () => "La nube no ha podido leer una operación. Queda retenida.",
  line_invalid: () => "La nube ha rechazado una operación por su forma. Queda retenida.",
  schema_version_unsupported: () =>
    "La nube no conoce todavía el formato de esta operación. Queda retenida hasta que la nube se actualice.",
  recorded_at_in_future: () =>
    "Retenida: su hora de registro va por delante del reloj de la nube. Revisa la hora de este dispositivo y rehazla.",
  duplicate_unconfirmed: () =>
    "La nube pide confirmar una operación que parece repetida. Queda retenida: confírmala en «Retenidas» si de verdad son dos.",
  seal_mismatch: () =>
    "Retenida: la declaración ya no cuadra con los movimientos que tendría delante en la nube. Regístrala otra vez sobre tus datos actuales.",
  waiver_not_appendable: () =>
    "Una renuncia a verificar una huella solo nace al compactar en la consola y nunca se sube sola. Queda retenida.",
  seals_prefix: () =>
    "Retenida: es una declaración que sella los movimientos que tiene delante, y en la nube ya no son los mismos. Regístrala otra vez sobre tus datos actuales.",
  concurrent_settings: () =>
    "Retenida: la configuración también cambió en otro dispositivo, y cada cambio la guarda entera. Subirla borraría ese otro cambio: rehazla sobre la configuración actual.",
  concurrent_account: () =>
    "Retenida: esa cuenta también cambió en otro dispositivo, y cada cambio la guarda entera. Rehaz el cambio sobre la cuenta actual.",
  concurrent_asset: () =>
    "Retenida: ese activo también cambió en otro dispositivo, y cada cambio lo guarda entero. Rehaz el cambio sobre el activo actual.",
  new_duplicate: () =>
    "Retenida: con lo que ha llegado de otro dispositivo, parece repetida. Confírmala en «Retenidas» si son operaciones distintas, o descártala si es la misma.",
  new_closed_year: () =>
    "Retenida: cae en un ejercicio que otro dispositivo ha marcado como presentado. Confírmala si de verdad corresponde ahí; puede tocar rectificar la declaración.",
  settings_leave_invalid: () =>
    "Retenida: ese cambio de configuración dejaría inválidas operaciones que ya están en la nube, y la nube nunca recibe datos inválidos. Repara antes esas operaciones y rehaz el cambio.",
  partner_discarded: () =>
    "Retenida: descartaste la anulación de esta corrección, y una corrección sin su anulación no corrige nada: ni se sube ni se puede rehacer. Descártala también; si el cambio sigue siendo cierto, corrige de nuevo la operación en vigor.",
  absent_after_rewrite: () =>
    "Retenida al volver a descargar: la nube se ha reescrito y ya no tiene esta operación. Nunca se sube sola: regístrala otra vez si sigue siendo cierta, o descártala.",
  differs_after_rewrite: () =>
    "Retenida al volver a descargar: la nube tiene esta misma operación con otro contenido. Compara las dos y rehaz o descarta la tuya.",
  absent_at_join: () =>
    "Retenida al empezar desde la nube: la nube no tiene esta operación de tus datos anteriores, que quedan archivados. Regístrala si sigue siendo cierta, o descártala.",
  differs_at_join: () =>
    "Retenida al empezar desde la nube: la nube tiene esta operación con otro contenido. Compara y rehaz o descarta la tuya.",
  discarded_by_user: () => "Descartada por ti: queda aparte, fuera de tus datos.",
  redone: () => "Rehecha: la sustituye la operación registrada otra vez sobre tus datos actuales.",
  // Why a sync stops: nothing is lost and nothing is held back.
  local_prefix_changed: () =>
    "No se sincroniza: lo que este navegador tenía por sincronizado ya no coincide. No se ha subido nada.",
  remote_rewritten: () =>
    "No se sincroniza: los datos de la nube se han reescrito desde la última vez. No se ha subido nada. Cuando quieras, vuelve a descargarlos: lo que tenías y la nube no quedará retenido para que lo revises.",
  remote_schema_too_new: () =>
    "No se sincroniza: la nube usa un formato más nuevo que el de esta versión. Actualiza la aplicación recargando con conexión; lo pendiente espera aquí.",
  remote_unreadable: () =>
    "No se sincroniza: no se pueden leer los datos de la nube. Lo pendiente espera aquí.",
  remote_ledger_invalid: () =>
    "No se sincroniza: los datos de la nube tienen operaciones inválidas, y sobre ellos no se sube nada hasta repararlos. Lo pendiente espera aquí.",
  remote_failed: (d) =>
    `No se sincroniza: ${REMOTE_FAILURES[String(d.remote_code)] ?? "la nube ha respondido con un error."} Lo pendiente sigue pendiente; vuelve a intentarlo después.`,
  remote_contention: () =>
    "No se sincroniza: otro dispositivo ha escrito en la nube varias veces seguidas mientras lo intentábamos. Vuelve a intentarlo.",
  local_changed: () =>
    "No se sincroniza: tus datos han cambiado varias veces mientras sincronizábamos (otra pestaña escribe a la vez). Vuelve a intentarlo.",
  publish_failed: (d) =>
    `Sincronizado, pero no se ha podido avisar a la nube de lo que queda pendiente aquí (${REMOTE_FAILURES[String(d.remote_code)] ?? "error de la nube"}). Se hará en la próxima sincronización.`,
  // What a synced ledger refuses.
  compact_refused_folder_synced: () =>
    "Esa carpeta está sincronizada: se compacta la copia de la nube, no la carpeta.",
  compact_refused_marker_unreadable: () =>
    "No se compacta: no se puede leer el estado de la sincronización. Sincroniza primero.",
  compact_refused_marker_missing: () =>
    "No se compacta: falta el estado de la sincronización de una carpeta que se sincroniza. Sincroniza primero o desactiva la sincronización.",
  rewrite_refused_pending_here: () =>
    "No se reescriben los datos de la nube: aquí hay operaciones pendientes de subir. Sincroniza primero.",
  rewrite_refused_pending_devices: () =>
    "No se reescriben los datos de la nube: otros dispositivos tienen operaciones pendientes de subir.",
  rewrite_refused_marker_unreadable: () =>
    "No se reescriben los datos de la nube: no se puede leer el estado de la sincronización. Sincroniza primero.",
  rewrite_refused_marker_missing: () =>
    "No se reescriben los datos de la nube: falta el estado de la sincronización. Sincroniza primero.",
  import_refused_synced: () =>
    "No se importa: tus datos se sincronizan, e importar otro fichero borraría lo pendiente. Desactiva antes la sincronización.",
  deactivate_refused_pending: () =>
    "No se desactiva la sincronización: hay operaciones pendientes que nunca llegarían a la nube. Sincroniza primero; lo retenido se queda aquí de todas formas.",
  deactivate_refused_marker_missing: () =>
    "No se desactiva: falta el estado de la sincronización, así que no se sabe qué operaciones están pendientes. Sincroniza primero.",
  sync_not_configured: () =>
    "Tus datos no se sincronizan. Para empezar hay que elegirlo: subirlos enteros a una nube vacía, o unirte a una que ya tiene datos.",
  sync_deactivated: () =>
    "La sincronización está desactivada. Para volver a sincronizar hay que unirse otra vez, de forma explícita.",
  remote_empty: () =>
    "La nube está vacía y aquí no se ha sincronizado nada: no se sube operación a operación. Inicializa la nube con tus datos enteros, de forma explícita.",
  deactivate_refused_marker_unreadable: () =>
    "No se desactiva: no se puede leer el estado de la sincronización. Sincroniza primero.",
  init_refused_invalid_ledger: (d) =>
    `No se suben tus datos a la nube: tienen ${count(d.invalid)} operaciones inválidas, y la nube nunca recibe datos inválidos. Repáralas primero en Ajustes → Verificación.`,
  redo_filing_in_remote: () =>
    "Esa declaración ya está en la nube: rehacerla sería registrar otra presentación que no se hizo. Descártala.",
  redo_waits_for_pair: (d) =>
    `Todavía no: esta pareja corrige otra de la misma cadena que sigue retenida. Primero la pareja ${count(d.pair)}.`,
  redo_partner_discarded: () =>
    "No se rehace: descartaste su anulación, y una corrección sin su anulación no corrige nada. Descártala.",
  join_required: (d) =>
    `La sincronización de este navegador perdió su estado, y aquí hay ${count(d.own_lines)} operaciones que la nube no tiene. No se mezclan solas: unirse a la nube es siempre una elección explícita. No se ha tocado nada.`,
  accept_invalid_while_synced: (d) =>
    `Tus datos se sincronizan, y este cambio dejaría ${count(d.affected)} operaciones inválidas: tus datos quedarían inválidos, no se podrían sincronizar y la sincronización se pararía. Repara antes esas operaciones (Ajustes → Verificación) o desactiva la sincronización de forma explícita.`,
  held_unit_unknown: () => "Ya no hay nada retenido ahí: puede que ya se haya resuelto.",
  redo_not_recorded: () =>
    "Todavía no están registradas las operaciones que la rehacen, con los identificadores que se reservaron: regístralas primero; lo retenido sigue donde estaba.",
  resolution_not_offered: () => "Eso no se puede hacer con esta operación retenida.",
  sync_marker_unreadable: () => "No se puede leer el estado de la sincronización.",
  sync_held_unreadable: () =>
    "No se pueden leer las operaciones retenidas o descartadas. No se tocan: hay que revisarlas antes de seguir.",
  raw_line_break: (d) =>
    `La línea ${text(d.line)} de tus datos lleva dentro un salto de línea o un retorno de carro: el fichero tiene finales de línea de Windows, que solo deja una edición a mano, y así no se escribe tal cual. Conviértelo a finales LF en la consola, desde la carpeta del libro, con la orden que da «atlas» para este mismo error (copia antes el fichero en ledger.jsonl.crlf y cambia solo los finales de línea), y después vuelve a sincronizar. Aquí no se puede importar un fichero mientras la sincronización esté configurada.`,
  conflict: () =>
    "Tus datos han cambiado desde que se cargaron (la CLI u otra pestaña han escrito): se recargan y se vuelve a intentar.",
  schema_too_new: (d) =>
    `Tus datos los ha escrito una versión más nueva de la aplicación (formato ${text(d.found)}; esta entiende hasta el ${text(d.supported)}): actualiza la aplicación recargando con conexión.`,
  missing_migration: (d) =>
    `Esta aplicación no sabe leer el formato ${text(d.from ?? d.version)} de tus datos.`,
  archive_exists: (d) => `El archivo ${text(d.archive_name)} ya existe y nunca se sobrescribe.`,
  projection_changed: () => "La reescritura cambiaría los cálculos: no se ha escrito nada.",
  // --- Line shape --------------------------------------------------------
  // What the reader needs: the file is not what was expected, and where.
  invalid_line: (d) => `${notTheFormat(d)} no es un evento.`,
  invalid_json: (d) => `${notTheFormat(d)} no se puede leer como datos de Atlas.`,
  invalid_envelope: (d) => `La cabecera de la línea no es válida (${field(d.field)}).`,
  missing_field: (d) => `Falta ${field(d.field)} en ${kind(d.type)}.`,
  invalid_field: (d) =>
    d.field === undefined && d.fields === undefined
      ? `Los datos de ${kind(d.type)} no son coherentes entre sí.`
      : `${fields(d.field ?? d.fields)} no es válido en ${kind(d.type)}.`,
  invalid_decimal: (d) =>
    `Valor numérico no válido: ${text(d.value)}. Se escribe con coma decimal, por ejemplo 123,45.`,
  invalid_date: (d) => `${field(d.field)} tiene que ser una fecha válida.`,
  invalid_instant: () => "La fecha de registro del evento no es válida.",
  invalid_currency: (d) => `Divisa no válida: ${text(d.value)} (tres letras, como EUR o USD).`,
  invalid_fx_rate: (d) => `Tipo de cambio no válido: ${text(d.value)}.`,
  // It cannot happen: every operation carries the rate of its currency. If it
  // ever does, it is a defect and the sentence says so rather than inviting the
  // user to fix something that is not his to fix.
  fx_rate_unknown: (d) =>
    `Hay saldo en ${text(d.currency)} y no consta ningún tipo del BCE para esa divisa, así que no se puede valorar. Es un fallo de la aplicación, no de tus datos.`,
  ulid_overflow: () => "Se han agotado los identificadores de este milisegundo: repite la acción.",
};

/**
 * Spanish text of a domain error; an unknown code falls back to its own
 * message, with its figures masked because nothing here can tell which of them
 * is an amount. With no catalogue every identifier prints as itself
 * (`NO_NAMES`).
 */
export const describeError = (error: DomainError, prose: Prose): string => {
  const render = ERROR_MESSAGES[error.code];
  return render === undefined
    ? maskFigures(error.message, prose.privacy)
    : render(error.details as Details, namingOf(prose.names ?? NO_NAMES), figuresOf(prose.privacy));
};
