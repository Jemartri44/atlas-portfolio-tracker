// The short title of each warning and finding: what the list of *Atención* shows before the notice
// is opened. The sentence of the notice stays in its own table; this only names it. Like any entry,
// a title speaks through the voice, so a name or a number is never formatted here.

import type { Details, Say, Voice } from "./voice.js";
import { capital, year } from "./words.js";

/** A title, and the one for several warnings of the same rule shown as one notice. */
export type Title = Say | { one: Say; many: (n: number, d: Details, v: Voice) => string };

const fixed =
  (title: string): Say =>
  () =>
    title;

const pricesMissing =
  (book: string): Say =>
  (d, v) =>
    v.count(d.assets) === 1
      ? `${book} parcial: falta un precio`
      : `${book} parcial: faltan ${v.num(v.count(d.assets))} precios`;

export const WARNING_TITLES: Readonly<Record<string, Title>> = {
  // Core weights
  deviation_above_threshold: {
    one: (d, v) => `Fuera de umbral: ${v.one(d.asset_id)}`,
    many: (n, _d, v) => `${v.num(n)} activos fuera de umbral`,
  },
  satellite_below_minimum: (d, v) => `${capital(v.word(d.asset_class))}: bajo el mínimo`,
  asset_without_target: (d, v) => `${v.one(d.asset_id)} sin peso objetivo`,
  unknown_target_weight: fixed("Peso objetivo de un activo que no existe"),
  weights_use_approximation: fixed("Pesos con valor aproximado"),

  // Prices and rates
  stale_price: {
    one: (d, v) => `Precio caducado: ${v.one(d.asset_id)}`,
    many: (n, _d, v) => `${v.num(n)} precios caducados`,
  },
  stale_fx_rate: {
    one: (d, v) => `Tipo de cambio caducado: ${v.text(d.currency)}`,
    many: (n, _d, v) => `${v.num(n)} tipos de cambio caducados`,
  },
  price_without_eur_value: (d, v) => `${v.one(d.asset_id)} sin valor en euros`,
  partial_core_total: pricesMissing("Cartera"),
  partial_bucket_total: pricesMissing("Cubo"),
  partial_net_worth: fixed("Patrimonio parcial"),

  // Bucket
  bucket_stop_loss_reached: fixed("Regla de parada alcanzada"),
  bucket_stop_loss_not_evaluated: fixed("Regla de parada sin evaluar"),
  bucket_weight_exceeded: fixed("El cubo pesa demasiado"),
  bucket_weight_not_evaluated: fixed("Peso del cubo sin evaluar"),
  bucket_contribution_exceeded: fixed("Tope del cubo superado"),
  bucket_contribution_near_limit: fixed("Cubo cerca del tope"),
  bucket_contaminated_theses: (d, v) => `Tesis fuera de las medias: ${v.num(v.count(d.theses))}`,
  bucket_sample_too_small: fixed("Muestra del cubo aún pequeña"),
  missing_benchmark_asset: fixed("Falta el índice de referencia"),
  unknown_benchmark_asset: fixed("Índice de referencia desconocido"),
  missing_benchmark_price: fixed("Falta el precio del índice"),
  thesis_size_exceeded: fixed("Tesis por encima de lo previsto"),
  thesis_closed_with_position: fixed("Tesis cerrada con posición"),

  // Wash-sale window
  wash_sale_window_repurchase: {
    one: (d, v) => `Recompra en ventana: ${v.one(d.asset_id)}`,
    many: (n, d, v) => `${v.num(n)} recompras en ventana: ${v.one(d.asset_id)}`,
  },
  wash_sale_window_prior_buy: {
    one: (d, v) => `Pérdida con compra previa: ${v.one(d.asset_id)}`,
    many: (n, d, v) => `Pérdida con ${v.num(n)} compras previas: ${v.one(d.asset_id)}`,
  },

  // Transfers
  transfer_overdue: (d, v) => `Traspaso atascado: ${v.one(d.from_asset_id)}`,
  transfer_not_between_funds: fixed("Traspaso que no es entre fondos"),
  transfer_not_resident: fixed("Traspaso sin residencia en España"),
  transferable_not_fund: (d, v) => `${v.one(d.asset_id)}: marca de traspaso sin efecto`,
  convert_fund_to_listed_fund: fixed("Fondo convertido en ETF: revisar"),

  // Swaps and mergers
  neutrality_denied_keeps_cost: fixed("Sin neutralidad y con coste conservado"),
  exchange_acquirer_outside_eu: (d, v) => `Emisor de fuera de la UE: ${v.one(d.asset_id)}`,
  exchange_partner_communication: fixed("Comunicación a Hacienda pendiente"),
  exchange_domicile_unknown: (d, v) => `Emisor sin localizar: ${v.many(d.assets)}`,
  exchange_cash_cap: fixed("Dinero del canje: comprobar el 10 %"),
  swap_fiscal_dates_differ: fixed("Permuta con dos fechas fiscales"),

  // Operations
  currency_mismatch: fixed("Divisa distinta a la del activo"),
  fx_rate_date_after_fiscal_date: fixed("Tipo de cambio posterior a la fecha fiscal"),
  same_asset_two_accounts: (d, v) => `${v.one(d.asset_id)} en varias cuentas`,
  cost_adjustment_currency_mismatch: fixed("Rebaja de coste en otra divisa"),
  capital_return_partial_accounts: fixed("Devolución sin todas las cuentas"),
  tax_instalment_repeated: fixed("Plazo de la Renta repetido"),
  tax_second_without_first: fixed("Segundo plazo sin el primero"),

  // Income tax
  tax_quota_not_computed: fixed("Es la base, no lo que pagas"),
  tax_filing_prefix_unverified: fixed("Diferencia con lo presentado sin desglosar"),
  tax_double_taxation_partial: fixed("Doble imposición: solo el primer límite"),
  tax_treaty_rate_missing: (d, v) => `Falta el tipo de convenio: ${v.text(d.country)}`,
  tax_dividend_without_country: fixed("Dividendo sin país"),
  tax_crypto_custody_not_deductible: fixed("Custodia de cripto no deducible"),
  tax_currency_withdrawn: fixed("Divisa sacada de la cuenta"),
  tax_currency_spent_without_lots: fixed("Divisa gastada sin tenerla"),
  tax_currency_mixed_lots: fixed("Lotes en dos divisas"),
  tax_in_kind_income_not_integrated: fixed("Renta en especie por sumar"),
  tax_in_kind_income_missing: fixed("Falta el valor de una renta en especie"),
  tax_fx_rate_finding: fixed("Línea con un tipo no oficial"),
  tax_fx_rate_unverified: fixed("Línea con un tipo sin contrastar"),
  tax_fx_rate_date_after_fiscal_date: fixed("Línea con un tipo posterior"),
  tax_window_open: (d, v) => `Pérdida provisional: ${v.one(d.asset_id)}`,
  tax_neutrality_contradiction: fixed("Evento corporativo contradictorio"),
  tax_loss_expires: fixed("Saldo negativo que caduca"),
  tax_release_category_differs: fixed("Liberación de otra categoría"),
  tax_duplicate_isin: fixed("ISIN repetido: cifras en duda"),
  tax_settings_default_used: fixed("Parámetros fiscales por defecto"),

  // The boxes of the return
  tax_boxes_missing_year: (d, v) => `Casillas de ${year(v, d.year)} sin comprobar`,
  tax_box_missing: (d, v) => `Importes sin casilla: ${v.num(v.count(d.concepts))}`,
  tax_box_value_missing: fixed("Casilla que pide un dato que falta"),
  tax_box_partial: fixed("Casilla incompleta"),
  tax_box_section_doubtful: fixed("Apartado dudoso: acciones fuera de la UE"),
  tax_box_market_unknown: (d, v) => `Mercado sin saber: ${v.many(d.assets)}`,
  tax_box_other_inferred: fixed("Divisa en «otros elementos»"),
  tax_box_repurchase_has_no_number: fixed("Recompra sin número de casilla"),

  // The informative returns
  informative_current_year: fixed("Ejercicio aún sin cerrar"),
  informative_not_resident: fixed("Sin obligación: no residente"),
  informative_model_did_not_exist: (d, v) => `El modelo no existía en ${year(v, d.year)}`,
  informative_domestic_accounts_left_out: fixed("Cuentas en España fuera del modelo"),
  informative_account_changed_country: fixed("Cuenta que cambió de país"),
  informative_crypto_custody_unknown: fixed("Autocustodia sin distinguir"),
  informative_iic_net_asset_value: fixed("Falta el valor liquidativo"),
  informative_criteria_not_numbered: fixed("Criterios sin numerar"),
};

