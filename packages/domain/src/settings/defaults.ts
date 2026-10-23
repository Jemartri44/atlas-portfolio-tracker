// The settings type, its documented defaults and the accessors that resolve a
// parameter to the value in force (business-rules.md §7).

import type { CivilDate } from "../dates/civil-date.js";
import { Decimal, type DecimalString } from "../money/decimal.js";
import type { AssetType } from "../schema/events.js";

export const FISCAL_DATE_RULES = ["trade_date", "value_date"] as const;
export type FiscalDateRule = (typeof FISCAL_DATE_RULES)[number];

/**
 * What kind of income an asset type produces: a capital gain of article 33
 * LIRPF, or income from movable capital of article 25.2. They offset each other
 * differently —a loss against movable capital income is capped at 25% of its
 * positive balance (art. 49)— so it decides which box a disposal ends up in.
 *
 * It exists because an ETC is legally a debt note and not a collective
 * investment undertaking, so there is a case for its disposal being movable
 * capital income. ADR-0021 left it as configuration so that the case could be
 * answered with a `settings_changed` and not a migration, and criterion #24
 * answered it: since the binding ruling V0267-25, the default of an ETC and an
 * ETP is `movable_capital`. The **tax engine reads it**: it
 * decides which section of the savings base a disposal lands in, and with it
 * how its losses offset.
 */
export const INCOME_CATEGORIES = ["capital_gain", "movable_capital"] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

/**
 * Wash-sale window per asset type, counted date to date in whole months or
 * years (ADR-0014): `"2m"`, `"1y"` or an explicit number of days `"<n>d"`.
 * The tax engine (phase 5) reads it; nothing here interprets it. The type says
 * exactly what `isWashSaleWindow` accepts: any other month or year count is a
 * window the rule does not know, and the compiler must say so.
 */
export type WashSaleWindow = "2m" | "1y" | `${number}d`;

const WASH_SALE_WINDOW_PATTERN = /^(2m|1y|[1-9][0-9]*d)$/;

export const isWashSaleWindow = (value: unknown): value is WashSaleWindow =>
  typeof value === "string" && WASH_SALE_WINDOW_PATTERN.test(value);

export interface TaxBracket {
  up_to?: DecimalString;
  rate_pct: DecimalString;
}

