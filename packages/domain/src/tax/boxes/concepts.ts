// The **concepts** of the savings base: stable identifiers that do not depend
// on any form (feature 010, block 2; prompt decision (e)).
//
// A box number is a datum of one tax year and nothing else: the Modelo 100
// renumbers every year, and 2025 is the year the ETFs got a section of their
// own. What does **not** change is what a figure *is* — the interest of the
// year, the acquisition value of a disposal, what a loss of 2023 offsets — and
// that is what lives here. The boxes live in `years/`, as data, and a year with
// no checked table produces the same concepts with no numbers at all.
//
// Nothing here reads the ledger or decides an amount: it is a vocabulary.

import type { AssetType } from "../../schema/events.js";
import type { IncomeCategory } from "../../settings/settings.js";

/**
 * Where a disposal is declared. The section is a **fiscal criterion** and not a
 * detail of the form (prompt decision (f), criterion of ficha F1): it decides
 * how the disposal is declared, so it is numbered in `docs/fiscal-questions.md`
 * before it is written here.
 *
 * `other` is "otros elementos patrimoniales", which in 2025 has **no checked
 * mapping**: the only thing that would land there is an ETC or an ETP the user
 * configured as a capital gain, and no official text says where that goes. It
 * exists so the figure is still shown, without a number, saying so.
 */
export const SECTIONS = ["iic", "etf", "listed_shares", "crypto", "other"] as const;
export type SectionId = (typeof SECTIONS)[number];

/**
 * The fields the form asks for, one disposal at a time (ficha F2: one row per
 * operation, never a global row per fund, because a global row cannot say which
 * part of a loss is imputable).
 *
 * Which of them a section has is a datum of the year: the section of listed
 * shares has no "denominación de la sociedad" and the crypto one has no NIF.
 */
export const ROW_FIELDS = [
  "nif",
  "name",
  "transmission",
  "acquisition",
  "gain",
  "gain_net",
  "gain_imputable",
  "loss",
  "loss_imputable",
] as const;
export type RowFieldId = (typeof ROW_FIELDS)[number];

/**
 * Every concept the layout knows. A template literal for the per-operation
 * fields, so the compiler refuses a section or a field that does not exist.
 */
export type ConceptId =
  // Movable capital income (art. 25 LIRPF), page 5 of the form.
  | "rcm.interest"
  | "rcm.dividends"
  | "rcm.transmission"
  | "rcm.gross_total"
  | "rcm.expenses"
  | "rcm.net"
  | "rcm.net_reduced"
  | "rcm.integrated"
  | "rcm.balance"
  // One row per disposal, by section.
  | `gp.${SectionId}.${RowFieldId}`
  | `gp.${SectionId}.gains`
  | `gp.${SectionId}.losses`
  // Losses of earlier years that become imputable this one (ficha F5). Only
  // losses: what is still deferred of a given loss never grows, so a year never
  // brings a **gain** back from an earlier one. The form has boxes for that
  // (0392, 0393) and they belong to instalment sales, which are out of scope.
  | "gp.prior_years.loss"
  | "gp.prior_years.losses"
  // Totals and balance of capital gains.
  | "gp.gains_total"
  | "gp.losses_total"
  | "gp.balance"
  // Offsetting (art. 49): the year first, then what earlier years left.
  | "offset.rcm_against_gp"
  | "offset.gp_against_rcm"
  | "pending.capital_gain.against_same"
  | "pending.capital_gain.against_other"
  | "pending.movable_capital.against_same"
  | "pending.movable_capital.against_other"
  // Annex C.3: what each origin year had, what this return applies and what is left.
  | "annex.capital_gain.start"
  | "annex.capital_gain.applied"
  | "annex.capital_gain.left"
  | "annex.capital_gain.new"
  | "annex.movable_capital.start"
  | "annex.movable_capital.applied"
  | "annex.movable_capital.left"
  | "annex.movable_capital.new"
  // The base.
  | "base.savings"
  | "base.savings_taxable"
  // Double taxation (#16): only the first limit is computable.
  | "ddi.income"
  | "ddi.foreign_tax"
  | "ddi.first_limit"
  | "ddi.deduction"
  // Withholdings already paid on account.
  | "withholding.rcm"
  | "withholding.capital_gain";

/** The concept of one field of one row. */
export const rowConcept = (section: SectionId, field: RowFieldId): ConceptId =>
  `gp.${section}.${field}`;

/**
 * Which fields a section asks for. It is about **what identifies a disposal of
 * that kind of asset** —a fund by the NIF of its manager, a share by the name
 * of its issuer, a coin by its denomination— so it belongs with the concepts
 * and not with the boxes of a year. Which of them has a number, and which,
 * is the year's business.
 */
export const SECTION_FIELDS: Record<SectionId, readonly RowFieldId[]> = {
  iic: ["nif", "transmission", "acquisition", "gain", "gain_net", "loss", "loss_imputable"],
  etf: ["nif", "name", "transmission", "acquisition", "gain", "gain_net", "loss", "loss_imputable"],
  listed_shares: [
    "name",
    "transmission",
    "acquisition",
    "gain",
    "gain_net",
    "loss",
    "loss_imputable",
  ],
  crypto: [
    "name",
    "transmission",
    "acquisition",
    "gain",
    "gain_net",
    "gain_imputable",
    "loss",
    "loss_imputable",
  ],
  other: ["name", "transmission", "acquisition", "gain", "loss", "loss_imputable"],
};

/** The fields the ledger cannot fill: it holds no tax identification number of anybody. */
export const MISSING_FIELDS: ReadonlySet<RowFieldId> = new Set(["nif"]);

/**
 * Concepts whose box carries a **sign**, because the form says so. The help of
 * Renta WEB for box 0031: "Los rendimientos negativos se consignarán precedidos
 * del signo menos (-)". Everywhere else the form splits positive and negative
 * into two boxes —gains and losses, 0424 and 0425— and each one holds a plain
 * amount, so what the user types is the magnitude.
 */
export const SIGNED_CONCEPTS: ReadonlySet<ConceptId> = new Set<ConceptId>([
  "rcm.interest",
  "rcm.dividends",
  "rcm.transmission",
  "rcm.gross_total",
  "rcm.net",
  "rcm.net_reduced",
  "rcm.integrated",
]);

/**
 * Which section a disposal is declared in (criterion of ficha F1, 2025).
 *
 * The income category decides first: whatever the settings put in
 * `movable_capital` is not a capital gain at all and is declared as income from
 * the transfer of financial assets. By default that is an ETC and an ETP
 * (criterion #24, binding ruling V0267-25). Only if the user configures one of
 * them back as a capital gain does it reach `other`, which has no box.
 */
export const transmissionSection = (
  assetType: AssetType,
  category: IncomeCategory,
): SectionId | "movable_capital" => {
  if (category === "movable_capital") {
    return "movable_capital";
  }
  switch (assetType) {
    case "fund":
    case "money_market":
      return "iic";
    case "etf":
      return "etf";
    case "stock":
      return "listed_shares";
    case "crypto":
      return "crypto";
    // An ETC or an ETP the user configured as a capital gain: no official text
    // says where it goes, so it goes to the section with no number and the
    // output says so.
    default:
      return "other";
  }
};
