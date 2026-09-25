// Projection warnings in Spanish, with the remedy of the web. Same contract as
// the errors: keyed by `code`, unknown codes fall back to the domain message,
// and the drift test keeps this catalogue level with the CLI's.
//
// LINE BUDGET: it is a **catalogue**, one entry per warning code the domain can
// raise, and the exhaustiveness test demands that every one of them be here.
// Splitting it by subject would only move the same entries to another file and
// make "is this code translated?" a question with several places to look.

import type { Warning } from "@atlas/domain";
import { valueLabel } from "../labels.js";
import { type Naming, NO_NAMES, namingOf } from "../names.js";
import { countOf } from "../number.js";
import { type Figures, figuresOf, maskFigures, type Prose } from "../privacy.js";
import {
  count,
  type Details,
  day,
  days,
  enumValue,
  missingOf,
  num,
  pct,
  pp,
  pricesOf,
  text,
} from "./prose.js";

/** Why a quote has no value in euros (feature 013, §6.4 (i)). */
export const fxMissingText = (reason: unknown): string =>
  reason === "not_yet_published"
    ? "el BCE aún no ha publicado el tipo de esa fecha"
    : reason === "currency_not_published"
      ? "el BCE no publica esa divisa; una subunidad como GBX no es su divisa"
      : reason === "currency_stale"
        ? "el BCE dejó de publicar esa divisa"
        : "no hay histórico del BCE en esta web";

/** A tax year is a name, not a quantity: "2027", never "2.027". */
const year = (value: unknown): string =>
  /^\d{4}$/.test(String(value)) ? String(value) : num(value);

/** The wash-sale window by its real name: calling a one-year window "two months" is fiscally false. */
const windowText = (window: unknown): string => {
  const value = text(window);
  if (value === "2m") {
    return "ventana de dos meses";
  }
  if (value === "1y") {
    return "ventana de un año";
  }
  return `ventana de ${value.slice(0, -1)} días`;
};

/** The names of a detail that lists assets, one per asset. */
const names = (ids: unknown, n: Naming): string[] =>
  (Array.isArray(ids) ? ids : ids === undefined ? [] : [ids]).map((id) => n.one(id));

/** Why a control rule of the bucket could not be measured, and what is missing. */
const gapText = (d: Details, n: Naming): string => {
  const missing = [
    ...((d.assets as string[] | undefined) ?? []).map((id) => n.one(id)),
    ...((d.currencies as string[] | undefined) ?? []),
  ];
  const detail = missing.length === 0 ? "" : ` (${missingOf(missing)})`;
  switch (d.reason) {
    case "missing_prices":
      return `hay posiciones del cubo sin precio${detail}`;
    case "no_contribution":
      return "todavía no hay aporte bruto al cubo sobre el que medir";
    case "partial_net_worth":
      return `el patrimonio total es parcial${detail}`;
    default:
      return "el patrimonio total no es positivo";
  }
};

/** "de hace 17 días (01/09/2026)": the age of a price or a rate, and its date. */
const age = (d: Details): string => `de hace ${days(d.age_days)} (${day(d.date)})`;

/** Why a box of the return is not the whole of what the form will hold. */
const PARTIAL_BOX: Record<string, string> = {
  reductions_unknown:
    "La base liquidable resta dos remanentes de reducciones que no están en tus datos: te damos la base imponible, no el importe de la casilla",
  treaty_limit_only:
    "La deducción por doble imposición es la menor de dos límites y solo conocemos el primero: te damos ese, no el importe de la casilla",
  ledger_withholdings_only:
    "Solo contamos las retenciones que constan en tus datos, que no tienen por qué ser todas",
};

