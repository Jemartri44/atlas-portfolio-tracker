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

/**
 * The row-shaped concepts: one field of one disposal, and the two totals the
 * form prints under each section.
 */
type RowConceptId = `gp.${SectionId}.${RowFieldId | "gains" | "losses"}`;

/**
 * What each figure **is**, in Spanish, for a human reading it beside Renta WEB.
 *
 * It lives in the domain, next to the vocabulary it names, and not in each
 * interface, because it is not presentation: it is what tells the user that
 * this number is the transmission value and that one is the acquisition value.
 * Most tax years have no checked box table —2025 is the only one that has one
 * and the user's first real return is 2026— so this, and not the label of the
 * form, is what the reader has in the normal case. Two interfaces wording it
 * apart would be two answers to a fiscal question.
 *
 * There is precedent for Spanish prose down here: the box table of 2025 carries
 * the literal labels of the form, word for word.
 *
 * It is split in two so that no impossible combination has to be invented: a
 * section has the fields `SECTION_FIELDS` gives it, and `gp.crypto.nif` is a
 * string the type admits and the layout never emits. The compiler still holds
 * the whole of it — a new `RowFieldId` breaks the first table, a new concept of
 * any other shape breaks the second — which is the guarantee `CRITERION_NAMES`
 * gives and the two `Record<string, string>` maps of N8 did not.
 */
export const ROW_FIELD_NAMES: Record<RowFieldId | "gains" | "losses", string> = {
  nif: "NIF de la entidad",
  name: "Denominación de los valores",
  transmission: "Importe de las transmisiones",
  acquisition: "Valor de adquisición",
  gain: "Ganancia patrimonial",
  gain_net: "Ganancia patrimonial no exenta",
  gain_imputable: "Ganancia imputable al ejercicio",
  loss: "Pérdida patrimonial",
  loss_imputable: "Pérdida patrimonial computable",
  gains: "Suma de ganancias patrimoniales",
  losses: "Suma de pérdidas patrimoniales",
};

/** Every other concept: the ones that are not one field of one disposal. */
export const CONCEPT_NAMES: Record<Exclude<ConceptId, RowConceptId>, string> = {
  "rcm.interest": "Intereses",
  "rcm.dividends": "Dividendos",
  "rcm.transmission": "Transmisión de activos financieros",
  "rcm.gross_total": "Total de rendimientos íntegros",
  "rcm.expenses": "Gastos de administración y depósito",
  "rcm.net": "Rendimiento neto",
  "rcm.net_reduced": "Rendimiento neto reducido",
  "rcm.integrated": "Rendimiento neto a integrar",
  "rcm.balance": "Saldo de rendimientos del capital mobiliario",
  "gp.prior_years.loss": "Pérdida de un ejercicio anterior imputable a este",
  "gp.prior_years.losses": "Suma de pérdidas de ejercicios anteriores",
  "gp.gains_total": "Total de ganancias patrimoniales",
  "gp.losses_total": "Total de pérdidas patrimoniales",
  "gp.balance": "Saldo de ganancias y pérdidas patrimoniales",
  "offset.rcm_against_gp": "Saldo negativo de rendimientos compensado con ganancias patrimoniales",
  "offset.gp_against_rcm":
    "Saldo negativo de ganancias compensado con rendimientos del capital mobiliario",
  "pending.capital_gain.against_same":
    "Pérdidas de ejercicios anteriores compensadas con ganancias",
  "pending.capital_gain.against_other":
    "Pérdidas de ejercicios anteriores compensadas con rendimientos",
  "pending.movable_capital.against_same":
    "Rendimientos negativos de ejercicios anteriores compensados con rendimientos",
  "pending.movable_capital.against_other":
    "Rendimientos negativos de ejercicios anteriores compensados con ganancias",
  "annex.capital_gain.start": "Pendiente al empezar el ejercicio (ganancias y pérdidas)",
  "annex.capital_gain.applied": "Aplicado en este ejercicio (ganancias y pérdidas)",
  "annex.capital_gain.left": "Pendiente para ejercicios futuros (ganancias y pérdidas)",
  "annex.capital_gain.new": "Saldo negativo de este ejercicio (ganancias y pérdidas)",
  "annex.movable_capital.start": "Pendiente al empezar el ejercicio (rendimientos)",
  "annex.movable_capital.applied": "Aplicado en este ejercicio (rendimientos)",
  "annex.movable_capital.left": "Pendiente para ejercicios futuros (rendimientos)",
  "annex.movable_capital.new": "Saldo negativo de este ejercicio (rendimientos)",
  "base.savings": "Base imponible del ahorro",
  "base.savings_taxable": "Base liquidable del ahorro",
  "ddi.income": "Rendimiento obtenido en el extranjero",
  "ddi.foreign_tax": "Impuesto satisfecho en el extranjero",
  "ddi.first_limit": "Límite del convenio",
  "ddi.deduction": "Deducción por doble imposición internacional",
  "withholding.rcm": "Retenciones sobre rendimientos del capital mobiliario",
  "withholding.capital_gain": "Retenciones sobre ganancias patrimoniales",
};

