// Projection warnings in Spanish, with the remedy of the web. Same contract as
// the errors: keyed by `code`, unknown codes fall back to the domain message,
// and the drift test keeps this catalogue level with the CLI's.

import type { Warning } from "@atlas/domain";
import { type Naming, NO_NAMES, namingOf } from "../names.js";
import { type Figures, figuresOf, maskFigures, type Prose } from "../privacy.js";

type Details = Record<string, unknown>;

const text = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

const list = (value: unknown): string =>
  Array.isArray(value) ? value.map((entry) => text(entry)).join(", ") : text(value);

const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

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

/** Why a control rule of the bucket could not be measured, and what is missing. */
const gapText = (d: Details, n: Naming): string => {
  const missing = [
    ...((d.assets as string[] | undefined) ?? []).map((id) => n.one(id)),
    ...((d.currencies as string[] | undefined) ?? []),
  ];
  const detail = missing.length === 0 ? "" : ` (faltan ${missing.join(", ")})`;
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

export const WARNING_MESSAGES: Record<string, (d: Details, n: Naming, f: Figures) => string> = {
  // --- Core weights ------------------------------------------------------
  unknown_target_weight: (d, n) =>
    `El peso objetivo de ${n.one(d.asset_id)} no corresponde a ningún activo del núcleo: revisa si el identificador está mal escrito.`,
  asset_without_target: (d, n) =>
    `${n.one(d.asset_id)} tiene posición y ningún peso objetivo asignado.`,
  deviation_above_threshold: (d, n) =>
    `${n.one(d.asset_id)} se desvía ${text(d.deviation_pp)} pp del objetivo (umbral ${text(d.threshold_pp)} pp). Rebalancear vendiendo es una decisión anual tuya (regla 3).`,
  satellite_below_minimum: (d) =>
    `La clase satélite ${text(d.asset_class)} pesa ${text(d.weight_pct)} %, por debajo del mínimo del ${text(d.minimum_pct)} % (regla 6b: 0 % o al menos el mínimo).`,
  partial_core_total: (d, n) =>
    `Faltan precios de ${n.many(d.assets)} a ${text(d.date)}: no se calculan pesos sobre un total parcial.`,
  // --- Prices and rates --------------------------------------------------
  stale_price: (d, n) =>
    `${n.one(d.asset_id)}: el precio es de ${text(d.age_days)} días atrás (${text(d.date)}); registra una valoración más reciente.`,
  stale_fx_rate: (d) =>
    `El tipo de cambio aplicado a ${text(d.currency)} es de ${text(d.age_days)} días atrás (${text(d.date)}); registra una operación o una valoración más reciente en esa divisa.`,
  // --- Tracking ----------------------------------------------------------
  transfer_overdue: (d, n) =>
    `El traspaso de ${n.one(d.from_asset_id)} a ${n.one(d.to_asset_id)} lleva ${text(d.days_open)} días abierto, más de los ${text(d.max_days)} configurados. Reclama a la gestora: mientras dure, el dinero no está invertido ni en el origen ni en el destino.`,
  partial_net_worth: (d, n) =>
    `El patrimonio a ${text(d.date)} es parcial: faltan ${[
      ...((d.assets as string[] | undefined) ?? []).map((id) => n.one(id)),
      ...((d.currencies as string[] | undefined) ?? []),
    ].join(", ")}.`,
  partial_bucket_total: (d, n) =>
    `Faltan precios de ${n.many(d.assets)} a ${text(d.date)}: el total del cubo solo cubre lo que sí tiene precio.`,
  // --- Bucket ------------------------------------------------------------
  bucket_sample_too_small: (d) =>
    `Solo ${text(d.closed_theses)} tesis cerradas y ${text(d.realized_operations)} operaciones realizadas: por debajo de ${text(d.sample)} operaciones la muestra no distingue habilidad de suerte.`,
  bucket_contaminated_theses: (d) =>
    `${count(d.theses)} tesis quedan fuera de las medias (${list(d.theses)}): sus ventas consumieron lotes comprados por otra tesis (FIFO global, ADR-0009).`,
  bucket_contribution_exceeded: (d, _n, f) =>
    `El aporte bruto al cubo (${f.money(d.gross_eur)}) supera el tope de ${f.money(d.limit_eur)} (regla 17). Las retiradas no devuelven margen: la regla 19 prohíbe reponer el cubo.`,
  bucket_contribution_near_limit: (d, _n, f) =>
    `El aporte bruto al cubo (${f.money(d.gross_eur)}) pasa del 80 % del tope de ${f.money(d.limit_eur)} (regla 17).`,
  bucket_stop_loss_reached: (d, _n, f) =>
    `REGLA DE PARADA: la pérdida acumulada del cubo (${f.money(d.loss_eur)}) es el ${text(d.loss_pct)} % del aporte bruto (${f.money(d.gross_eur)}), por encima del ${text(d.limit_pct)} % configurado (regla 17). La aplicación avisa; la decisión es tuya.`,
  bucket_stop_loss_not_evaluated: (d, n) =>
    `La regla de parada (${text(d.limit_pct)} %) no se ha podido evaluar: ${gapText(d, n)}. Sin ese dato no hay control de pérdida acumulada, no es que no la haya (regla 17).`,
  bucket_weight_not_evaluated: (d, n) =>
    `La regla de peso (${text(d.limit_pct)} %) no se ha podido evaluar: ${gapText(d, n)}. Sin ese dato no hay control de peso del cubo, no es que esté dentro (regla 18).`,
  bucket_weight_exceeded: (d) =>
    `El cubo pesa el ${text(d.weight_pct)} % del patrimonio total, por encima del ${text(d.limit_pct)} % configurado (regla 18): valora traspasar el exceso al núcleo.`,
  missing_benchmark_asset: () =>
    "No hay índice de referencia configurado: fíjalo en Ajustes → Configuración (regla 16).",
  unknown_benchmark_asset: (d, n) =>
    `El índice de referencia ${n.one(d.asset_id)} no está en el catálogo: la comparación queda sin dato.`,
  missing_benchmark_price: (d, n) =>
    `Falta el precio del índice ${n.one(d.asset_id)} a ${text(d.date)}: la comparación queda sin dato (nunca se estima).`,
  // --- Operations --------------------------------------------------------
  currency_mismatch: (d, n) =>
    `El evento está en ${text(d.currency)} y el activo ${n.one(d.asset_id)} está en ${text(d.asset_currency)}.`,
  fx_rate_date_after_fiscal_date: (d) =>
    `La fecha del tipo (${text(d.fx_rate_date)}) es posterior a la fecha fiscal (${text(d.fiscal_date)}).`,
  same_asset_two_accounts: (d, n) =>
    `El activo ${n.one(d.asset_id)} está ahora en ${count(d.accounts)} cuentas; el FIFO sigue siendo global.`,
  sell_without_thesis: (d, n) =>
    `La venta de ${n.one(d.asset_id)} en ${n.one(d.account_id)} no está enlazada a ninguna tesis.`,
  thesis_size_exceeded: (d, _n, f) =>
    `La tesis ${text(d.thesis_id)} lleva ${f.money(d.invested_eur)} invertidos, por encima de los ${f.money(d.planned_size_eur)} previstos.`,
  thesis_closed_with_position: (d, n, f) =>
    `La tesis ${text(d.thesis_id)} está cerrada pero ${n.one(d.account_id)} sigue teniendo ${n.one(d.asset_id)} (${f.quantity(d.position)}).`,
  // --- Wash-sale window --------------------------------------------------
  wash_sale_window_repurchase: (d, n, f) =>
    `Recompra de ${n.one(d.asset_id)} dentro de la ventana de la venta ${text(d.sale_event_id)} (${text(d.sale_date)}, pérdida ${f.money(d.loss_eur)}): esa pérdida no será computable este ejercicio. La ventana llega hasta el ${text(d.window_end)} (${windowText(d.window)}).`,
  wash_sale_window_prior_buy: (d, n, f) =>
    `Venta con pérdida de ${n.one(d.asset_id)} (${f.money(d.loss_eur)}) con una compra del ${text(d.buy_date)} (${f.quantity(d.quantity)} títulos) dentro de la ventana abierta el ${text(d.window_start)} (${windowText(d.window)}): la pérdida no será computable este ejercicio.`,
};

/**
 * Spanish text of a projection warning; an unknown code falls back to its
 * message, with its figures masked because nothing here can tell which of them
 * is an amount. Without a catalogue every identifier prints as itself, which is
 * what the whole application did before (`NO_NAMES`).
 */
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
