// The savings base laid out **by box**.
//
// A layer over the tax report that recomputes nothing: it takes its
// figures and puts them in the order the Modelo 100 asks for them, with the
// number and the literal label of each box of **that** tax year.
//
// The rule that governs the whole file: a wrong
// box is worse than no box. So the boxes are data per year, and:
//
//   - a year with no checked table gives the concepts with **no numbers at
//     all**, and says so;
//   - a concept with no row in the table of its year gives that figure with no
//     number, and says so;
//   - the table of another year is **never** consulted, at any point. There is
//     no fallback and no "closest year": the Agencia Tributaria renumbers the
//     form every campaign, and a number borrowed from last year is a believable
//     wrong figure that the user types into a real return.

import type { Money } from "../../money/money.js";
import { euRegulatedAdmission } from "../../projections/markets.js";
import type { Asset, Warning } from "../../projections/state.js";
import type { LedgerEvent } from "../../schema/events.js";
import type { ChainCore, TaxOptions } from "../chain.js";
import type { TaxYearReport } from "../report.js";
import { note } from "../shared.js";
import { taxYearWithChain } from "../year.js";
import { type ConceptId, SIGNED_CONCEPTS } from "./concepts.js";
import { type Draft, draftEntries } from "./draft.js";
import type { BoxEntry, BoxMapping, PartialReason, TaxBoxes } from "./report.js";
import { boxesOfYear, type YearBoxes, type YearBoxMapping } from "./years/index.js";

/** The box of a draft in the table of its year, if the table has one for it. */
const mappingOf = (table: YearBoxes, draft: Draft): YearBoxMapping | undefined =>
  draft.origin_year === undefined
    ? table.concepts[draft.concept]
    : (table.by_origin_year[draft.concept]?.[draft.origin_year] ?? table.concepts[draft.concept]);

/**
 * Which of the two boxes a figure goes in, and the amount.
 *
 * The form splits a few figures into a positive box and a negative one, and
 * which of the two a figure lands in is decided here, as it always was.
 *
 * **With a box, the amount is what the user types in it.** The form asks for a
 * magnitude everywhere except in `SIGNED_CONCEPTS`: the label says what the
 * figure is (a loss, an expense, what is pending) and its formulas subtract it
 * ("[0036] – [0037]", "[0422] – [0423]"). Typing `-12` in 0037 would either be
 * refused by Renta WEB or add 24 € to the income, so outside those concepts a
 * figure with a box is shown without its sign.
 *
 * **Without a box, the sign stays.** 2025 is the only year with a checked
 * table and the user's first real return is 2026: with no number and no label,
 * `5,69 €` for a figure that is `−5,69 €` would say the opposite of what it is.
 * `exact_eur` keeps the sign always.
 */
const shown = (
  concept: ConceptId,
  exact: Money,
  mapping: BoxMapping | undefined,
  rounded?: Money,
): { box?: string; label?: string; amount: Money } => {
  const amount = rounded ?? exact.roundToCents();
  if (mapping === undefined) {
    return { amount };
  }
  const magnitude = !SIGNED_CONCEPTS.has(concept);
  const target = magnitude && exact.isNegative() ? mapping.when_negative : undefined;
  return {
    box: target?.box ?? mapping.box,
    label: target?.label ?? mapping.label,
    amount: magnitude ? abs(amount) : amount,
  };
};

const abs = (amount: Money): Money => (amount.isNegative() ? amount.neg() : amount);

interface Collected {
  /** Concepts the table of the year does not have a box for. */
  missingBoxes: Set<string>;
  /** Boxes whose value the ledger does not hold. */
  missingValues: Set<string>;
  /** Boxes the engine cannot compute in full, by the reason why. */
  partial: Map<PartialReason, Set<string>>;
}

const entryOf = (draft: Draft, table: YearBoxes | undefined, found: Collected): BoxEntry => {
  const mapping = table === undefined ? undefined : mappingOf(table, draft);
  const place =
    draft.exact === undefined
      ? { box: mapping?.box, label: mapping?.label, amount: undefined }
      : shown(draft.concept, draft.exact, mapping, draft.rounded);
  if (table !== undefined && mapping === undefined) {
    found.missingBoxes.add(
      draft.origin_year === undefined ? draft.concept : `${draft.concept}:${draft.origin_year}`,
    );
  }
  const where = place.box ?? draft.concept;
  if (draft.missing === true) {
    found.missingValues.add(where);
  }
  if (draft.partial !== undefined) {
    found.partial.set(draft.partial, (found.partial.get(draft.partial) ?? new Set()).add(where));
  }
  return {
    concept: draft.concept,
    ...(draft.section === undefined ? {} : { section: draft.section }),
    ...(draft.row === undefined ? {} : { row: draft.row }),
    ...(draft.origin_year === undefined ? {} : { origin_year: draft.origin_year }),
    ...(place.box === undefined ? {} : { box: place.box }),
    ...(place.label === undefined ? {} : { label: place.label }),
    ...(mapping === undefined || table === undefined
      ? {}
      : {
          source: {
            document: table.document,
            page: mapping.page,
            url: table.url_template.replace("{image}", String(mapping.image)),
          },
          checked_at: table.checked_at,
          certainty: mapping.certainty,
        }),
    ...(place.amount === undefined ? {} : { amount_eur: place.amount }),
    ...(draft.exact === undefined ? {} : { exact_eur: draft.exact }),
    ...(draft.text === undefined ? {} : { text: draft.text }),
    ...(draft.missing === true ? { missing: true } : {}),
    ...(draft.partial === undefined ? {} : { partial: draft.partial }),
    criteria: draft.criteria,
  };
};

