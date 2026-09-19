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
  "model_720_alert_threshold_eur",
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
    `${count(d.assets) === 1 ? "Falta el precio" : "Faltan precios"} a ${day(d.date)}: ${n.many(d.assets)}. ${count(d.assets) === 1 ? "Regístralo" : "Regístralos"} con una valoración.`,
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
  reversal_target_missing: () => "El movimiento que se quiere anular no está en tus datos.",
  not_found: () => "Ese movimiento no está en tus datos.",
  dependent_events: () => "Hay movimientos posteriores que se apoyan en este: rectifícalos antes.",
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
  // --- Store and schema --------------------------------------------------
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
