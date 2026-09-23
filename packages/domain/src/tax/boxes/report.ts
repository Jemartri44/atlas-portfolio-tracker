// The shape of the savings base laid out by box (feature 010, block 2).
//
// It is a **layout**, not a calculation: every amount comes from
// `TaxYearReport`, and the only arithmetic here is the one the form itself
// does — adding up rows, subtracting the offsets. What it adds is the order of
// the Modelo 100 and, when the year has a checked mapping, the number and the
// literal label of each box with the official document it was read in.

import type { CivilDate } from "../../dates/civil-date.js";
import type { Ulid } from "../../ids/ulid.js";
import type { Money } from "../../money/money.js";
import type { Warning } from "../../projections/state.js";
import type { AccountId, AssetId } from "../../schema/events.js";
import type { Certainty, CriterionId } from "../criteria.js";
import type { ConceptId, SectionId } from "./concepts.js";

/** Where a box number and its label were read, so the reader can go and check. */
export interface BoxSource {
  /** The official document: the order of the BOE that approves the form of the year. */
  document: string;
  /** The page of that document the box is on: an image of the annex, or the annex itself. */
  page: string;
  url: string;
}

/**
 * One box of one tax year. **Data, never logic**: no `if` about the year lives
 * outside the table of years.
 */
export interface BoxMapping {
  box: string;
  /** Transcribed word for word from the form, abbreviations included. */
  label: string;
  page: string;
  certainty: Certainty;
  /**
   * The box used instead when the amount is negative: the form splits a few
   * figures into a positive box and a negative one (0424/0425, 0429/0430).
   */
  when_negative?: { box: string; label: string };
}

/**
 * Why a box the engine shows is not the whole of what the form will hold. It is
 * a code the interfaces translate; the figure is never presented as the amount
 * of the box (prompt: "nunca como el importe de la casilla").
 */
export type PartialReason =
  /** 0510: the base less two remainders of reductions the ledger cannot see (N8). */
  | "reductions_unknown"
  /** 0588: the engine knows the treaty limit, not the effective average rate (#16). */
  | "treaty_limit_only"
  /** 0597, 0603: the withholdings recorded in the ledger, which need not be all of them. */
  | "ledger_withholdings_only";

/** The operation a per-row field belongs to, named by asset and date, never by an internal id. */
export interface BoxRow {
  event_id: Ulid;
  account_id: AccountId;
  asset_id: AssetId;
  fiscal_date: CivilDate;
}

/** One thing the user reads off here and types into the form. */
export interface BoxEntry {
  concept: ConceptId;
  /** The section of the form it belongs to, for the per-operation concepts. */
  section?: SectionId | "movable_capital";
  /** Present on a per-operation field: which disposal it is. */
  row?: BoxRow;
  /** The year a pending loss comes from, for the concepts that have one box per origin. */
  origin_year?: number;
  /** Absent when the year has no checked mapping, or this concept has none in it. */
  box?: string;
  label?: string;
  source?: BoxSource;
  checked_at?: CivilDate;
  certainty?: Certainty;
  /** What to type: rounded half-up to cents once (criterion #6, ficha F2). */
  amount_eur?: Money;
  /** The same figure before rounding: what the invariants are checked on. */
  exact_eur?: Money;
  /**
   * What the **form** will compute from the two values typed above it, when it
   * differs by a cent from the engine's own result (ficha F2). Absent when they
   * agree, which is almost always.
   */
  form_eur?: Money;
  /** A value that is not an amount: the name of a security. */
  text?: string;
  /** The ledger does not hold it (the NIF of a fund): said, never invented. */
  missing?: boolean;
  /** The engine cannot compute the whole of this box. */
  partial?: PartialReason;
  criteria: CriterionId[];
}

export interface TaxBoxes {
  year: number;
  /** Both books, per taxpayer: the first exception of constitution III. */
  scope: "fiscal_total";
  today: CivilDate;
  /**
   * `checked` when the boxes of this year were read in an official document,
   * `none` when they were not. Never the boxes of another year: they are
   * renumbered every campaign, and a believable wrong number is the worst
   * failure this feature can have (prompt decision (e)).
   */
  mapping: "checked" | "none";
  /** The source of the mapping, when there is one. */
  source?: { document: string; url: string; checked_at: CivilDate };
  entries: BoxEntry[];
  notes: Warning[];
}
