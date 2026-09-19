// The two fields of the ledger that are not flat — the `effects` of a
// corporate action and the `settings` of a configuration change — told as
// sentences a person reads.
//
// Both used to be printed as raw JSON in the detail of a movement, which was two
// defects at once: a debug dump in the interface, and a **privacy leak**,
// because the quantities, prices and fees inside the JSON were plain text that
// never went through `Amount`. A sentence here is a list of parts, and a part
// that is an amount or a quantity stays a `Money` or a `Quantity` until the
// component paints it through the gate.

import { type AssetId, Decimal, type Effect, Money, Quantity, type Settings } from "@atlas/domain";
import { formatDate } from "../format/date.js";
import { SETTING_LABELS, settingLabel, valueLabel } from "../format/labels.js";
import { displayName, type NameIndex } from "../format/names.js";
import { formatExact, NBSP } from "../format/number.js";

export type Part =
  | { text: string }
  | { amount: Money; decimals?: number }
  | { quantity: Quantity; of?: string };

export type Sentence = Part[];

export interface SettingRow {
  label: string;
  parts: Part[];
}

const t = (text: string): Part => ({ text });

/** Decimals as recorded, never fewer than two: a NAV of 110,5123 is not 110,51. */
export const recordedDecimals = (value: string): number =>
  Math.max(2, value.split(".")[1]?.length ?? 0);

const money = (value: string, currency: string): Part => ({
  amount: Money.parse(value, currency),
  decimals: recordedDecimals(value),
});

/** A ratio as written: `1/4` stays a fraction, `1.7` becomes `1,7`. */
const ratio = (value: string): string => (value.includes("/") ? value : formatExact(value));

const percentOf = (share: string): string =>
  `${formatExact(Decimal.parse(share).mul(Decimal.parse("100")).toString())}${NBSP}%`;

/** The ECB rate and its date, when the currency is not the euro. */
const rateOf = (effect: { currency: string; fx_rate: string; fx_rate_date: string }): Part[] =>
  effect.currency === "EUR"
    ? []
    : [
        t(
          ` Tipo del BCE: ${formatExact(effect.fx_rate)} ${effect.currency} por euro, del ${formatDate(effect.fx_rate_date)}.`,
        ),
      ];

/** One effect of a corporate action, as one sentence per account where it acts per account. */
const sentencesOf = (effect: Effect, eventAsset: AssetId, names: NameIndex): Sentence[] => {
  const asset = displayName(names, effect.asset_id ?? eventAsset);
  switch (effect.op) {
    case "scale":
      return [
        [
          t(
            `La cantidad de cada lote de ${asset} se multiplica por ${ratio(effect.ratio)}, conservando su fecha y su coste total.`,
          ),
        ],
      ];
    case "convert":
      return [
        [
          t(
            `Los lotes de ${asset} pasan a ${displayName(names, effect.to_asset_id)}, ${ratio(effect.ratio)} títulos nuevos por cada uno antiguo, conservando su fecha de adquisición y su coste.`,
          ),
        ],
      ];
    case "carve_out":
      return [
        [
          t(
            `Por cada título de ${asset} se reciben ${ratio(effect.ratio)} de ${displayName(names, effect.to_asset_id)}, que se lleva el ${percentOf(effect.cost_share)} del coste de cada lote y conserva su fecha de adquisición.`,
          ),
        ],
      ];
    case "forced_sale":
      return effect.per_account.map((entry) => [
        ...(entry.quantity === "all"
          ? [t(`Se vende toda la posición de ${asset}`)]
          : [
              t("Se venden "),
              { quantity: Quantity.parse(entry.quantity) },
              t(` títulos de ${asset}`),
            ]),
        t(` en ${displayName(names, entry.account_id)} a `),
        money(effect.unit_price, effect.currency),
        t(" cada uno"),
        ...(entry.fee === undefined
          ? []
          : [t(", con una comisión de "), money(entry.fee, effect.currency)]),
        ...(entry.withholding === undefined
          ? []
          : [t(" y una retención de "), money(entry.withholding, effect.currency)]),
        t("."),
        ...rateOf(effect),
      ]);
    case "grant":
      return effect.per_account.map((entry) => [
        t("Se reciben "),
        { quantity: Quantity.parse(entry.quantity) },
        t(
          ` títulos de ${asset} en ${displayName(names, entry.account_id)}, con un coste unitario de `,
        ),
        money(effect.unit_cost, effect.currency),
        t(` y fecha de adquisición ${formatDate(effect.acquisition_date)}.`),
        ...(effect.income_eur === undefined
          ? []
          : [
              t(" Cuenta como renta de "),
              money(effect.income_eur, "EUR"),
              t(` en la ${valueLabel(effect.income_base).toLowerCase()}.`),
            ]),
        ...rateOf(effect),
      ]);
    default:
      return [[t("Un efecto que esta versión de la aplicación no sabe describir.")]];
  }
};

