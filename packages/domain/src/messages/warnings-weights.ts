// Warnings about the core weights, prices and rates, tracking and the bucket's control rules.

import type { Details, Entry, Voice } from "./voice.js";
import { capital, fxMissingReason } from "./words.js";

const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** «falta A» / «faltan A, B»: assets by name, currencies as the code they are. */
const missingOf = (v: Voice, d: Details): string => {
  const assets = list(d.assets);
  const currencies = list(d.currencies);
  const names = [
    ...(assets.length === 0 ? [] : [v.many(assets)]),
    ...currencies.map((code) => v.text(code)),
  ];
  return `${assets.length + currencies.length === 1 ? "falta" : "faltan"} ${names.join(", ")}`;
};

/** «Falta el precio de A», «Faltan los precios de A, B». */
const pricesOf = (v: Voice, assets: unknown): string =>
  `${v.count(assets) === 1 ? "Falta el precio" : "Faltan los precios"} de ${v.many(assets)}`;

/** «de hace 17 días (2026-09-01)»: the age of a price or a rate, and its date. */
const age = (v: Voice, d: Details): string => `de hace ${v.days(d.age_days)} (${v.date(d.date)})`;

/** Why a control rule of the bucket could not be measured, and what is missing. */
const gapText = (v: Voice, d: Details): string => {
  const detail =
    list(d.assets).length + list(d.currencies).length === 0 ? "" : ` (${missingOf(v, d)})`;
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

/** A count with its noun, singular or plural. */
const countOf = (v: Voice, n: unknown, one: string, many: string): string =>
  `${v.num(n)} ${Number(n) === 1 ? one : many}`;

export const WARNINGS_WEIGHTS: Record<string, Entry> = {
  // --- Core weights ---
  unknown_target_weight: {
    say: (d, v) =>
      `Hay un peso objetivo para ${v.one(d.asset_id)}, que no es ningún activo de la cartera principal:`,
    cli: () => "revisa si el asset_id está mal escrito.",
    web: () => "revísalo en la configuración.",
  },
  asset_without_target: (d, v) =>
    `${v.one(d.asset_id)} tiene posición y ningún peso objetivo asignado.`,
  deviation_above_threshold: {
    say: (d, v) =>
      `${v.one(d.asset_id)} se desvía ${v.pp(d.deviation_pp)} del objetivo (umbral ${v.pp(d.threshold_pp).replace(/^\+/, "")}). Rebalancear vendiendo es una decisión tuya, una vez al año.`,
    cli: () => "(regla 3)",
  },
  satellite_below_minimum: {
    say: (d, v) =>
      `${capital(v.word(d.asset_class))} pesa ${v.pct(d.weight_pct)}, por debajo del mínimo de un satélite, que es del ${v.pct(d.minimum_pct)}; o 0 % o al menos el mínimo.`,
    cli: () => "(regla 6b)",
  },
  partial_core_total: (d, v) =>
    `${pricesOf(v, d.assets)} a ${v.date(d.date)}: no se calculan pesos sobre un total parcial.`,

  // --- Prices and rates ---
  stale_price: (d, v) =>
    `${v.one(d.asset_id)}: el precio es ${age(v, d)}; registra una valoración más reciente.`,
  stale_fx_rate: {
    say: (d, v) =>
      d.source === "ecb"
        ? `El tipo de cambio aplicado a ${v.text(d.currency)} es el del histórico del BCE ${age(v, d)};`
        : `El tipo de cambio aplicado a ${v.text(d.currency)} es ${age(v, d)}; registra una operación o una valoración más reciente en esa divisa.`,
    cli: (d) => (d.source === "ecb" ? "actualízalo con `atlas fx update`." : ""),
    web: (d) => (d.source === "ecb" ? "actualiza el histórico del BCE." : ""),
  },

  // --- Tracking ---
  transfer_overdue: {
    say: (d, v) =>
      `El traspaso de ${v.one(d.from_asset_id)} a ${v.one(d.to_asset_id)} lleva ${v.days(d.days_open)} abierto, más de los ${v.num(d.max_days)} configurados, y sigue en etapa «${v.word(d.stage)}». Reclama a la gestora: mientras dure, el dinero no está invertido ni en el origen ni en el destino.`,
    cli: (d, v) => `(solicitud ${v.text(d.request_id)})`,
  },
  partial_net_worth: (d, v) => `El patrimonio a ${v.date(d.date)} es parcial: ${missingOf(v, d)}.`,
  partial_bucket_total: (d, v) =>
    `${pricesOf(v, d.assets)} a ${v.date(d.date)}: el total del cubo solo cubre lo que sí tiene precio.`,

  // --- Bucket ---
  bucket_sample_too_small: (d, v) =>
    Number(d.closed_theses) === 0 && Number(d.realized_operations) === 0
      ? "Todavía no hay ninguna tesis cerrada ni ninguna venta: las estadísticas del cubo empiezan con la primera."
      : `Solo ${countOf(v, d.closed_theses, "tesis cerrada", "tesis cerradas")} y ${countOf(v, d.realized_operations, "operación realizada", "operaciones realizadas")} (ventas y realizaciones por evento corporativo): por debajo de ${v.num(d.sample)} operaciones la muestra no distingue habilidad de suerte.`,
  bucket_contaminated_theses: {
    say: (d, v) =>
      `${v.count(d.theses) === 1 ? "Una tesis queda" : `${v.num(v.count(d.theses))} tesis quedan`} fuera de las medias (${list(
        d.theses,
      )
        .map((id) => v.thesis(id))
        .join(
          "; ",
        )}): sus ventas consumieron lotes comprados por otra tesis, porque el FIFO es global.`,
    cli: () => "(ADR-0009)",
  },
  bucket_contribution_exceeded: {
    say: (d, v) =>
      `El aporte bruto al cubo (${v.money(d.gross_eur)}) supera el tope de ${v.money(d.limit_eur)}. Las retiradas no devuelven margen: el cubo no se repone con dinero de fuera.`,
    cli: () => "(regla 17; la regla 19 prohíbe reponer el cubo)",
  },
  bucket_contribution_near_limit: {
    say: (d, v) =>
      `El aporte bruto al cubo (${v.money(d.gross_eur)}) pasa del 80 % del tope de ${v.money(d.limit_eur)}.`,
    cli: () => "(regla 17)",
  },
  bucket_stop_loss_reached: {
    say: (d, v) =>
      `REGLA DE PARADA: la pérdida acumulada del cubo (${v.money(d.loss_eur)}) es el ${v.pct(d.loss_pct)} del aporte bruto (${v.money(d.gross_eur)}), por encima del ${v.pct(d.limit_pct)} configurado: toca dejar de aportar al cubo. La aplicación avisa; la decisión es tuya.`,
    cli: () => "(regla 17)",
  },
  bucket_stop_loss_not_evaluated: {
    say: (d, v) =>
      `La regla de parada (${v.pct(d.limit_pct)}) no se ha podido evaluar: ${gapText(v, d)}. Sin ese dato no hay control de pérdida acumulada, no es que no la haya.`,
    cli: () => "(regla 17)",
  },
  bucket_weight_not_evaluated: {
    say: (d, v) =>
      `La regla de peso (${v.pct(d.limit_pct)}) no se ha podido evaluar: ${gapText(v, d)}. Sin ese dato no hay control de peso del cubo, no es que esté dentro.`,
    cli: () => "(regla 18)",
  },
  bucket_weight_exceeded: {
    say: (d, v) =>
      `El cubo pesa el ${v.pct(d.weight_pct)} del patrimonio total, por encima del ${v.pct(d.limit_pct)} configurado: valora traspasar el exceso a la cartera principal.`,
    cli: () => "(regla 18)",
  },
  missing_benchmark_asset: {
    say: () => "No hay índice de referencia configurado:",
    cli: () => "fíjalo con `atlas settings set --bucket-benchmark-asset <asset_id>` (regla 16).",
    web: () => "fíjalo en Ajustes → Configuración.",
  },
  unknown_benchmark_asset: (d, v) =>
    `El índice de referencia ${v.one(d.asset_id)} no está en el catálogo: la comparación queda sin dato.`,
  missing_benchmark_price: (d, v) =>
    `Falta el precio del índice ${v.one(d.asset_id)} a ${v.date(d.date)}: la comparación queda sin dato (nunca se estima).`,
  weights_use_approximation: (d, v) =>
    `Los pesos de ${v.many(d.assets)} se apoyan en una aproximación por su ETF de referencia, no en un valor liquidativo: el reparto de la aportación depende de una estimación.`,
  price_without_eur_value: (d, v) =>
    `${v.one(d.asset_id)}: la cotización en ${v.text(d.currency)} del ${v.date(d.date)} no tiene tipo del BCE (${
      fxMissingReason(d.reason) ??
      (v.surface === "cli"
        ? "no hay histórico del BCE; descárgalo con «atlas fx update»"
        : "no hay histórico del BCE en esta web")
    }); se enseña en su divisa y falta su valor en euros, así que no suma en ningún total.`,
};
