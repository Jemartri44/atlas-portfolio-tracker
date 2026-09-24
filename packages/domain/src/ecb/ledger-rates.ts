// The ECB rates the ledger carries, found through **the one enumeration** of
// the schema (`FX_FIELDS` of `schema/validate.ts`, with its dimension for the
// effects of a corporate action; decisions (q) and (bb) of prompt 012). Nothing
// here keeps a list of its own.
//
// Each rate is a **point**: which field, which currency, what was recorded,
// and the **reference date** whose official rate applies — the date that
// confirmed table of the direction fixes (`specs/012-ecb-reference-rates/
// plan.md` §5, D3):
//
//   buy, sell            the fiscal date (`fiscal_date_rule` of the asset)
//   swap                 the fiscal date of the leg handed over
//   dividend, interest, standalone_fee, cash_deposit, cash_withdrawal,
//   fx_exchange          their value_date
//   valuation            its date
//   forced_sale effect   the effective_date of the corporate action
//   grant effect         its acquisition_date
//
// which is exactly what the projection already uses to order them and to warn
// `fx_rate_date_after_fiscal_date` (`businessDateOf`, `warnFxDate`).

import { type CivilDate, isCivilDate } from "../dates/civil-date.js";
import { isDecimalString } from "../money/decimal.js";
import { businessDateOf, isOperationEvent } from "../projections/project-ledger.js";
import type { LedgerState } from "../projections/state.js";
import type { EffectOp, LedgerEvent } from "../schema/events.js";
import { FX_FIELDS } from "../schema/validate.js";

export interface RatePoint {
  /** The field, as the line writes it: `fx_rate`, `fx_rate_bought`, `effects[1].fx_rate`. */
  readonly path: string;
  /** The field of its date, same notation. */
  readonly datePath: string;
  readonly currency: string;
  /** What the line recorded; absent in a draft still being filled in. */
  readonly rate?: string;
  readonly rate_date?: CivilDate;
  /** The date whose official rate applies. */
  readonly reference: CivilDate;
  /** Whether that date is the fiscal one (derived from `fiscal_date_rule`) or a business date. */
  readonly basis: "fiscal" | "business";
}

type Fields = Readonly<Record<string, unknown>>;
type Pairs = Partial<Record<string, readonly (readonly [string, string])[]>>;
type Dates = Partial<Record<string, readonly string[]>>;

const FISCAL_TYPES = new Set(["buy", "sell", "swap"]);

/**
 * The reference date of an event, or `undefined` when a draft does not have
 * the dates yet. A buy or a sale whose asset is unknown has none either: its
 * fiscal date depends on the type of the asset.
 */
const referenceOf = (state: LedgerState, event: Fields): CivilDate | undefined => {
  const typed = event as unknown as LedgerEvent;
  if (!isOperationEvent(typed)) {
    return undefined;
  }
  if (FISCAL_TYPES.has(typed.type)) {
    const asset = event.type === "swap" ? event.from_asset_id : event.asset_id;
    if (typeof asset !== "string" || !state.assets.has(asset)) {
      return undefined;
    }
  }
  // A draft without the date its rule reads has no reference yet.
  const date = businessDateOf(state, typed);
  return isCivilDate(date) ? date : undefined;
};

const pointsOf = (
  record: Fields,
  pairs: readonly (readonly [string, string])[],
  dates: readonly string[],
  prefix: string,
  reference: CivilDate,
  basis: RatePoint["basis"],
): RatePoint[] =>
  pairs.flatMap(([currencyField, rateField]) => {
    const currency = record[currencyField];
    if (typeof currency !== "string" || currency === "") {
      return [];
    }
    // Every type the schema has today dates all its rates with one field.
    const dateField = dates[0] as string;
    const rate = record[rateField];
    const rateDate = record[dateField];
    return [
      {
        path: `${prefix}${rateField}`,
        datePath: `${prefix}${dateField}`,
        currency,
        ...(isDecimalString(rate) ? { rate } : {}),
        ...(isCivilDate(rateDate) ? { rate_date: rateDate } : {}),
        reference,
        basis,
      },
    ];
  });

/** Every ECB rate of an event or of a draft, with the date whose official rate applies. */
export const ratePointsOf = (state: LedgerState, event: Fields): RatePoint[] => {
  const type = String(event.type);
  const reference = referenceOf(state, event);
  if (reference === undefined) {
    return [];
  }
  const basis = FISCAL_TYPES.has(type) ? "fiscal" : "business";
  const own = pointsOf(
    event,
    (FX_FIELDS.pairs as Pairs)[type] ?? [],
    (FX_FIELDS.dates as Dates)[type] ?? [],
    "",
    reference,
    basis,
  );
  const effects = Array.isArray(event.effects) ? (event.effects as Fields[]) : [];
  const nested = effects.flatMap((effect, index) => {
    const op = effect.op as EffectOp;
    const pairs = (FX_FIELDS.effectPairs as Pairs)[op];
    if (pairs === undefined) {
      return [];
    }
    const own = op === "grant" ? effect.acquisition_date : reference;
    if (!isCivilDate(own)) {
      return [];
    }
    return pointsOf(
      effect,
      pairs,
      // An operation with a rate always has its date: the guardian of
      // `FX_FIELDS` (validate.test.ts) holds it field by field.
      (FX_FIELDS.effectDates as Dates)[op] as readonly string[],
      `effects[${index}].`,
      own,
      "business",
    );
  });
  return [...own, ...nested];
};

/** The earliest `fx_rate_date` of the ledger: where the TARGET cross-check starts. */
export const firstRateDateOf = (events: readonly LedgerEvent[]): CivilDate | undefined => {
  let first: CivilDate | undefined;
  const consider = (value: unknown): void => {
    if (isCivilDate(value) && (first === undefined || value < first)) {
      first = value;
    }
  };
  for (const event of events) {
    const record = event as unknown as Fields;
    for (const field of (FX_FIELDS.dates as Dates)[event.type] ?? []) {
      consider(record[field]);
    }
    for (const effect of Array.isArray(record.effects) ? (record.effects as Fields[]) : []) {
      for (const field of (FX_FIELDS.effectDates as Dates)[String(effect.op)] ?? []) {
        consider(effect[field]);
      }
    }
  }
  return first;
};