/** Every effect of a corporate action, in order, as sentences. */
export const effectSentences = (
  effects: readonly Effect[],
  eventAsset: AssetId,
  names: NameIndex,
): Sentence[] => effects.flatMap((effect) => sentencesOf(effect, eventAsset, names));

/** The settings whose value is money, in euros; the rest are percentages, days or words. */
const MONEY_SETTINGS = new Set([
  "monthly_contribution_eur",
  "bucket_max_cumulative_contribution",
  "model_720_alert_threshold_eur",
  "model_721_alert_threshold_eur",
]);

const PERCENT_SETTINGS = new Set([
  "satellite_min_weight_pct",
  "bucket_pct_of_contribution",
  "bucket_stop_loss_pct",
  "bucket_max_weight_pct",
]);

const windowText = (window: string): string =>
  window === "2m" ? "dos meses" : window === "1y" ? "un año" : `${window.slice(0, -1)} días`;

/** A map by asset type, as "Fondo: fecha valor · Acción: fecha de contratación". */
const byType = (map: Record<string, unknown>, show: (value: string) => string): string =>
  Object.entries(map)
    .map(([type, value]) => `${valueLabel(type)}: ${show(String(value))}`)
    .join(" · ");

const settingParts = (key: string, value: unknown, names: NameIndex): Part[] => {
  if (MONEY_SETTINGS.has(key) && typeof value === "string") {
    return [money(value, "EUR")];
  }
  if (PERCENT_SETTINGS.has(key) && typeof value === "string") {
    return [t(`${formatExact(value)}${NBSP}%`)];
  }
  switch (key) {
    case "deviation_threshold_pp":
      return [t(`${formatExact(String(value))}${NBSP}pp`)];
    case "target_weights":
      return [
        t(
          Object.entries(value as Record<string, string>)
            .map(([asset, weight]) => `${displayName(names, asset)} ${formatExact(weight)}${NBSP}%`)
            .join(" · "),
        ),
      ];
    case "fiscal_date_rule":
    case "income_category":
      return [
        t(byType(value as Record<string, unknown>, (rule) => valueLabel(rule).toLowerCase())),
      ];
    case "wash_sale_window":
      return [t(byType(value as Record<string, unknown>, windowText))];
    case "wash_sale_window_days":
      return [t(byType(value as Record<string, unknown>, (days) => `${days} días`))];
    case "bucket_benchmark_asset_id":
      return [t(displayName(names, value))];
    case "stale_price_days":
    case "transfer_max_days":
      return [t(`${String(value)} días`)];
    case "savings_tax_brackets":
      // The limits of the brackets are amounts, and privacy has one rule for
      // every amount: masked. Only the rates stay visible.
      return (value as { up_to?: string; rate_pct: string }[]).flatMap((bracket, index) => [
        ...(index > 0 ? [t(" · ")] : []),
        ...(bracket.up_to === undefined
          ? [t("el resto")]
          : [t("hasta "), money(bracket.up_to, "EUR")]),
        t(` al ${formatExact(bracket.rate_pct)}${NBSP}%`),
      ]);
    case "job_frequencies":
      return [
        t(
          Object.entries(value as Record<string, string>)
            .map(([job, frequency]) => `${valueLabel(job)}: ${valueLabel(frequency).toLowerCase()}`)
            .join(" · "),
        ),
      ];
    default:
      return [t(typeof value === "boolean" ? valueLabel(value) : String(value))];
  }
};

/** A configuration change, one row per setting, in the order of the screen. */
export const settingRows = (settings: Settings, names: NameIndex): SettingRow[] => {
  const order = Object.keys(SETTING_LABELS);
  const record = settings as unknown as Record<string, unknown>;
  return Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map((key) => ({ label: settingLabel(key), parts: settingParts(key, record[key], names) }));
};
