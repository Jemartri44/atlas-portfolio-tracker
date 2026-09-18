// Domain error codes in Spanish, with the remedy **of the web**.
//
// The domain speaks English by contract (`errors.ts`) and each interface
// translates: the CLI sends you to a command, the web to the screen where it is
// fixed (decision (i) of the prompt). A drift test checks that both catalogues
// cover every code the domain can raise, and an unknown code falls back to the
// domain's own message so a new error is never swallowed.

import type { DomainError } from "@atlas/domain";
import { type Naming, NO_NAMES, namingOf } from "../names.js";
import { type Figures, figuresOf, maskFigures, type Prose } from "../privacy.js";

type Details = Record<string, unknown>;

const text = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

const list = (value: unknown): string =>
  Array.isArray(value) ? value.map((entry) => text(entry)).join(", ") : text(value);

const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

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
    `Un evento corporativo de tipo ${text(d.kind)} necesita su fuente documental: la URL o el PDF del emisor. No es opcional.`,
  missing_effect_parameter: (d) =>
    `Falta ${text(d.parameter)}: un evento corporativo de tipo ${text(d.kind)} no se puede componer sin ese dato.`,
  no_wizard_for_kind: (d) =>
    `El tipo ${text(d.kind)} no se compone a partir de un formulario: sus efectos hay que indicarlos uno a uno, y eso todavía solo lo hace la CLI.`,
  fee_account_not_selling: (d, n) =>
    `La cuenta ${n.one(d.account_id)} no participa en la venta forzosa, así que no puede llevar comisión.`,
  duplicate_account: (d, n) => `La cuenta ${n.one(d.account_id)} ya existe.`,
  duplicate_asset: (d, n) => `El activo ${n.one(d.asset_id)} ya existe.`,
  asset_book_change: (d, n) =>
    `El activo ${n.one(d.asset_id)} no puede cambiar de libro (ADR-0009): da de alta un activo nuevo.`,
  asset_type_change: (d, n) =>
    `El activo ${n.one(d.asset_id)} no puede cambiar de tipo (${text(d.from)} → ${text(d.to)}): alteraría la fecha fiscal de todas sus operaciones. Da de alta un activo nuevo.`,
  asset_currency_change: (d, n) =>
    `El activo ${n.one(d.asset_id)} no puede cambiar de divisa (${text(d.from)} → ${text(d.to)}): alteraría la base de coste de todas sus operaciones. Da de alta un activo nuevo.`,
  account_book_change: (d, n) =>
    `La cuenta ${n.one(d.account_id)} tiene operaciones registradas: su libro ya no puede cambiar.`,
  book_mismatch: () =>
    "La cuenta y el activo pertenecen a libros distintos: el núcleo y el cubo no se mezclan.",
  // --- Bucket theses -----------------------------------------------------
  thesis_required: (d) =>
    `Las compras del cubo exigen una tesis abierta antes de comprar (regla 15). Ábrela desde la CLI con \`atlas thesis open --account ${text(d.account_id)} --asset ${text(d.asset_id)}…\`: el asistente de tesis llega en la versión siguiente.`,
  unknown_thesis: (d) => `La tesis ${text(d.thesis_id)} no existe.`,
  thesis_mismatch: (d, n) =>
    `La tesis ${text(d.thesis_id)} es de ${n.one(d.asset_id)} en ${n.one(d.account_id)}, no de esta operación.`,
  thesis_not_open: (d) =>
    `La tesis ${text(d.thesis_id)} no está abierta en este punto del libro: se abre antes de comprar y no se cierra antes.`,
  thesis_not_allowed: (d, n) =>
    `Solo las cuentas del cubo llevan tesis; ${n.one(d.account_id)} es del núcleo.`,
  duplicate_thesis: (d) => `La tesis ${text(d.thesis_id)} ya existe.`,
  thesis_already_open: (d, n) =>
    `Ya hay una tesis abierta (${text(d.thesis_id)}) sobre ${n.one(d.asset_id)} en ${n.one(d.account_id)}: ciérrala antes.`,
  thesis_already_closed: (d) => `La tesis ${text(d.thesis_id)} ya está cerrada.`,
  not_bucket: (d, n) =>
    `Una tesis exige cuenta y activo del cubo (${n.one(d.account_id)}, ${n.one(d.asset_id)}).`,
  // --- Corporate actions -------------------------------------------------
  effects_not_allowed_for_kind: (d) =>
    `El subtipo ${text(d.kind)} no admite la secuencia de efectos ${list(d.effects)}; admitidas: ${list(d.allowed)}.`,
  liquidation_must_cover_all_accounts: (d, n) =>
    `Una liquidación vende todo en exactamente las cuentas con posición de ${n.one(d.asset_id)} (faltan: ${n.many(d.missing)}; sobran: ${n.many(d.extra)}; parciales: ${n.many(d.partial)}).`,
  no_open_lots: (d, n) =>
    `El activo ${n.one(d.asset_id)} no tiene lotes abiertos en la fecha de efecto: no hay nada que transformar.`,
  same_asset: (d, n) => `El activo de destino no puede ser el propio ${n.one(d.asset_id)}.`,
  duplicate_account_in_effect: (d, n) =>
    `La cuenta ${n.one(d.account_id)} aparece dos veces en el mismo efecto.`,
  invalid_ratio: (d) =>
    `Proporción no válida: ${text(d.value)} (un decimal positivo, o una fracción nuevas/antiguas como 4/3).`,
  // --- Operations --------------------------------------------------------
  insufficient_position: (d, n, f) =>
    `La cuenta ${n.one(d.account_id)} no tiene suficiente ${n.one(d.asset_id)} en esa fecha (disponible: ${f.quantity(d.available)}).`,
  insufficient_lots: (d, n, f) =>
    `Los lotes abiertos de ${n.one(d.asset_id)} no cubren la cantidad (abiertos: ${f.quantity(d.open ?? d.missing)}).`,
  missing_basis: (d) =>
    `Falta la base de la operación: indica el importe o el precio unitario (${text(d.type ?? "operación")}).`,
  not_transferable: (d, n) =>
    d.asset_id === undefined
      ? "Un traspaso fiscal exige que los dos activos sean traspasables."
      : `El activo ${n.one(d.asset_id)} no es traspasable: un traspaso fiscal exige que los dos lo sean.`,
  not_core_asset: (d, n) =>
    `El activo ${n.one(d.asset_id)} no pertenece al núcleo: el simulador de traspaso solo opera sobre la cartera principal.`,
  eur_fx_rate_not_one: (d) =>
    `${text(d.field)} debe ser exactamente 1 cuando la divisa es el euro (recibido: ${text(d.value)}): el BCE no publica un tipo del euro contra sí mismo.`,
  fx_rate_date_weekend: (d) =>
    `${text(d.field)} (${text(d.value)}) cae en fin de semana y el BCE no publica: usa el último día hábil anterior.`,
  transfer_fee_not_allowed: () =>
    "Un traspaso no lleva comisión: registra el cargo del depositario como una comisión aparte.",
  currency_mismatch: (d) => `No se pueden operar ${text(d.left)} con ${text(d.right)}.`,
  division_by_zero: () => "División por cero en un cálculo interno: no se ha registrado nada.",
  invalid_amount: (d, _n, f) =>
    `El importe debe ser mayor que cero (recibido: ${f.money(d.value)}).`,
  invalid_quantity: (d, _n, f) =>
    `La cantidad debe ser mayor que cero (recibido: ${f.quantity(d.value)}).`,
  // --- Views that need prices or settings --------------------------------
  missing_manual_prices: (d, n) =>
    `Faltan precios a ${text(d.date)}: ${n.many(d.assets)}. Regístralos con una valoración.`,
  missing_target_weights: () =>
    "No hay pesos objetivo configurados: fíjalos en Ajustes → Configuración.",
  missing_bucket_pct: () =>
    "Falta el porcentaje del cubo sobre la aportación: fíjalo en Ajustes → Configuración.",
  missing_amount: () =>
    "Falta el importe de la aportación: indícalo, o fija la aportación mensual en Ajustes → Configuración.",
  no_target_weight_in_table: (d, n) =>
    `Los pesos objetivo vigentes no apuntan a ningún activo del núcleo${
      count(d.assets) === 0 ? " (la tabla está vacía)" : `: ${n.many(d.assets)} están todos al 0 %`
    }. Casi seguro es un identificador mal escrito en los pesos objetivo: revísalos en Ajustes → Configuración.`,
  split_not_exact: (d, _n, f) =>
    `El reparto de la aportación no cuadra (${f.money(d.distributed)} repartidos de ${f.money(d.core)}): es un fallo interno de la calculadora, no registres nada.`,
  // --- Settings ----------------------------------------------------------
  invalid_settings: (d, _n, f) => {
    // `min` and `max` are the bounds written in the domain, not the user's
    // money: they say what is allowed and they stay visible.
    const received = MONEY_SETTINGS.has(text(d.field)) ? f.money(d.value) : text(d.value);
    if (d.total !== undefined) {
      return `Los pesos objetivo deben sumar 100 y suman ${text(d.total)}.`;
    }
    if (d.min !== undefined) {
      const range =
        d.max === undefined
          ? `${text(d.min)} o mayor`
          : `un valor entre ${text(d.min)} y ${text(d.max)}`;
      return `${text(d.field)} debe ser ${range} (recibido: ${received}).`;
    }
    if (d.value === undefined) {
      return `Falta el parámetro ${text(d.field)}.`;
    }
    return `${text(d.field)} no admite ese valor (recibido: ${received}).`;
  },
  invalid_wash_sale_window: (d) =>
    `La ventana de recompra de ${text(d.asset_type)} debe ser 2m, 1y o <n>d (recibido: ${text(d.value)}).`,
  negative_target_weight: (d, n) =>
    `El peso objetivo de ${n.one(d.asset_id)} no puede ser negativo (recibido: ${text(d.value)}).`,
  accept_invalid_not_allowed: (d) =>
    `Solo un cambio de configuración puede escribirse sobre eventos que quedan inválidos, no un ${text(d.type)} (ADR-0015).`,
  newly_invalid_events: (d) =>
    `Este cambio de configuración deja inválidos ${count(d.affected)} eventos ya registrados.`,
  // --- Rectification -----------------------------------------------------
  reversal_of_reversal: () =>
    "No se puede anular una anulación: vuelve a registrar el evento original.",
  already_reversed: () => "Ese evento ya está anulado.",
  reversal_target_missing: (d) => `El evento ${text(d.reverses_id ?? d.id)} no existe.`,
  not_found: (d) => `El evento ${text(d.id ?? d.reverses_id)} no existe.`,
  dependent_events: (d) =>
    `El evento ${text(d.target_id)} ha sido consumido por eventos posteriores: rectifícalos antes.`,
  dangling_correction: (d) => `La corrección apunta a ${text(d.corrects_id)}, que no está anulado.`,
  dangling_reference: (d) => `Referencia colgante: ${list(d.event_ids ?? d.ids)}.`,
  // --- Orders and transfer requests --------------------------------------
  unknown_order: (d) => `La orden ${text(d.order_id)} no existe en esa fecha.`,
  order_closed: (d) => `La orden ${text(d.order_id)} ya está cerrada (${text(d.stage)}).`,
  order_mismatch: (d) =>
    `La orden ${text(d.order_id)} no coincide con la cuenta, el activo o el sentido de la operación.`,
  unknown_request: (d) => `La solicitud de traspaso ${text(d.request_id)} no existe en esa fecha.`,
  request_closed: (d) =>
    `La solicitud de traspaso ${text(d.request_id)} ya está cerrada (${text(d.stage)}).`,
  request_mismatch: (d) =>
    `La solicitud de traspaso ${text(d.request_id)} se refiere a otras cuentas o activos.`,
  // --- Ledger state ------------------------------------------------------
  ledger_has_invalid_events: (d, _n, f) => {
    const invalid = Number(d.invalid_count ?? 0);
    // `offending_error` is the domain's own message, in English and free-form:
    // it goes through the blunt masker, like any other raw evidence.
    return `El libro ya tenía ${invalid} ${
      invalid === 1 ? "evento inválido" : "eventos inválidos"
    } antes de esta operación: sobre un libro degradado solo se puede escribir un cambio de configuración (ADR-0015). El primero es ${text(d.offending_type)} ${text(d.offending_id)}: ${f.evidence(d.offending_error)}. Arréglalo en Ajustes → Verificación.`;
  },
  invalid_events: (d) =>
    `El libro tiene ${count(d.affected)} eventos inválidos: rectifícalos antes (Ajustes → Verificación).`,
  duplicate_fingerprint: (d) =>
    `Ya existe un evento con la misma huella (${list(d.existing)}). Si es una repetición legítima, confírmalo.`,
  duplicate_id: () => "Hay dos eventos con el mismo identificador: el libro está corrupto.",
  unsupported_event: (d) =>
    `El tipo de evento ${text(d.type)} está reservado para una versión posterior y esta aplicación no lo proyecta.`,
  unknown_event_type: (d) => `Tipo de evento desconocido: ${text(d.type)}.`,
  negative_position: (d) => `Posición negativa en ${text(d.key ?? "una cuenta")}.`,
  lots_mismatch: (d, n) =>
    `Los lotes fiscales de ${n.one(d.asset_id)} no cuadran con la posición física.`,
  // --- Store and schema --------------------------------------------------
  conflict: () =>
    "El libro ha cambiado desde que se cargó (la CLI u otra pestaña han escrito): se recarga y se vuelve a intentar.",
  schema_too_new: (d) =>
    `El libro usa la versión de esquema ${text(d.found)} y esta aplicación entiende hasta la ${text(d.supported)}: actualiza la aplicación (recarga con conexión).`,
  missing_migration: (d) => `Falta la migración de la versión ${text(d.from ?? d.version)}.`,
  archive_exists: (d) => `El archivo ${text(d.archive_name)} ya existe y nunca se sobrescribe.`,
  projection_changed: (d) =>
    `La reescritura cambiaría la proyección (${list(d.keys)}): no se ha escrito nada.`,
  // --- Line shape --------------------------------------------------------
  invalid_line: (d) =>
    `Línea no válida${d.line === undefined ? "" : ` (${text(d.line)})`}: ${text(d.value ?? "no es un objeto JSON")}.`,
  invalid_json: (d) =>
    `La línea ${text(d.line ?? "")} no es JSON válido: el fichero no es un libro de Atlas.`,
  invalid_envelope: (d) => `El sobre de la línea no es válido: falta o sobra ${text(d.field)}.`,
  missing_field: (d) => `Falta el campo ${text(d.field)} en ${text(d.type)}.`,
  invalid_field: (d) => `El campo ${text(d.field ?? d.fields)} de ${text(d.type)} no es válido.`,
  invalid_decimal: (d) =>
    `Valor numérico no válido: ${text(d.value)} (se escriben como texto decimal, por ejemplo 123,45).`,
  invalid_date: (d) => `La fecha de ${text(d.field)} debe tener el formato aaaa-mm-dd.`,
  invalid_instant: () => "La marca de tiempo del evento no es válida.",
  invalid_currency: (d) => `Divisa no válida: ${text(d.value)} (tres letras, ISO 4217).`,
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
