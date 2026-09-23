// The shape of the tax report of one year (feature 009). Every figure opens
// into the events that produce it (decision (c)), and every figure says which
// fiscal criteria it depends on (decision (b)).
//
// Amounts are `Money` in euros, **exact** and, where a figure enters the
// return, also rounded half-up to cents once per operation (criterion #6,
// ADR-0005). `taxReportJson` turns the whole thing into plain JSON with
// decimals as strings: it is what `--json` prints and what the proof without
// prices compares byte for byte.

import type { CivilDate } from "../dates/civil-date.js";
import type { FilingComparison } from "../filings/comparison.js";
import type { Ulid } from "../ids/ulid.js";
import type { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import type { Warning } from "../projections/state.js";
import type { AccountId, AssetId, AssetType, Book, IncomeBase } from "../schema/events.js";
import type { IncomeCategory } from "../settings/settings.js";
import type { Certainty, CriterionId, RiskDirection } from "./criteria.js";

/** An amount as the operation recorded it, with the ECB rate as published and its date (ADR-0013). */
export interface Converted {
  amount: Money;
  fx_rate: string;
  fx_rate_date: CivilDate;
  eur: Money;
}

/** One step of a lot's lineage, from the lot consumed back to the acquisition that created its root. */
export interface LineageStep {
  lot_id: string;
  asset_id: AssetId;
  acquisition_date: CivilDate;
  /** The event that created this lot: a buy, a swap, a grant, a transfer, a conversion or a carve-out. */
  event_id: Ulid;
  event_type: string;
}

/** The acquisition at the root of a lineage, with its original amount. */
export interface RootAcquisition {
  event_id: Ulid;
  event_type: string;
  asset_id: AssetId;
  acquisition_date: CivilDate;
  quantity: Quantity;
  /** Cost of the root lot in its currency (fee included for a buy). */
  cost: Converted;
}

export interface TransmissionLot {
  lot_id: string;
  quantity: Quantity;
  cost_eur: Money;
  proceeds_eur: Money;
  gain_eur: Money;
  acquisition_date: CivilDate;
  lineage: LineageStep[];
  root: RootAcquisition;
}

export interface ReleaseLine {
  /** The loss-making transmission the deferral came from. */
  origin_event_id: Ulid;
  origin_fiscal_date: CivilDate;
  lot_id: string;
  amount_eur: Money;
  /** It travelled through a transfer, a conversion or a carve-out (#15). */
  travelled: boolean;
  /** The category of the loss it came from, which is where it is integrated (FR-015). */
  category: IncomeCategory;
}

export interface DeferralLine {
  event_id: Ulid;
  asset_id: AssetId;
  fiscal_date: CivilDate;
  amount_eur: Money;
  amount_eur_rounded: Money;
  units: Quantity;
  sold: Quantity;
  window: string;
  window_start: CivilDate;
  window_end: CivilDate;
  acquisitions: {
    event_id: Ulid;
    fiscal_date: CivilDate;
    units: Quantity;
    amount_eur: Money;
    timing: "prior" | "posterior";
    via_transfer: boolean;
  }[];
}

export interface TransmissionLine {
  event_id: Ulid;
  event_type: "sell" | "forced_sale" | "swap";
  corporate_action_kind?: string;
  account_id: AccountId;
  /** Provenance only: the report aggregates both books (constitution III). */
  book: Book;
  asset_id: AssetId;
  asset_type: AssetType;
  market?: string;
  category: IncomeCategory;
  fiscal_date: CivilDate;
  quantity: Quantity;
  /** What was received, net of the fee, in the currency of the operation. */
  proceeds: Converted;
  fee: Money;
  /** Tax withheld on the disposal (#12), when the operation recorded one. */
  withholding?: Converted;
  cost_eur: Money;
  lots: TransmissionLot[];
  own_eur: Money;
  released: ReleaseLine[];
  released_eur: Money;
  deferred_eur: Money;
  deferral?: DeferralLine;
  /** `own + released − deferred`, exact. */
  computable_eur: Money;
  /** The figure of the return: rounded once, half-up, to cents. */
  computable_eur_rounded: Money;
  provisional_until?: CivilDate;
  criteria: CriterionId[];
}

export interface IncomeLine {
  event_id: Ulid;
  kind: "dividend" | "interest";
  account_id: AccountId;
  asset_id?: AssetId;
  fiscal_date: CivilDate;
  gross: Converted;
  gross_eur_rounded: Money;
  withholding_origin: Money;
  withholding_spain: Money;
  source_country?: string;
  criteria: CriterionId[];
}

/** A standalone fee deducted from movable capital income (art. 26.1.a, criterion #23). */
export interface ExpenseLine {
  event_id: Ulid;
  account_id: AccountId;
  fiscal_date: CivilDate;
  fee_kind: string;
  amount: Converted;
  /** Negative: it reduces the income. */
  amount_eur_rounded: Money;
  criteria: CriterionId[];
}

export interface WithholdingLine {
  event_id: Ulid;
  source: "sell" | "forced_sale" | "dividend" | "interest";
  account_id: AccountId;
  fiscal_date: CivilDate;
  amount: Converted;
  amount_eur_rounded: Money;
  criteria: CriterionId[];
}

export interface DoubleTaxationLine {
  event_id: Ulid;
  source_country?: string;
  gross_eur: Money;
  foreign_tax_eur: Money;
  treaty_pct?: string;
  /** The first limit (#16): foreign tax limited to the treaty rate. Absent when it cannot be computed. */
  deductible_eur?: Money;
  /** What the treaty does not let Spain deduct: to reclaim at source, lost otherwise. */
  not_deductible_eur?: Money;
  criteria: CriterionId[];
}

export interface InKindLine {
  event_id: Ulid;
  asset_id: AssetId;
  fiscal_date: CivilDate;
  amount_eur: Money;
  base: IncomeBase;
  kind?: string;
}

export type BalanceCategory = IncomeCategory;

export interface CompensationStep {
  phase: 1 | 2;
  /** What is offset: this year's negative balance or a pending one of `origin_year`. */
  from: BalanceCategory;
  origin_year: number;
  /** Against the positive balance of this category. */
  against: BalanceCategory;
  amount_eur: Money;
  /** It crossed categories, so the joint limit applied. */
  limited: boolean;
  criteria: CriterionId[];
}

export interface PendingLoss {
  origin_year: number;
  category: BalanceCategory;
  /** Negative. */
  amount_eur: Money;
  /** Last year in which it can still be offset. */
  expires_after: number;
}

export interface Compensation {
  capital_gain_eur: Money;
  movable_capital_eur: Money;
  /** The percentage in force (`savings_offset_limit_pct`, 25 by default). */
  limit_pct: string;
  /** That percentage of each positive balance: the joint limit of both phases. */
  limit_eur: { capital_gain: Money; movable_capital: Money };
  steps: CompensationStep[];
  /** What is left after the year, by origin and category, including this year's. */
  pending: PendingLoss[];
  /** What expired at the end of this year without being offset. */
  expired: PendingLoss[];
  capital_gain_final_eur: Money;
  movable_capital_final_eur: Money;
  base_eur: Money;
}

/** What was declared for a year, as far as the carry-forward is concerned (ADR-0020, Q9). */
export interface FiledAnchor {
  year: number;
  pending: { origin_year: number; category: BalanceCategory; amount_eur: Money }[];
}

export interface AnchorDifference {
  year: number;
  computed: PendingLoss[];
  declared: PendingLoss[];
  /**
   * The anchored year is earlier than the first year with figures: the ledger
   * computes nothing for it, so what it declares is not a difference but what
   * the user carried from before the application (prompt 010, P5).
   */
  before_ledger?: boolean;
}

export type Measure = "difference" | "exposure" | "not_quantifiable";

/**
 * How much a criterion puts at stake in the year, and in which direction.
 *
 * The report carries two lists of these and they hold exactly the same shape,
 * because the question is the same one — *what does this reading put at stake?*
 * — asked of two different kinds of criterion: `doubtful`, where the reading
 * itself is open, and `settled`, where it is not (see `TaxYearReport`).
 */
export interface CriterionStake {
  criterion: CriterionId;
  certainty: Certainty;
  documented_risk: RiskDirection;
  measure: Measure;
  /** Events whose figures depend on it. */
  event_ids: Ulid[];
  /** For a difference: base with the alternative reading minus the current base. */
  base_difference_eur?: Money;
  /** Pending losses to carry at the end of the year, alternative minus current. */
  pending_difference_eur?: Money;
  /** Deferred losses still pending at the end of the year, alternative minus current. */
  deferred_difference_eur?: Money;
  /** For an exposure: the amount of the figures it touches. */
  exposure_eur?: Money;
  /** If the criterion is wrong: declared too much (conservative) or too little (aggressive). */
  direction: RiskDirection | "none";
  /**
   * Why the measure is what it is, as a code the interfaces translate:
   * `invalid_under_alternative` (the other reading leaves `invalid_count`
   * events invalid), `unsupported_under_alternative` (the other reading makes
   * the chain start before the first year the engine can compute, which no
   * repair of the ledger fixes), `lot_in_other_currency` (#4 cannot be
   * recomputed in the
   * currency of the sale), `regime_not_recorded` (an exchange without a word on
   * the neutrality regime: its taxable value is not in the ledger),
   * `no_carrier_left` (#18 read the other way would defer onto no lot: none of
   * the asset is left in the patrimony).
   */
  reason?:
    | "invalid_under_alternative"
    | "unsupported_under_alternative"
    | "lot_in_other_currency"
    | "regime_not_recorded"
    | "no_carrier_left";
  invalid_count?: number;
  /** Markets of the listed securities involved (#2, Q15). */
  markets?: string[];
}

export interface SettingsDiff {
  previous_origin: string;
  current_origin: string;
  /** Absent when the previous settings leave events invalid: then there is no figure to compare. */
  base_before_eur?: Money;
  base_after_eur: Money;
  /** How many events the previous settings leave invalid, when they do. */
  invalid_before?: number;
  /**
   * The previous settings reach below the first supported year, so there is no
   * figure to compare either — the sibling of `invalid_before` for the other
   * way a reading can fail (feature 011, block 4).
   */
  unsupported_before?: boolean;
  changes: {
    event_id: Ulid;
    what: "entered" | "left" | "category" | "computable";
    before?: string;
    after?: string;
  }[];
}

export interface TaxYearReport {
  year: number;
  /** Both books, per taxpayer: the first exception of constitution III. */
  scope: "fiscal_total";
  today: CivilDate;
  settings: { origin: string; from_code: string[] };
  capital_gains: {
    lines: TransmissionLine[];
    gains_eur: Money;
    losses_eur: Money;
    balance_eur: Money;
    /** Releases of a loss of the other category, integrated where they came from. */
    foreign_releases_eur: Money;
  };
  movable_capital: {
    dividends: IncomeLine[];
    interest: IncomeLine[];
    transmissions: TransmissionLine[];
    expenses: ExpenseLine[];
    balance_eur: Money;
    foreign_releases_eur: Money;
  };
  wash_sale: {
    deferred: DeferralLine[];
    released: (ReleaseLine & { event_id: Ulid; fiscal_date: CivilDate })[];
    /**
     * Still deferred at 31/12 of the year: on a lot, or waiting for the lots of
     * a repurchase of the next year (`awaiting_event_id`).
     */
    pending: {
      origin_event_id: Ulid;
      lot_id?: string;
      awaiting_event_id?: Ulid;
      asset_id: AssetId;
      amount_eur: Money;
      travelled: boolean;
    }[];
  };
  compensation: Compensation;
  anchor?: AnchorDifference;
  /**
   * Present only when an income tax return is in force for the year
   * (ADR-0020): what it declared, what the application computed the day it was
   * recorded, what it computes today, and where each difference comes from.
   */
  filing?: FilingComparison;
  base_eur: Money;
  withholdings: { lines: WithholdingLine[]; total_eur: Money };
  double_taxation: {
    lines: DoubleTaxationLine[];
    deductible_eur: Money;
    not_deductible_eur: Money;
  };
  in_kind: InKindLine[];
  /**
   * Criteria whose **reading is open**: anything the document does not hold at
   * high certainty (feature 009, Q8). What is at stake here is at stake because
   * nobody knows which way the law is read.
   */
  doubtful: CriterionStake[];
  /**
   * Criteria whose reading is **settled** —high certainty— and that still move
   * a figure if they are read the other way.
   *
   * It exists because of what happened on 2026-09-23: criteria #18 and #19 rose
   * to high certainty, left the doubtful section, and took with them the money
   * their opposite reading puts at stake — 200,00 € in the case of #19. The
   * figure was still being computed; the last line of the function threw it
   * away.
   *
   * "I do not know how this is read" and "I know how this is read, and this is
   * what is behind it" are **not the same thing**, and putting them in one list
   * loses information in both directions. So the list is split, not filtered,
   * and this half is the settled one. An entry whose other reading moves
   * **nothing** appears too, with its zeros: "we looked and it changes nothing"
   * is information, and filtering by amount is what lost this in the first
   * place. What never appears, here or in `doubtful`, is a criterion **no
   * figure of the year applies**.
   */
  settled: CriterionStake[];
  notes: Warning[];
  settings_diff?: SettingsDiff;
}