export const WARNING_MESSAGES: Record<string, (d: Details, n: Naming, f: Figures) => string> = {
  // --- Core weights ------------------------------------------------------
  unknown_target_weight: (d, n) =>
    `Hay un peso objetivo para ${n.one(d.asset_id)}, que no es ningún activo de la cartera principal: revísalo en la configuración.`,
  asset_without_target: (d, n) =>
    `${n.one(d.asset_id)} tiene posición y ningún peso objetivo asignado.`,
  deviation_above_threshold: (d, n) =>
    `${n.one(d.asset_id)} se desvía ${pp(d.deviation_pp)} del objetivo (umbral ${pp(d.threshold_pp).replace(/^\+/, "")}). Rebalancear vendiendo es una decisión tuya, una vez al año.`,
  satellite_below_minimum: (d) =>
    `${valueLabel(d.asset_class)} pesa ${pct(d.weight_pct)}, por debajo del mínimo de un satélite, que es del ${pct(d.minimum_pct)}; o 0 % o al menos el mínimo.`,
  partial_core_total: (d, n) =>
    `${pricesOf(names(d.assets, n))} a ${day(d.date)}: no se calculan pesos sobre un total parcial.`,
  // --- Prices and rates --------------------------------------------------
  stale_price: (d, n) =>
    `${n.one(d.asset_id)}: el precio es ${age(d)}; registra una valoración más reciente.`,
  stale_fx_rate: (d) =>
    `El tipo de cambio aplicado a ${text(d.currency)} es ${age(d)}; registra una operación o una valoración más reciente en esa divisa.`,
  // --- Tracking ----------------------------------------------------------
  transfer_overdue: (d, n) =>
    `El traspaso de ${n.one(d.from_asset_id)} a ${n.one(d.to_asset_id)} lleva ${days(d.days_open)} abierto, más de los ${text(d.max_days)} configurados. Reclama a la gestora: mientras dure, el dinero no está invertido ni en el origen ni en el destino.`,
  partial_net_worth: (d, n) =>
    `El patrimonio a ${day(d.date)} es parcial: ${missingOf([
      ...names(d.assets, n),
      ...((d.currencies as string[] | undefined) ?? []),
    ])}.`,
  partial_bucket_total: (d, n) =>
    `${pricesOf(names(d.assets, n))} a ${day(d.date)}: el total del cubo solo cubre lo que sí tiene precio.`,
  // --- Bucket ------------------------------------------------------------
  bucket_sample_too_small: (d) =>
    Number(d.closed_theses) === 0 && Number(d.realized_operations) === 0
      ? "Todavía no hay ninguna tesis cerrada ni ninguna venta: las estadísticas del cubo empiezan con la primera."
      : `Solo ${countOf(Number(d.closed_theses), "tesis cerrada", "tesis cerradas")} y ${countOf(Number(d.realized_operations), "operación realizada", "operaciones realizadas")}: por debajo de ${text(d.sample)} operaciones la muestra no distingue habilidad de suerte.`,
  bucket_contaminated_theses: (d, n) =>
    `${count(d.theses) === 1 ? "Una tesis queda" : `${count(d.theses)} tesis quedan`} fuera de las medias (${((d.theses as unknown[] | undefined) ?? []).map((id) => n.thesis(id)).join("; ")}): sus ventas consumieron lotes comprados por otra tesis, porque el FIFO es global.`,
  bucket_contribution_exceeded: (d, _n, f) =>
    `El aporte bruto al cubo (${f.money(d.gross_eur)}) supera el tope de ${f.money(d.limit_eur)}. Las retiradas no devuelven margen: el cubo no se repone con dinero de fuera.`,
  bucket_contribution_near_limit: (d, _n, f) =>
    `El aporte bruto al cubo (${f.money(d.gross_eur)}) pasa del 80 % del tope de ${f.money(d.limit_eur)}.`,
  bucket_stop_loss_reached: (d, _n, f) =>
    `REGLA DE PARADA: la pérdida acumulada del cubo (${f.money(d.loss_eur)}) es el ${pct(d.loss_pct)} del aporte bruto (${f.money(d.gross_eur)}), por encima del ${pct(d.limit_pct)} configurado: toca dejar de aportar al cubo. La aplicación avisa; la decisión es tuya.`,
  bucket_stop_loss_not_evaluated: (d, n) =>
    `La regla de parada (${pct(d.limit_pct)}) no se ha podido evaluar: ${gapText(d, n)}. Sin ese dato no hay control de pérdida acumulada, no es que no la haya.`,
  bucket_weight_not_evaluated: (d, n) =>
    `La regla de peso (${pct(d.limit_pct)}) no se ha podido evaluar: ${gapText(d, n)}. Sin ese dato no hay control de peso del cubo, no es que esté dentro.`,
  bucket_weight_exceeded: (d) =>
    `El cubo pesa el ${pct(d.weight_pct)} del patrimonio total, por encima del ${pct(d.limit_pct)} configurado: valora traspasar el exceso a la cartera principal.`,
  missing_benchmark_asset: () =>
    "No hay índice de referencia configurado: fíjalo en Ajustes → Configuración.",
  unknown_benchmark_asset: (d, n) =>
    `El índice de referencia ${n.one(d.asset_id)} no está en el catálogo: la comparación queda sin dato.`,
  missing_benchmark_price: (d, n) =>
    `Falta el precio del índice ${n.one(d.asset_id)} a ${day(d.date)}: la comparación queda sin dato (nunca se estima).`,
  weights_use_approximation: (d, n) =>
    `Los pesos de ${n.many(d.assets)} se apoyan en una aproximación por su ETF de referencia, no en un valor liquidativo: el reparto de la aportación depende de una estimación.`,
  price_without_eur_value: (d, n) =>
    `${n.one(d.asset_id)}: la cotización en ${text(d.currency)} del ${day(d.date)} no tiene tipo del BCE (${fxMissingText(d.reason)}); se enseña en su divisa y falta su valor en euros, así que no suma en ningún total.`,
  // --- Operations --------------------------------------------------------
  currency_mismatch: (d, n) =>
    `El evento está en ${text(d.currency)} y el activo ${n.one(d.asset_id)} está en ${text(d.asset_currency)}.`,
  fx_rate_date_after_fiscal_date: (d) =>
    `La fecha del tipo de cambio (${day(d.fx_rate_date)}) es posterior a la fecha fiscal (${day(d.fiscal_date)}).`,
  same_asset_two_accounts: (d, n) =>
    `${n.one(d.asset_id)} está ahora en ${count(d.accounts)} cuentas; el FIFO sigue siendo global, entre todas ellas.`,
  sell_without_thesis: (d, n) =>
    `La venta de ${n.one(d.asset_id)} en ${n.one(d.account_id)} no está enlazada a ninguna tesis.`,
  thesis_size_exceeded: (d, n, f) =>
    `La tesis ${n.thesis(d.thesis_id)} lleva ${f.money(d.invested_eur)} invertidos, por encima de los ${f.money(d.planned_size_eur)} previstos.`,
  thesis_closed_with_position: (d, n, f) =>
    `La tesis ${n.thesis(d.thesis_id)} está cerrada, pero ${n.one(d.account_id)} sigue teniendo ${f.titles(d.position)} de ${n.one(d.asset_id)}.`,
  // --- Wash-sale window --------------------------------------------------
  wash_sale_window_repurchase: (d, n, f) =>
    `Compra del ${day(d.buy_date)} de ${f.titles(d.buy_quantity)} de ${n.one(d.asset_id)} dentro de la ventana de su venta con pérdida del ${day(d.sale_date)} (${f.money(d.loss_eur)}; ${windowText(d.window)}, hasta el ${day(d.window_end)}): puede hacer que esa pérdida no sea computable en ${year(d.tax_year)}.`,
  wash_sale_window_prior_buy: (d, n, f) =>
    `Venta con pérdida de ${n.one(d.asset_id)} del ${day(d.sale_date)} (${f.money(d.loss_eur)}) cuando en cartera hay todavía ${f.titles(d.held_quantity)} de una compra del ${day(d.buy_date)}, dentro de la ventana abierta el ${day(d.window_start)} (${windowText(d.window)}): la pérdida puede no ser computable en ${year(d.tax_year)}.`,

  // --- Swap (ADR-0021) ----------------------------------------------------
  swap_fiscal_dates_differ: (d, n) =>
    `En la permuta, ${n.one(d.from_asset_id)} tiene fecha fiscal ${day(d.fiscal_date_out)} y ${n.one(d.to_asset_id)} la tiene ${day(d.fiscal_date_in)}: la transmisión y la adquisición caen en días distintos porque sus tipos de activo usan reglas distintas.`,

  // --- Tax report (feature 009) --------------------------------------------
  tax_quota_not_computed: () =>
    "Esto es la base del ahorro, no la cuota ni lo que se paga: el mínimo personal, la base general y el tipo medio efectivo no están en tus datos.",
  // **Una causa que no se puede sostener no se reparte en silencio**
  // (ADR-0024). Omitir las causas es lo que el código ya hacía; decir por qué
  // es lo que no hacía.
  tax_filing_prefix_unverified: (d) =>
    `La huella de la declaración presentada no cubre los movimientos que tiene delante${d.reason === "waived" ? " y la diste por no verificable" : ""}: la diferencia con lo declarado no se reparte en sus cuatro causas.`,
  tax_double_taxation_partial: () =>
    "Doble imposición: solo se calcula el primer límite, el del convenio. El segundo exige la declaración entera, y lo que no se deduce se pierde.",
  // The country is the code the ledger keeps (US, IE): `num` leaves it as it is.
  tax_treaty_rate_missing: (d, _n, f) =>
    `No hay tipo de convenio configurado para ${num(d.country)}: no se calcula deducción por los ${f.money(d.foreign_tax_eur)} retenidos.`,
  tax_dividend_without_country: (d, _n, f) =>
    `El dividendo no dice qué país lo pagó: no se calcula deducción por los ${f.money(d.foreign_tax_eur)} retenidos en origen.`,
  tax_fx_differences_not_computed: (d) =>
    `Las diferencias de cambio del efectivo en divisa (${(Array.isArray(d.currencies) ? d.currencies : [d.currencies]).map((code) => num(code)).join(", ")}) no se calculan: es un criterio en disputa y faltan los lotes de divisa.`,
  tax_in_kind_income_not_integrated: (d, _n, f) =>
    `Renta en especie registrada (${f.money(d.income_eur)}) y no integrada: el criterio vigente no declara nada al recibirla.`,
  tax_fx_rate_finding: () =>
    "Esta línea depende de un tipo del BCE que no es el oficial de su fecha. La cifra se calcula con el tipo de tus datos; si está mal, corrige el movimiento (anular y registrar de nuevo) y compruébalo antes de declarar.",
  tax_fx_rate_unverified: () =>
    "Esta línea depende de un tipo del BCE que el histórico no ha podido contrastar: no se dice si es bueno ni malo. La cifra se calcula con el tipo de tus datos.",
  tax_fx_rate_date_after_fiscal_date: () =>
    "Esta línea depende de un tipo del BCE fechado después de su fecha fiscal. La cifra se calcula con el tipo de tus datos; el aplicable es el último publicado en o antes de la fecha fiscal.",
  tax_window_open: (d, n, f) =>
    `La pérdida de ${n.one(d.asset_id)} (${f.money(d.loss_eur)}) es provisional: su ventana de recompra sigue abierta hasta el ${day(d.window_end)}.`,
  tax_neutrality_contradiction: (d) =>
    `El evento corporativo (${enumValue(d.kind)}) dice que no se acoge al régimen de neutralidad y aun así conserva fecha y coste: si no hay régimen, falta su ganancia.`,
  tax_loss_expires: (d, _n, f) =>
    `Caduca al cierre del ejercicio un saldo negativo de ${num(d.origin_year)} de ${f.money(d.amount_eur)} que no ha podido compensarse.`,
  tax_release_category_differs: (d, _n, f) =>
    `Se liberan ${f.money(d.amount_eur)} diferidos de una pérdida de la otra categoría de renta: se integran donde nació la pérdida.`,
  tax_duplicate_isin: (d, n) =>
    `El ISIN ${text(d.isin)} lo comparten ${n.many(d.assets)}: para Hacienda son el mismo valor y el cálculo fiscal los trata como distintos. Registra ese valor en un solo activo.`,
  tax_settings_default_used: (d) =>
    `Hay ${countOf(count(d.fields), "parámetro fiscal", "parámetros fiscales")} que no están en tus datos y se han tomado del código. Guardar la configuración los dejará fijados.`,
  // --- The return laid out by box (feature 010) --------------------------
  tax_boxes_missing_year: (d) =>
    `Las casillas de ${year(d.year)} no están comprobadas en el formulario oficial: te damos los importes por conceptos, sin números de casilla. Nunca usamos la casilla de otro ejercicio.`,
  tax_box_missing: (d) =>
    `Hay ${countOf(count(d.concepts), "importe", "importes")} sin casilla en el formulario de ${year(d.year)}: van por concepto y sin número.`,
  tax_box_value_missing: (d) =>
    `${countOf(count(d.boxes), "casilla pide", "casillas piden")} algo que no está en tus datos, como el NIF de una gestora. Lo decimos en vez de inventarlo.`,
  tax_box_partial: (d) => `${PARTIAL_BOX[text(d.reason)] ?? "Esta casilla no se calcula entera"}.`,
  tax_box_rounding_differs: (d) =>
    `El formulario redondea cada valor y hace él mismo la resta: en ${countOf(count(d.boxes), "una casilla", "algunas casillas")} sale un céntimo distinto del nuestro. Te enseñamos los dos.`,
  // --- The informative returns (feature 010, block 3) --------------------
  // The date of the query is on the screen already: repeating it here only
  // gives the drift test a date to trip over.
  informative_current_year: () =>
    "El modelo va de lo que hay a 31 de diciembre y ese día no ha llegado: esto es cómo está hoy, sin veredicto.",
  informative_model_did_not_exist: (d) =>
    `El modelo ${num(d.model)} no existía en ${year(d.year)}: no hay nada que presentar por ese ejercicio.`,
  informative_domestic_accounts_left_out: (d) =>
    `${countOf(count(d.accounts), "cuenta registrada", "cuentas registradas")} en España queda fuera aunque lo que tenga sea extranjero: ante el registro el titular es la comercializadora.`,
  informative_account_changed_country: (d) =>
    `${countOf(count(d.accounts), "cuenta ha cambiado", "cuentas han cambiado")} de país: cuenta el país que tenía a 31 de diciembre.`,
  informative_crypto_custody_unknown: () =>
    "Se cuenta todo lo que hay en cuentas extranjeras; si alguna es de autocustodia, no entraría. Tus datos no distinguen las dos cosas.",
  informative_criteria_not_numbered: () =>
    "El método del saldo medio del trimestre y la clasificación de ETF, ETC y ETP se apoyan en criterios todavía sin numerar.",
  tax_box_repurchase_has_no_number: () =>
    "La parte de una pérdida que no es computable por recompra se marca en la ventana de captura de Renta WEB: no tiene casilla con número.",
};