/**
 * What a figure is called, for any concept. Total: the two tables above cover
 * `ConceptId` between them and the compiler checks both.
 */
export const conceptName = (concept: ConceptId): string => {
  const [head, section, field] = concept.split(".") as [string, string, string];
  if (head === "gp" && (SECTIONS as readonly string[]).includes(section)) {
    return ROW_FIELD_NAMES[field as RowFieldId | "gains" | "losses"];
  }
  return CONCEPT_NAMES[concept as Exclude<ConceptId, RowConceptId>];
};

/** The fields the ledger cannot fill: it holds no tax identification number of anybody. */
export const MISSING_FIELDS: ReadonlySet<RowFieldId> = new Set(["nif"]);

/**
 * Concepts whose box carries a **sign**, because the form says so. The help of
 * Renta WEB for box 0031: "Los rendimientos negativos se consignarán precedidos
 * del signo menos (-)". Everywhere else the form splits positive and negative
 * into two boxes —gains and losses, 0424 and 0425— and the number of the box
 * is what says which of the two it is.
 *
 * It decides **which box**, and nothing else: the amount shown always carries
 * its own sign, with or without a table, because a year with no checked table
 * has no box number to say it instead.
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

/**
 * The blocks the form is read in, in its order. It is **structure**, not
 * presentation: which figures go together is decided by the Modelo 100, and
 * both interfaces have to group them the same way or the two outputs stop
 * being comparable. Each interface puts its own Spanish on them.
 */
export const BOX_BLOCKS = [
  "rcm",
  "iic",
  "etf",
  "listed_shares",
  "crypto",
  "other",
  "prior_years",
  "offsetting",
  "base",
  "annex",
  "deductions",
] as const;
export type BoxBlockId = (typeof BOX_BLOCKS)[number];

/**
 * Which block a concept belongs to. Total by construction: every concept of
 * `ConceptId` starts with one of the prefixes below, and the compiler checks it
 * through the return type, so a concept added tomorrow lands somewhere instead
 * of silently disappearing from every screen.
 */
export const blockOfConcept = (concept: ConceptId): BoxBlockId => {
  if (concept.startsWith("rcm.")) {
    return "rcm";
  }
  if (concept.startsWith("gp.")) {
    const section = concept.slice("gp.".length).split(".")[0] as string;
    if ((SECTIONS as readonly string[]).includes(section)) {
      return section as BoxBlockId;
    }
    if (section === "prior_years") {
      return "prior_years";
    }
    return "offsetting";
  }
  if (concept.startsWith("offset.") || concept.startsWith("pending.")) {
    return "offsetting";
  }
  if (concept.startsWith("annex.")) {
    return "annex";
  }
  if (concept.startsWith("base.")) {
    return "base";
  }
  return "deductions";
};