/**
 * Keyed by `PartialReason`, not by `string`: an open key lets a reason added
 * tomorrow resolve to `undefined`, and the note that says the engine cannot
 * compute a box whole disappears while the box keeps its figure.
 */
const PARTIAL_MESSAGES: Record<PartialReason, string> = {
  reductions_unknown:
    "the box takes the base less two remainders of reductions the ledger does not hold",
  treaty_limit_only:
    "only the treaty limit is computed: the deduction is the lesser of that and a limit that needs the whole return",
  ledger_withholdings_only: "only the withholdings recorded in the ledger are counted",
};

/** The notes of the report about the ECB rates of a line. */
const RATE_NOTES = new Set([
  "tax_fx_rate_finding",
  "tax_fx_rate_unverified",
  "tax_fx_rate_date_after_fiscal_date",
]);

const notesOf = (year: number, table: YearBoxes | undefined, found: Collected): Warning[] => {
  const notes: Warning[] = [];
  if (table === undefined) {
    notes.push(
      note(
        "tax_boxes_missing_year",
        `the boxes of ${year} have not been checked in an official form: the figures go by concept, with no box numbers`,
        { year },
      ),
    );
    return notes;
  }
  if (found.missingBoxes.size > 0) {
    notes.push(
      note(
        "tax_box_missing",
        `some figures have no box in the form of ${year} and are given by concept`,
        { year, concepts: [...found.missingBoxes].sort() },
      ),
    );
  }
  if (found.missingValues.size > 0) {
    notes.push(
      note("tax_box_value_missing", "the ledger does not hold what some boxes ask for", {
        boxes: [...found.missingValues].sort(),
      }),
    );
  }
  for (const [reason, boxes] of [...found.partial].sort()) {
    notes.push(
      note("tax_box_partial", PARTIAL_MESSAGES[reason], {
        reason,
        boxes: [...boxes].sort(),
      }),
    );
  }
  return notes;
};

/** The layout of a report that has already been computed, with the chain behind it. */
export const boxesOf = (report: TaxYearReport, chain: ChainCore): TaxBoxes => {
  const table = boxesOfYear(report.year);
  const found: Collected = {
    missingBoxes: new Set(),
    missingValues: new Set(),
    partial: new Map(),
  };
  const entries = draftEntries(report, chain).map((draft) => entryOf(draft, table, found));
  const notes = [
    ...notesOf(report.year, table, found),
    // A figure of a box that comes from a line with a rate in doubt carries
    // the same note (ADR-0029, point 8): the boxes are read on their own, and
    // the salvedad has to be there too.
    ...report.notes.filter((entry) => RATE_NOTES.has(entry.code)),
  ];
  // "Otros elementos patrimoniales": where each of its two sections stands.
  if (entries.some((entry) => entry.section === "other_shares")) {
    notes.push(
      note(
        "tax_box_section_doubtful",
        "shares outside the EU regulated markets go to 'otros elementos patrimoniales' with key 2, as the help of the form says; no source extends to the form the equivalence of those markets, so the section is doubtful",
        { section: "other_shares", key: "2" },
      ),
    );
  }
  // A share whose admission Atlas cannot tell (no market, an unknown one, or a
  // mixed venue without an EU ISIN in euros) stays among "acciones
  // negociadas", which is wrong if it is not admitted on an EU regulated market.
  const unknownMarket = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.section === "listed_shares" && entry.row !== undefined ? [entry.row.asset_id] : [],
      ),
    ),
  ]
    .filter(
      (assetId) => euRegulatedAdmission(chain.state.assets.get(assetId) as Asset) === undefined,
    )
    .sort();
  if (unknownMarket.length > 0) {
    notes.push(
      note(
        "tax_box_market_unknown",
        "Atlas cannot tell whether some shares are admitted on an EU regulated market (no market, an unknown one, or Xetra, Frankfurt, Euronext or BME without an EU ISIN in euros): they stay among 'acciones negociadas', which is wrong if they are not",
        { assets: unknownMarket },
      ),
    );
  }
  if (entries.some((entry) => entry.section === "other")) {
    notes.push(
      note(
        "tax_box_other_inferred",
        "an exchange difference of currency, or an ETC or ETP configured as a capital gain, has no section of its own: 'otros elementos patrimoniales' with key 4 is an inference by exclusion, not read in any source",
        { section: "other", key: "4" },
      ),
    );
  }
  // The repurchase has no numbered box: Renta WEB carries a mark in its capture
  // window, so the output says what it is instead of inventing a number.
  if (report.wash_sale.deferred.length > 0 || report.wash_sale.released.length > 0) {
    notes.push(
      note(
        "tax_box_repurchase_has_no_number",
        "the part of a loss that is not computable because of a repurchase is a mark in the capture window, not a numbered box",
        {},
      ),
    );
  }
  return {
    year: report.year,
    scope: "fiscal_total",
    today: report.today,
    mapping: table === undefined ? "none" : "checked",
    ...(table === undefined
      ? {}
      : {
          source: {
            document: table.document,
            url: table.url_template,
            checked_at: table.checked_at,
          },
        }),
    entries,
    notes,
  };
};

/** The savings base of a tax year, laid out by box. */
export const taxBoxes = (
  events: readonly LedgerEvent[],
  year: number,
  options: TaxOptions,
): TaxBoxes => {
  const { report, chain } = taxYearWithChain(events, year, options);
  return boxesOf(report, chain);
};
