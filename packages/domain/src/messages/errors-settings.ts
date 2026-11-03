// Errors about views that need prices or settings, the settings themselves and what was filed.

import type { Entry, Voice } from "./voice.js";
import { year } from "./words.js";

/** The settings whose value is an amount; the rest are percentages, points, days or a country. */
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

const counted = (v: Voice, n: number, one: string, many: string): string =>
  `${v.num(n)} ${n === 1 ? one : many}`;

/** « (31/01/2027)» after a sentence part when the detail came, nothing otherwise. */
const recordedOn = (v: Voice, value: unknown): string =>
  value === undefined ? "" : ` (${v.date(value)})`;

export const ERRORS_SETTINGS: Record<string, Entry> = {
  invalid_horizon: {
    say: () => "El horizonte de la proyección tiene que ser un número entero de años, 0 o más.",
  },
  missing_manual_prices: {
    say: (d, v) =>
      `${v.count(d.assets) === 1 ? "Falta un precio en euros" : "Faltan precios en euros"} a ${v.date(d.date)}: ${v.many(d.assets)}. Registra una valoración o, si ${v.count(d.assets) === 1 ? "tiene una cotización" : "tienen una cotización"} en otra divisa, trae el histórico del BCE.`,
    cli: (d, v) =>
      `La valoración: \`atlas add valuation --asset <id> --date ${v.text(d.date)} …\`; el histórico del BCE: \`atlas fx update\`.`,
  },
  missing_target_weights: {
    say: () => "No hay pesos objetivo configurados:",
    web: () => "fíjalos en Ajustes → Configuración.",
    cli: () =>
      "fíjalos con `atlas settings set --target-weights ast_x=60,ast_y=40` (target_weights).",
  },
  missing_bucket_pct: {
    say: () => "Falta el porcentaje del cubo sobre la aportación:",
    web: () => "fíjalo en Ajustes → Configuración.",
    cli: () =>
      "fíjalo con `atlas settings set --bucket-pct-of-contribution 10` (bucket_pct_of_contribution).",
  },
  missing_deviation_threshold: {
    say: () => "Falta el umbral de desviación de la regla 3:",
    web: () => "fíjalo en Ajustes → Configuración.",
    cli: () =>
      "fíjalo con `atlas settings set --deviation-threshold-pp 5` (deviation_threshold_pp).",
  },
  missing_amount: {
    say: () => "Falta el importe de la aportación:",
    web: () => "indícalo, o fija la aportación mensual en Ajustes → Configuración.",
    cli: () =>
      "pásalo con --amount o fíjalo con `atlas settings set --monthly-contribution-eur 600` (monthly_contribution_eur).",
  },
  no_target_weight_in_table: {
    say: (d, v) =>
      `Los pesos objetivo vigentes no apuntan a ningún activo de la cartera principal${
        v.count(d.assets) === 0
          ? " (la tabla está vacía)"
          : `: ${v.many(d.assets)} están todos al 0 %`
      }.`,
    web: () => "Revísalos en Ajustes → Configuración.",
    cli: () =>
      "Es casi seguro un asset_id mal escrito en target_weights: mira el aviso unknown_target_weight en la web (Cartera) y corrígelo con `atlas settings set --target-weights …`.",
  },
  split_not_exact: (d, v) =>
    `El reparto de la aportación no cuadra (${v.money(d.distributed)} repartidos de ${v.money(d.core)}): es un fallo interno de la calculadora, no registres nada.`,
  invalid_settings: {
    say: (d, v) => {
      // `min` and `max` are the bounds written in the domain, not the user's money: they stay visible.
      const received = MONEY_SETTINGS.has(v.text(d.field)) ? v.money(d.value) : v.num(d.value);
      if (d.total !== undefined) {
        return `Los pesos objetivo deben sumar 100 y suman ${v.num(d.total)}.`;
      }
      if (d.min !== undefined) {
        const range =
          d.max === undefined
            ? `${v.num(d.min)} o mayor`
            : `un valor entre ${v.num(d.min)} y ${v.num(d.max)}`;
        return `${v.setting(d.field)} debe ser ${range} (recibido: ${received}).`;
      }
      if (d.value === undefined) {
        return `Falta ${v.setting(d.field)}.`;
      }
      return `${v.setting(d.field)} no admite ese valor (recibido: ${received}).`;
    },
    cli: (d) =>
      d.total !== undefined ? "Corrígelos con `atlas settings set --target-weights …`." : "",
  },
  invalid_wash_sale_window: {
    say: (d, v) =>
      `La ventana de recompra de ${v.word(d.asset_type)} no es válida: elige dos meses, un año o un número de días.`,
    cli: (d, v) => `Se escribe "2m", "1y" o "<n>d" (recibido: ${v.text(d.value)}).`,
  },
  filing_year_unsupported: (d, v) =>
    `El Modelo ${v.num(d.model)} no existe para el ejercicio ${year(v, d.tax_year)}: el primero que puedes registrar es ${year(v, d.first_supported)}.`,
  filed_at_not_after_year: {
    say: (d, v) =>
      `Una declaración del ejercicio ${year(v, d.tax_year)} no se pudo presentar el ${v.date(d.filed_at)}: la fecha tiene que ser posterior al final de ese ejercicio.`,
    cli: (d, v) => `Es decir, posterior al 31/12 de ${year(v, d.tax_year)}.`,
  },
  filed_at_in_future: (d, v) =>
    `La presentaste el ${v.date(d.filed_at)}, que es posterior al día en que se registra${recordedOn(v, d.recorded_at)}: no se registra lo que todavía no se ha presentado.`,
  as_of_before_year_end: (d, v) =>
    `El cálculo guardado con la declaración es del ${v.date(d.as_of)}, anterior al cierre de ${year(v, d.tax_year)}: no puede cubrir el ejercicio entero, así que sus cifras estarían a medias.`,
  as_of_in_future: (d, v) =>
    `El cálculo guardado con la declaración es del ${v.date(d.as_of)}, posterior al día en que se registra${recordedOn(v, d.recorded_at)}: no se calcula en el futuro.`,
  duplicate_pending_loss: (d, v) =>
    `Los saldos pendientes declarados repiten el ejercicio ${year(v, d.origin_year)} en ${v.word(d.category)}: cada origen y categoría va una sola vez.`,
  duplicate_filed_item: (d, v) =>
    `Los bienes declarados repiten ${
      d.asset_id === undefined
        ? v.one(d.account_id)
        : `${v.one(d.asset_id)} en ${v.one(d.account_id)}`
    }${d.category === undefined ? "" : ` (${v.word(d.category)})`}: cada bien va una sola vez.`,
  alert_above_threshold: (d, v) =>
    `El aviso previo del Modelo ${v.num(d.model)} (${v.money(d.alert)}) no puede superar el umbral que obliga a presentarlo (${v.money(d.threshold)}): nunca llegaría a saltar.`,
  invalid_renta_season: {
    // Named in words and never by its key on the web: there are only two fields.
    say: (d, v) =>
      d.value === undefined
        ? `La temporada de Renta empieza el ${v.num(d.start)} y termina el ${v.num(d.end)}: el inicio no puede ser posterior al fin.`
        : `${v.text(d.field) === "renta_season_end" ? "El fin" : "El inicio"} de la temporada de Renta se escribe como MM-DD, mes y día (recibido: ${v.num(d.value)}).`,
    cli: (d, v) => (d.value === undefined ? "" : `Parámetro: ${v.text(d.field)}.`),
  },
  tax_ledger_invalid: {
    say: (d, v) =>
      `Tus datos tienen ${counted(v, Number(d.count) || 0, "movimiento inválido", "movimientos inválidos")}: un cálculo fiscal sobre ellos sería aproximado.`,
    web: () => "Repáralo antes en Ajustes → Verificación.",
    cli: (d, v) => {
      const invalid = Array.isArray(d.invalid) ? (d.invalid as Record<string, unknown>[]) : [];
      return `Repáralos antes (\`atlas check\`). Inválidos: ${invalid
        .map((entry) => `${v.text(entry.type)} ${v.text(entry.id)} (${v.text(entry.code)})`)
        .join(", ")}.`;
    },
  },
  tax_year_unsupported: (d, v) =>
    `El cálculo fiscal aplica el régimen de compensación vigente desde ${year(v, d.first_supported)}; ${year(v, d.year)} es anterior (o no es un año).`,
  invalid_fiscal_date_rule: {
    // The value received is the user's word, shown as typed.
    say: (d, v) =>
      `La fecha fiscal de ${v.word(d.asset_type)} debe ser la de contratación o la fecha valor (recibido: ${v.num(d.value)}): decide el ejercicio de cada operación.`,
    cli: () => "Valores: trade_date (contratación) o value_date (fecha valor) (ADR-0013).",
  },
  invalid_income_category: {
    say: (d, v) =>
      `La categoría de renta de ${v.word(d.asset_type)} debe ser ganancia patrimonial o rendimiento del capital mobiliario (recibido: ${v.num(d.value)}): decide en qué parte de la base del ahorro entra cada venta.`,
    cli: () =>
      "Valores: capital_gain (ganancia patrimonial) o movable_capital (rendimiento del capital mobiliario) (ADR-0021).",
  },
  negative_target_weight: (d, v) =>
    `El peso objetivo de ${v.one(d.asset_id)} no puede ser negativo (recibido: ${v.num(d.value)}).`,
  accept_invalid_not_allowed: {
    say: (d, v) =>
      `Sobre eventos que quedan inválidos solo puede escribirse un cambio de configuración, no ${v.kind(d.type)}.`,
    cli: () => "--accept-invalid solo se admite en un cambio de configuración (ADR-0015).",
  },
  newly_invalid_events: (d, v) =>
    `Este cambio de configuración deja inválidos ${counted(v, v.count(d.affected), "evento ya registrado", "eventos ya registrados")}.`,
};
