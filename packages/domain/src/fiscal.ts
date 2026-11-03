// The fiscal output, as a **separate entry point** of the domain.
//
// Everything a tax return needs and nothing else: the engine of the income
// tax, the layout by box, the informative returns and the comparison with
// what was filed. It is the same code as always; what this file adds is a door
// of its own, and the reason is the bundle of the web.
//
// The barrel of the domain is one module, and the browser downloads it at boot
// because the first screen projects the ledger. Tree shaking drops the exports
// **nobody** uses, so while no screen asked for the tax engine it was not paid
// for; the moment the fiscal screen imported `taxYear` through the barrel, the
// whole engine and the informative returns landed in the boot chunk — 93 KB
// where the budget is 74, for a screen that is opened a handful of times a
// year. Measured on the real output; `apps/web/scripts/check-bundle.mjs`
// refuses to build it, and that refusal is what found this.
//
// So the fiscal output is imported from here, `@atlas/domain/fiscal`, by
// whoever needs it. A lazily loaded screen that imports this module gets a
// chunk of its own, and the boot path keeps carrying only what the first paint
// needs. It is the same shape the adapters already use (`@atlas/adapters/blob`
// and friends, ADR-0019), and the architecture test holds both ends of it.

export {
  type AfterTaxYear,
  type AfterTaxYearGap,
  type CoreXirrAfterTax,
  coreXirrAfterTax,
} from "./charts/core-xirr-after-tax.js";
export {
  type ClosedYearComparison,
  type ClosedYearImpact,
  type ClosedYearNotCompared,
  closedYearImpact,
  type MovedFigure,
  type Reading,
} from "./filings/closed-years.js";
export type { FilingCauses, FilingComparison, FilingFigure } from "./filings/comparison.js";
export {
  type FigureKind,
  type FilingFigureProposal,
  type FilingMeta,
  type FilingProposal,
  filingProposal,
} from "./filings/proposal.js";
export {
  type FiscalAttention,
  fiscalAttention,
  type InformativeTodo,
} from "./informative/attention.js";
export {
  type CalendarDate,
  type CalendarKind,
  type FiscalCalendar,
  fiscalCalendar,
} from "./informative/calendar.js";
export { FILING_DEADLINES, type FilingDeadline } from "./informative/deadlines.js";
export { informativeReturn, model720, model721 } from "./informative/m720.js";
export type * from "./informative/report.js";
export {
  type SaleOrder,
  type SaleSimulation,
  simulateSale,
} from "./projections/sale-tax.js";
export { taxBoxes } from "./tax/boxes/boxes.js";
export {
  BOX_BLOCKS,
  type BoxBlockId,
  blockOfConcept,
  CONCEPT_NAMES,
  type ConceptId,
  conceptName,
  ROW_FIELD_NAMES,
  type RowFieldId,
  SECTIONS,
  type SectionId,
  transmissionSection,
} from "./tax/boxes/concepts.js";
export {
  CODE_WORDS,
  PACKAGE_COLUMNS,
  type PackageWords,
  packageCsv,
  rentaPackage,
} from "./tax/boxes/package.js";
export type * from "./tax/boxes/report.js";
export { BOX_YEARS } from "./tax/boxes/years/index.js";
export {
  type Certainty,
  CRITERION_IDS,
  type CriterionId,
  FISCAL_CRITERIA,
  type FiscalCriterion,
  isDoubtful,
  type RiskDirection,
  sortCriteria,
} from "./tax/criteria.js";
export { taxBoxesJson, taxReportJson } from "./tax/json.js";
export {
  type QuotaBracket,
  type QuotaNote,
  type SavingsQuota,
  savingsQuota,
} from "./tax/quota.js";
export type * from "./tax/report.js";
export {
  type BlockingSale,
  type RepurchaseBlock,
  type RepurchaseCalendar,
  repurchaseCalendar,
} from "./tax/repurchase-calendar.js";
export {
  SAVINGS_SCALES,
  type SavingsScale,
  type SavingsScaleBracket,
  SCALES_CHECKED_AT,
  savingsScaleOf,
} from "./tax/savings-scale.js";
export {
  FIRST_SUPPORTED_YEAR,
  type MovedTaxYear,
  movedTaxYears,
  type TaxOptions,
  taxYear,
} from "./tax/year.js";