export interface Settings {
  /**
   * Partial by design (ADR-0018): an asset type missing here takes its
   * documented default, so adding a value to the enum never invalidates a
   * `settings_changed` already written.
   */
  fiscal_date_rule: Partial<Record<AssetType, FiscalDateRule>>;
  /** Partial too, and for the same reason (ADR-0018). */
  wash_sale_window: Partial<Record<AssetType, WashSaleWindow>>;
  /**
   * Partial as well, and **optional as a whole**: every `settings_changed`
   * written before ADR-0021 lacks it, and demanding it would make the loader
   * reject them — the hardening ADR-0018 forbids. Absent means the documented
   * default for every type. Read through `incomeCategoryOf`, never off the map.
   */
  income_category?: Partial<Record<AssetType, IncomeCategory>>;
  /** Legacy form, still accepted on load; `<n>` equals `"<n>d"` (ADR-0014). Never written by the CLI. */
  wash_sale_window_days?: Partial<Record<AssetType, number>>;
  /**
   * Whether a `transfer` **in** counts as an acquisition for the wash-sale rule
   * (business-rules.md §5.4, data-schema.md §8.4, fiscal question #2b). Absent
   * means `true`, the prudent reading: it acquires homogeneous securities even
   * though nothing is taxed at the origin, so it defers the loss. Read through
   * `washSaleTransferCounts`, never off the field.
   */
  wash_sale_transfer_counts?: boolean;
  /**
   * Share, in percent, of the positive balance of one category of the savings
   * base (capital gains, movable capital income) that a negative balance of the
   * other can offset (art. 49 LIRPF; fiscal criteria #10 and #22). It has been
   * 10, 15, 20 and 25 in four consecutive years, so it is configuration and not
   * a constant (constitution IV). Absent means
   * `DEFAULT_SAVINGS_OFFSET_LIMIT_PCT`; read through `savingsOffsetLimitPctOf`.
   */
  savings_offset_limit_pct?: DecimalString;
  /**
   * Tax years a negative balance of the savings base can be carried forward
   * (art. 49 LIRPF). Absent means `DEFAULT_LOSS_CARRYFORWARD_YEARS`; read
   * through `lossCarryforwardYearsOf`.
   */
  loss_carryforward_years?: number;
  /**
   * The withholding rate, in percent, that the double taxation treaty with each
   * country allows at source, keyed by ISO 3166-1 alpha-2 of the payer (fiscal
   * criterion #16). **No default on purpose**: each rate is a
   * figure of a treaty, to be verified one by one. A dividend from a country
   * missing here gets no deduction calculated, and the tax report says so;
   * deducting everything withheld abroad would be the aggressive reading.
   */
  treaty_withholding_pct?: Record<string, DecimalString>;
  target_weights?: Record<string, DecimalString>;
  deviation_threshold_pp?: DecimalString;
  satellite_min_weight_pct?: DecimalString;
  monthly_contribution_eur?: DecimalString;
  bucket_pct_of_contribution?: DecimalString;
  bucket_max_cumulative_contribution?: DecimalString;
  bucket_stop_loss_pct?: DecimalString;
  bucket_max_weight_pct?: DecimalString;
  /**
   * The asset that stands for "the boring alternative" of business rule 16. Any
   * `asset_id` of the catalogue, of either book (normally the global fund of
   * the core): it is a performance reference and takes part in no other
   * calculation of the bucket. Its existence is checked when projecting a
   * query, not when writing: the asset may be registered afterwards.
   */
  bucket_benchmark_asset_id?: string;
  stale_price_days?: number;
  /**
   * The legal figures of the informative returns (Models 720 and 721): the
   * amount above which a category obliges, the increase over the last filed
   * return that obliges again, and the amount at which the application warns
   * before either. They are the law of a given year, not a constant of the
   * code (constitution IV): a year computed today has
   * to stay reproducible if the figure changes (ADR-0022). Absent means the
   * documented default; read through `modelThresholdOf`, `modelIncreaseOf` and
   * `modelAlertThresholdOf`, never off the field.
   */
  model_720_threshold_eur?: DecimalString;
  model_720_increase_eur?: DecimalString;
  model_720_alert_threshold_eur?: DecimalString;
  model_721_threshold_eur?: DecimalString;
  model_721_increase_eur?: DecimalString;
  model_721_alert_threshold_eur?: DecimalString;
  /**
   * The income tax season, as `MM-DD`: the weeks in which the fiscal card of
   * the summary goes to the top. The dates of the campaign move every year,
   * so they are configuration too. Read through `rentaSeasonOf`.
   */
  renta_season_start?: string;
  renta_season_end?: string;
  savings_tax_brackets?: TaxBracket[];
  tax_residence?: string;
  notification_email?: string;
  job_frequencies?: Record<string, string>;
  transfer_max_days?: number;
}

/**
 * Value every asset type falls back to when the settings do not mention it
 * (ADR-0018). Complete by construction: the compiler refuses to forget a type
 * added to the enum, which is the whole point of resolving at the point of use
 * instead of demanding complete maps in the ledger.
 */
export const DEFAULT_FISCAL_DATE_RULE: Record<AssetType, FiscalDateRule> = {
  stock: "trade_date",
  etf: "trade_date",
  etc: "trade_date",
  etp: "trade_date",
  crypto: "trade_date",
  fund: "value_date",
  money_market: "value_date",
};

/**
 * Same, for the income category (ADR-0021).
 *
 * An **ETC** and an **ETP** are movable capital income, not a capital gain
 * (criterion #24 of `docs/fiscal-questions.md`): the binding ruling of the DGT
 * V0267-25, of 13/03/2025, holds that an exchange traded commodity is a debt
 * security and "in every case" produces income from the assignment of own
 * capital to third parties (art. 25.2 LIRPF). It is also the prudent side: as
 * movable capital income a loss offsets gains only up to 25 %.
 *
 * The certainty is not the same for the two —high for an ETC, medium for an
 * ETP, whose legal structure varies by product— and the catalogue of criteria
 * says so with a variant each. Both stay configurable: answering this with a
 * `settings_changed` instead of a migration is what ADR-0021 exists for.
 */
export const DEFAULT_INCOME_CATEGORY: Record<AssetType, IncomeCategory> = {
  stock: "capital_gain",
  etf: "capital_gain",
  etc: "movable_capital",
  etp: "movable_capital",
  crypto: "capital_gain",
  fund: "capital_gain",
  money_market: "capital_gain",
};

