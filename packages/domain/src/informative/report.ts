// The shape of a Modelo 720 or 721 (feature 010, block 3).
//
// It lives **outside `tax/`** and that is not tidiness: this is the only fiscal
// route the law makes value things at market price, and the income tax may not
// depend on a price (constitution II). Keeping the two apart is what lets the
// architecture test go on proving it, now with this module inside the
// repository: nothing of `tax/` nor `project-ledger.ts` reaches anything here,
// at any depth.
//
// The verdict fails safe (decision (h) of the prompt): "not obliged" is only
// ever said when **every** asset of the category has a value and a rate of
// 31 December. Anything less is "cannot be determined", with what is missing
// as an action — unless what is known already exceeds the threshold, in which
// case it is "obliged" and the output names the flagged values that decided it.

import type { CivilDate } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import type { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import type { Warning } from "../projections/state.js";
import type { AccountId, AssetId, FilingCategory } from "../schema/events.js";
import type { InformativeModel } from "../settings/settings.js";
import type { CriterionId } from "../tax/criteria.js";

/** Why a value is not the one the rule asks for, or is not there at all. */
export type ValueFlag =
  /** The valuation is not dated 31 December: it is shown, with its date. */
  | "valuation_not_year_end"
  /** The ECB rate is not the last weekday on or before 31 December. */
  | "rate_not_year_end"
  /** There is no registered valuation at all: never interpolated, never zero. */
  | "price_missing";

// There is no `rate_missing`: a balance in a currency implies an operation in
// that currency, and every operation carries its ECB rate (ADR-0013). What the
// ledger can be short of is a rate **of 31 December**, and that is
// `rate_not_year_end`, which is the case question Q5 is about.

/** One asset as the model declares it: cash is **the account**, a security is (account, asset). */
export interface InformativeItem {
  category: FilingCategory;
  account_id: AccountId;
  asset_id?: AssetId;
  /** Securities and crypto: the physical position at 31 December. */
  quantity?: Quantity;
  /** Value in euros at 31 December, rounded half-up to cents **once** (#6). */
  value_eur?: Money;
  /** Cash: the average of the daily balances of the fourth quarter, in euros. */
  q4_average_eur?: Money;
  /** Cash: what the account holds at 31 December, currency by currency. */
  balances?: { currency: string; amount: Money; q4_average: Money; days: number }[];
  /** Where the price came from, when there is one. */
  valuation_date?: CivilDate;
  unit_value?: string;
  fx_rate?: string;
  fx_rate_date?: CivilDate;
  flags: ValueFlag[];
}

/** Why the category obliges, or is about to. */
export interface VerdictReason {
  kind: /** The category is above the threshold for the first time. */
    | "threshold"
    /** It rose more than the increase over the last return filed. */
    | "increase"
    /** The same, on the average of the fourth quarter of the accounts. */
    | "increase_q4_average"
    /** The category was not declared in the last return, so it counts as a first time. */
    | "first_time_category"
    /** An asset of the last return is no longer held. */
    | "extinction"
    /** Not obliged, but close enough that the user asked to be told. */
    | "alert";
  before_eur?: Money;
  after_eur?: Money;
  /** The asset that is gone, for an extinction. */
  account_id?: AccountId;
  asset_id?: AssetId;
  /** The year of the return it is compared against. */
  against_year?: number;
}

export interface InformativeCategory {
  category: FilingCategory;
  items: InformativeItem[];
  /** The sum of the **rounded** values of the assets (#6): the category is a sum of assets. */
  value_eur: Money;
  /** Accounts only: the same for the average of the fourth quarter. */
  q4_average_eur?: Money;
  /** Every asset has a value and none of them is flagged. */
  complete: boolean;
  /**
   * What the category is of the threshold, as a percentage with one decimal
   * ("62.5"). Computed here and not in each interface: it is a derived value
   * like every other, and two interfaces dividing it apart is two answers to
   * "how close am I". Absent when the threshold is zero, which the settings
   * allow and which has no percentage.
   */
  threshold_share_pct?: string;
  /**
   * `not_applicable` when there is no verdict to give: a 31 December that has
   * not arrived, or a year before the model existed. It is not "no": it is the
   * question not being asked yet.
   *
   * `nothing_recorded` is the category with **no asset at all** in it. It is
   * not `not_obliged` either: a ledger where nothing abroad has been written
   * down is not a ledger that was computed and came out under the threshold,
   * and telling somebody who has entered nothing that they are "not obliged"
   * is exactly the kind of statement this project does not make.
   */
  verdict: "obliged" | "not_obliged" | "nothing_recorded" | "undetermined" | "not_applicable";
  reasons: VerdictReason[];
  /** What is missing before the category can be decided, as an action. */
  missing: { account_id: AccountId; asset_id?: AssetId; flag: ValueFlag }[];
  /** Flagged values the verdict was reached with anyway (S16): the output names them. */
  decided_with: { account_id: AccountId; asset_id?: AssetId; flag: ValueFlag }[];
}

/** What the last return of the model declared, next to what the ledger says today. */
export interface FiledComparison {
  filing_id: Ulid;
  filed_at: CivilDate;
  tax_year: number;
  categories: {
    category: FilingCategory;
    declared_eur?: Money;
    declared_q4_average_eur?: Money;
    computed_eur?: Money;
    computed_q4_average_eur?: Money;
  }[];
}

export interface InformativeReturn {
  model: InformativeModel;
  year: number;
  /** Both books, per taxpayer: the first exception of constitution III. */
  scope: "fiscal_total";
  today: CivilDate;
  /**
   * `closed_year` for a 31 December that has already happened, which is the
   * only case that has a verdict; `current_year` shows what there is on the day
   * of the query and says so, because the model is about one date and that date
   * has not arrived; `before_model` is a year in which the model did not exist
   * yet, which the 721 has plenty of.
   */
  period: "closed_year" | "current_year" | "before_model";
  threshold_eur: Money;
  increase_eur: Money;
  alert_eur: Money;
  categories: InformativeCategory[];
  /** Accounts left out because they are Spanish, with the reason (business-rules §5.8). */
  excluded: { account_id: AccountId; reason: "domestic_account" }[];
  /** The return of this very year, when one was filed. */
  filed?: FiledComparison;
  /** The last one filed for an earlier year, which is what the increase is measured against. */
  previous?: FiledComparison;
  criteria: CriterionId[];
  notes: Warning[];
}
