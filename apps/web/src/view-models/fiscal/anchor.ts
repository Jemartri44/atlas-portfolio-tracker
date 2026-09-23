// What the screen paints of a substitution the chain applied (ADR-0020).
//
// Apart from `year.ts` because it answers a different question: that one says
// what the return holds, this one says where the engine stopped computing and
// took what a filed return declared, origin by origin (feature 011, block 6
// and its review).

import { Money } from "@atlas/domain";
import type { AnchorDifference, PendingLoss } from "@atlas/domain/fiscal";

/**
 * A year of the chain whose pending losses the engine **replaced** with what a
 * filed return declared (ADR-0020). The screen says it **where the figure it
 * affects is** —the pending losses— because a note at the bottom is a note
 * nobody reads, and what the user is looking at is not what the engine
 * computed (feature 011, block 6).
 */
/**
 * One balance of a substitution, **by its origin**: the year it comes from and
 * its category, which is what decides until when it can be offset. A total
 * would lose it, and two substitutions with the same total and different
 * origins would read the same (review of feature 011).
 */
export interface AnchorRow {
  key: string;
  origin_year: number;
  category: PendingLoss["category"];
  /** What the engine had computed for that origin: zero when it had nothing. */
  computed_eur: Money;
  /** What the return declared for it: zero when it declared nothing. */
  declared_eur: Money;
}

export interface AnchorView {
  key: string;
  year: number;
  rows: AnchorRow[];
  /**
   * What was declared is exactly what the engine computed, origin by origin.
   * The substitution still happened and is still said, but **saying it
   * matches** is what keeps it from reading as a difference.
   */
  matches: boolean;
  /** The anchored year is earlier than the ledger: what was carried from before. */
  before_ledger: boolean;
}

/** The substitution of one year, origin by origin, oldest origin first. */
export const anchorView = (anchor: AnchorDifference): AnchorView => {
  const keyOf = (entry: PendingLoss): string => `${entry.origin_year}|${entry.category}`;
  const computed = new Map(anchor.computed.map((entry) => [keyOf(entry), entry]));
  const declared = new Map(anchor.declared.map((entry) => [keyOf(entry), entry]));
  const zero = Money.zero("EUR");
  const rows = [...new Set([...computed.keys(), ...declared.keys()])]
    .map((key) => {
      const entry = (declared.get(key) ?? computed.get(key)) as PendingLoss;
      return {
        key,
        origin_year: entry.origin_year,
        category: entry.category,
        computed_eur: computed.get(key)?.amount_eur ?? zero,
        declared_eur: declared.get(key)?.amount_eur ?? zero,
      };
    })
    .sort((a, b) => a.origin_year - b.origin_year || a.category.localeCompare(b.category));
  return {
    key: String(anchor.year),
    year: anchor.year,
    rows,
    matches: rows.every((row) => row.computed_eur.eq(row.declared_eur)),
    before_ledger: anchor.before_ledger === true,
  };
};