export const FINDING_TITLES: Readonly<Record<string, string>> = {
  negative_position: "Posición en negativo",
  lots_mismatch: "Los lotes no cuadran",
  duplicate_fingerprint: "Posible movimiento repetido",
  duplicate_isin: "Dos activos con el mismo ISIN",
  dangling_reference: "Referencia a un activo que no existe",
  fx_rate_mismatch: "Tipo del BCE que no es el oficial",
  fx_rate_date_unpublished: "Tipo del BCE de un día sin publicar",
  fx_rate_date_not_latest: "Tipo del BCE que no es el último",
  fx_rate_currency_unlisted: "Divisa fuera del histórico del BCE",
  fx_rate_currency_stale: "Divisa que el BCE dejó de publicar",
  fx_rate_not_yet_in_history: "Tipo aún sin llegar al histórico",
  target_calendar_mismatch: "Calendario de objetivos descuadrado",
  duplicate_id: "Identificador repetido",
  non_canonical_line: "Línea escrita en otro formato",
  unknown_field: "Campo desconocido en tus datos",
  outdated_lines: "Líneas de una versión antigua",
  fingerprint_mismatch: "Huella que no coincide",
  filing_fingerprint_lines: "Huella de lo presentado: líneas",
  filing_fingerprint_mismatch: "Lo presentado ya no coincide",
  filing_fingerprint_unreadable: "Huella de lo presentado ilegible",
  filing_fingerprint_waived: "Huella dada por no verificable",
  projection_not_reproducible: "Cálculo que no se reproduce",
};

/** The title of a warning, or of `n` of the same rule told as one; `undefined` for an unknown code. */
export const titleOf = (code: string, n: number, d: Details, v: Voice): string | undefined => {
  const title = WARNING_TITLES[code];
  if (title === undefined) {
    return undefined;
  }
  if (typeof title === "function") {
    return title(d, v, "");
  }
  return n > 1 ? title.many(n, d, v) : title.one(d, v, "");
};