/**
 * Same, for the wash-sale window (ADR-0013, ADR-0014; verify with the tax
 * advisor).
 *
 * A **fund** takes two months, not a year (criterion #2, corrected on
 * 2026-09-22). What separates the two months of article 33.5 f) from the year
 * of g) is being admitted to trading, and article 4.9 of RD 1082/2012 says,
 * for funds that guarantee daily redemption, that meeting the obligation to
 * publish the net asset value daily "determinará que las participaciones en
 * los correspondientes fondos tengan la consideración de valores admitidos a
 * cotización **a los efectos de aquellas disposiciones que regulen regímenes
 * específicos de inversión**".
 *
 * **That last clause is part of the quote and it narrows it**: article 33.5 f)
 * LIRPF is not obviously one of those provisions, so the regulation on its own
 * is arguable and does not carry the decision. What carries it is the doctrine:
 * the two only consultations on the point (DGT 0011-00 and V2067-06) put fund
 * units under f), and the help of Modelo 100 for 2025 lists funds with daily
 * information among the two-month case; its example of the year is a SICAV of
 * the MAB.
 *
 * **A monetary fund too** (`money_market`), for exactly the same reason and
 * with the same certainty: in this catalogue the type is a **money market
 * fund** —it carries an ISIN, a TER and `transferable`, which is the Spanish
 * transfer regime and only exists for collective investment undertakings— not
 * a treasury bill, a repo or a deposit, which the reasoning would not reach.
 */
export const DEFAULT_WASH_SALE_WINDOW: Record<AssetType, WashSaleWindow> = {
  stock: "2m",
  etf: "2m",
  etc: "2m",
  etp: "2m",
  crypto: "1y",
  fund: "2m",
  money_market: "2m",
};

/** Provisional defaults (ADR-0013, ADR-0014). Verify with the tax advisor; change via `settings_changed`, not code. */
export const DEFAULT_SETTINGS: Settings = {
  fiscal_date_rule: DEFAULT_FISCAL_DATE_RULE,
  wash_sale_window: DEFAULT_WASH_SALE_WINDOW,
  income_category: DEFAULT_INCOME_CATEGORY,
};

/** A `transfer` in counts as an acquisition for the wash-sale rule: the prudent reading (#2b). */
export const DEFAULT_WASH_SALE_TRANSFER_COUNTS = true;

/** Art. 49 LIRPF as understood in September 2026: 25 % since 2018. Verify; change with a `settings_changed`. */
export const DEFAULT_SAVINGS_OFFSET_LIMIT_PCT: DecimalString = "25";

/** Art. 49 LIRPF as understood in September 2026: four years. Verify; change with a `settings_changed`. */
export const DEFAULT_LOSS_CARRYFORWARD_YEARS = 4;

/** The offset limit in force (#10, #22): what the settings say, or its documented default. */
export const savingsOffsetLimitPctOf = (settings: Settings): Decimal =>
  Decimal.parse(settings.savings_offset_limit_pct ?? DEFAULT_SAVINGS_OFFSET_LIMIT_PCT);

/** The carry-forward period in force: what the settings say, or its documented default. */
export const lossCarryforwardYearsOf = (settings: Settings): number =>
  settings.loss_carryforward_years ?? DEFAULT_LOSS_CARRYFORWARD_YEARS;

/** The informative returns on assets held abroad. */
export const INFORMATIVE_MODELS = ["720", "721"] as const;
export type InformativeModel = (typeof INFORMATIVE_MODELS)[number];

/**
 * The figures of the informative returns as understood in September 2026;
 * verify, and change them with a `settings_changed`, never here.
 *
 * - 720, threshold and increase: arts. 42 bis.4.e), 42 bis.5, 42 ter.4.c) and
 *   42 ter.5 of RD 1065/2007.
 * - 721, threshold and increase: arts. 42 quater.5.d) and 42 quater.6.
 * - The warning: `business-rules.md` §7, which is a choice of the user and not
 *   a figure of the law.
 */
export const DEFAULT_INFORMATIVE_LIMITS = {
  "720": { threshold: "50000", increase: "20000", alert: "45000" },
  "721": { threshold: "50000", increase: "20000", alert: "45000" },
} as const satisfies Record<
  InformativeModel,
  { threshold: DecimalString; increase: DecimalString; alert: DecimalString }