/**
 * Spanish text of a projection warning; an unknown code falls back to its
 * message, with its figures masked because nothing here can tell which of them
 * is an amount. Without a catalogue every identifier prints as itself, which is
 * what the whole application did before (`NO_NAMES`).
 */
/** "A", "A y B", "A, B y C". */
const joinAll = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;

/**
 * The age a group of stale prices is past: the limit configured, which the
 * domain puts in each warning. The youngest of their ages is not it — six
 * prices of 10 days and more read «más de 10 días» with a limit of 7 (second
 * pass of the review of 2026-09-19); it is only the answer for a warning of an
 * older version, which does not carry the limit.
 */
const limitOf = (warnings: readonly Warning[]): number => {
  const limit = warnings[0]?.details.limit_days;
  return limit === undefined
    ? Math.min(...warnings.map((warning) => Number(warning.details.age_days)))
    : Number(limit);
};

/**
 * One sentence for several warnings of the same rule, as the summary shows
 * them (docs/design/system.md §5.6): «3 precios con más de 15 días · World
 * Index Fund, Physical Gold ETC y Bitcoin ETP». Only the rules whose repeats
 * are one thing to do; the others are said one by one.
 */
export const describeWarningGroup = (
  code: string,
  warnings: readonly Warning[],
  prose: Prose,
): string | undefined => {
  const n = namingOf(prose.names ?? NO_NAMES);
  const f = figuresOf(prose.privacy);
  const d = (warnings[0]?.details ?? {}) as Details;
  switch (code) {
    // One loss and its purchases inside the window: one sentence with how many,
    // each purchase in the detail. The preview of a sale listed ten notices
    // that said the same thing (third pass of the review of 2026-09-19).
    case "wash_sale_window_prior_buy":
      return `Venta con pérdida de ${n.one(d.asset_id)} del ${day(d.sale_date)} (${f.money(d.loss_eur)}) con ${warnings.length} compras en cartera dentro de la ventana abierta el ${day(d.window_start)} (${windowText(d.window)}): la pérdida puede no ser computable en ${year(d.tax_year)}.`;
    case "wash_sale_window_repurchase":
      return `${warnings.length} compras de ${n.one(d.asset_id)} dentro de la ventana de su venta con pérdida del ${day(d.sale_date)} (${f.money(d.loss_eur)}; ${windowText(d.window)}, hasta el ${day(d.window_end)}): pueden hacer que esa pérdida no sea computable en ${year(d.tax_year)}.`;
    case "stale_price":
      return `${warnings.length} precios con más de ${days(limitOf(warnings))} · ${joinAll(
        warnings.map((warning) => n.one(warning.details.asset_id)),
      )}. Registra valoraciones más recientes.`;
    case "stale_fx_rate":
      return `${warnings.length} tipos de cambio de hace más de ${days(limitOf(warnings))} · ${joinAll(
        warnings.map((warning) => text(warning.details.currency)),
      )}. Registra una operación o una valoración más reciente en esas divisas.`;
    case "deviation_above_threshold":
      return `${warnings.length} activos fuera del umbral de ±${pp(
        warnings[0]?.details.threshold_pp,
      ).replace(/^\+/, "")} · ${joinAll(
        warnings.map(
          (warning) => `${n.one(warning.details.asset_id)} (${pp(warning.details.deviation_pp)})`,
        ),
      )}. Rebalancear vendiendo es una decisión anual tuya.`;
    default:
      return undefined;
  }
};

export const describeWarning = (warning: Warning, prose: Prose): string => {
  const render = WARNING_MESSAGES[warning.code];
  return render === undefined
    ? maskFigures(warning.message, prose.privacy)
    : render(
        warning.details as Details,
        namingOf(prose.names ?? NO_NAMES),
        figuresOf(prose.privacy),
      );
};