>;

/** The amount above which a category of the model obliges to file. */
export const modelThresholdOf = (settings: Settings, model: InformativeModel): Decimal =>
  Decimal.parse(
    settings[`model_${model}_threshold_eur`] ?? DEFAULT_INFORMATIVE_LIMITS[model].threshold,
  );

/** The increase over the last filed return of the model that obliges to file again. */
export const modelIncreaseOf = (settings: Settings, model: InformativeModel): Decimal =>
  Decimal.parse(
    settings[`model_${model}_increase_eur`] ?? DEFAULT_INFORMATIVE_LIMITS[model].increase,
  );

/** The amount at which the application warns, before the threshold obliges. */
export const modelAlertThresholdOf = (settings: Settings, model: InformativeModel): Decimal =>
  Decimal.parse(
    settings[`model_${model}_alert_threshold_eur`] ?? DEFAULT_INFORMATIVE_LIMITS[model].alert,
  );

/** The income tax season as understood in September 2026: from 1 April to 30 June. */
export const DEFAULT_RENTA_SEASON = { start: "04-01", end: "06-30" } as const;

/** The season in force, as two `MM-DD`: what the settings say, or its documented default. */
export const rentaSeasonOf = (
  settings: Pick<Settings, "renta_season_start" | "renta_season_end">,
): { start: string; end: string } => ({
  start: settings.renta_season_start ?? DEFAULT_RENTA_SEASON.start,
  end: settings.renta_season_end ?? DEFAULT_RENTA_SEASON.end,
});

/** The residence the engine assumes when the settings say none. */
export const DEFAULT_TAX_RESIDENCE = "ES";

/** The residence in force as an upper-case country code: absent or blank is Spain. */
export const taxResidenceOf = (settings: { tax_residence?: string | undefined }): string => {
  const value = (settings.tax_residence ?? "").trim().toUpperCase();
  return value === "" ? DEFAULT_TAX_RESIDENCE : value;
};

/**
 * Whether a date falls in the income tax season, both ends included. A rule
 * about when a return is due is a fiscal rule, and it lives
 * here, with the season, so the summary can place its tax card on the first
 * paint (answered 2026-09-27). The date is an argument.
 */
export const inRentaSeason = (
  settings: Pick<Settings, "renta_season_start" | "renta_season_end">,
  date: CivilDate,
): boolean => {
  const season = rentaSeasonOf(settings);
  const day = date.slice(5);
  return day >= season.start && day <= season.end;
};

/**
 * The fiscal year whose return comes next at a date: the previous year until
 * the season ends, and the current one once it has (the return of the year
 * just closed is the next one due, not the one already filed). The end of the
 * season comes from the settings, never from a constant.
 */
export const nextReturnYear = (
  settings: Pick<Settings, "renta_season_start" | "renta_season_end">,
  date: CivilDate,
): number => {
  const year = Number(date.slice(0, 4));
  return date.slice(5) > rentaSeasonOf(settings).end ? year : year - 1;
};

/** The treaty rate for a country, or nothing when the settings do not know it (#16). */
export const treatyWithholdingPctOf = (
  settings: Settings,
  country: string | undefined,
): Decimal | undefined => {
  const rate = country === undefined ? undefined : settings.treaty_withholding_pct?.[country];
  return rate === undefined ? undefined : Decimal.parse(rate);
};

/** The rule in force for an asset type: what the settings say, or its default (ADR-0018). */
export const fiscalDateRuleOf = (settings: Settings, assetType: AssetType): FiscalDateRule =>
  settings.fiscal_date_rule[assetType] ?? DEFAULT_FISCAL_DATE_RULE[assetType];

/**
 * The income category in force for an asset type (ADR-0021). Resolved here and
 * not read off the map, so that an absent type —or an absent map, which is what
 * every line written before ADR-0021 has— takes the documented default and
 * never a category arrived at by elimination.
 *
 * The tax engine calls it for every disposal, and the warning of a settings
 * change compares the two readings through it.
 */
export const incomeCategoryOf = (settings: Settings, assetType: AssetType): IncomeCategory =>
  settings.income_category?.[assetType] ?? DEFAULT_INCOME_CATEGORY[assetType];
