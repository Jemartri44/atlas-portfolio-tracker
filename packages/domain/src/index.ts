// Public API of @atlas/domain.

export {
  addDays,
  assertCivilDate,
  type CivilDate,
  compareCivilDates,
  daysBetween,
  daysInMonth,
  isCivilDate,
  isLeapYear,
  isWeekend,
  lastWorkingDay,
  yearOf,
} from "./dates/civil-date.js";
export { madridDateOf, todayInMadrid } from "./dates/madrid.js";
export * from "./errors.js";
export { type ClosedYearImpact, closedYearImpact, type Reading } from "./filings/closed-years.js";
export { fingerprintOfEvents } from "./filings/fingerprint.js";
export { sha256Hex, utf8Encode } from "./ids/sha256.js";
export { createUlidGenerator, isUlid, type Ulid, type UlidGenerator } from "./ids/ulid.js";
export {
  type FiscalAttention,
  fiscalAttention,
  type InformativeTodo,
} from "./informative/attention.js";
export { informativeReturn, model720, model721 } from "./informative/m720.js";
export type * from "./informative/report.js";
export * from "./money/index.js";
export type { Clock } from "./ports/clock.js";
export type { LedgerStore, LoadedLedger } from "./ports/ledger-store.js";
export type { RandomSource } from "./ports/random.js";
export {
  type BenchmarkGap,
  type BucketPosition,
  type BucketPositions,
  type BucketThesisView,
  bucketPositions,
  bucketTheses,
} from "./projections/bucket.js";
export {
  type BucketControls,
  type BucketReport,
  type BucketStats,
  bucketStats,
  type ControlGap,
  type DrawdownPoint,
  type ExcludedThesis,
} from "./projections/bucket-stats.js";
export * from "./projections/cash.js";
export { accounts, assets } from "./projections/catalogue.js";
export {
  type ContributionInput,
  type ContributionPlan,
  type ContributionRow,
  contributionPlan,
} from "./projections/contribution.js";
export {
  type CashSettlement,
  type CorporateActionDraft,
  type CorporateActionParams,
  corporateActionDraft,
  type FractionRow,
} from "./projections/corporate-action-draft.js";
export {
  type BucketCostRow,
  type CoreCostRow,
  type CoreCostTotals,
  type CostSummary,
  costSummary,
  type StandaloneFeeRow,
  type StandaloneFees,
} from "./projections/costs.js";
export { deepCheck } from "./projections/deep-check.js";
export { realizedGains } from "./projections/gains.js";
export { investmentIncome } from "./projections/income.js";
export { type IntegrityFinding, integrity } from "./projections/integrity.js";
export {
  checkEffectsAgainstKind,
  KIND_RULES,
  type KindRule,
  type ResolvedEffect,
  type Step,
  type Target,
  targetOf,
} from "./projections/kind-rules.js";
export {
  type EntryFilter,
  type EntryStatus,
  type LedgerEntry,
  ledgerEntries,
} from "./projections/ledger-entries.js";
export { fiscalLots } from "./projections/lots.js";
export {
  type CashBlock,
  type CashLine,
  type NetWorth,
  type NetWorthShares,
  netWorth,
} from "./projections/networth.js";
export {
  type OpenOrder,
  type OpenTransfer,
  pendingOrders,
  pendingTransfers,
  type TransferWatch,
  transferWatch,
  type WatchedTransfer,
} from "./projections/pending.js";
export { type PhysicalPosition, physicalPositions } from "./projections/positions.js";
export {
  type ExternalPrices,
  type ExternalQuote,
  manualPrices,
  type PriceLookup,
  type PriceOrigin,
  priceAt,
  priceDates,
} from "./projections/prices.js";
export {
  isOperationEvent,
  type OperationEvent,
  type ProjectOptions,
  projectLedger,
} from "./projections/project-ledger.js";
export {
  type BucketIndexPoint,
  type BucketIndexSeries,
  bucketIndexSeries,
  type NetWorthPoint,
  type NetWorthSeries,
  netWorthSeries,
  type SeriesOptions,
  sampleEvenly,
} from "./projections/series.js";
export { type SettingsResolution, settingsAt } from "./projections/settings-at.js";
export {
  type FiscalYearImpact,
  movedFiscalYears,
  type SilencedWarnings,
  silencedWarnings,
} from "./projections/settings-impact.js";
export {
  type SimulateTransferInput,
  simulateTransfer,
  type TransferSimulation,
} from "./projections/simulate-transfer.js";
export { type Snapshot, snapshotDiff, snapshotOf, sortKeysDeep } from "./projections/snapshot.js";
export type * from "./projections/state.js";
export { theses } from "./projections/theses.js";
export { type ValuationAt, valuations } from "./projections/valuations.js";
export {
  type ClassSubtotal,
  type CoreWeightRow,
  type CoreWeights,
  coreWeights,
} from "./projections/weights.js";
export * from "./schema/envelope.js";
export * from "./schema/events.js";
export { fingerprintOf } from "./schema/fingerprint.js";
export {
  canonicalLine,
  type DecodedLine,
  decodeLine,
  encodeLine,
  parseLine,
} from "./schema/line.js";
export {
  CURRENT_LEDGER_SCHEMA,
  type LedgerSchema,
  type Migration,
  migrate,
} from "./schema/migrations/index.js";
export { knownFieldsOf, validateShape } from "./schema/validate.js";
export { type BusinessDates, fiscalDateOf } from "./settings/fiscal-date.js";
export * from "./settings/settings.js";
export { washSaleWindowEnd } from "./settings/wash-sale.js";
export * from "./synth/index.js";
export { taxBoxes } from "./tax/boxes/boxes.js";
export {
  BOX_BLOCKS,
  type BoxBlockId,
  blockOfConcept,
  type ConceptId,
  ROW_FIELDS,
  type RowFieldId,
  SECTIONS,
  type SectionId,
  transmissionSection,
} from "./tax/boxes/concepts.js";
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
export type * from "./tax/report.js";
export {
  FIRST_SUPPORTED_YEAR,
  type MovedTaxYear,
  movedTaxYears,
  type TaxOptions,
  taxYear,
} from "./tax/year.js";
export {
  archiveNameFor,
  type CompactDeps,
  type CompactPlan,
  type CompactResult,
  compactLedger,
  planCompact,
  type VersionCount,
} from "./usecases/compact.js";
export type { UseCaseDeps } from "./usecases/deps.js";
export {
  type EventEffect,
  type EventPreview,
  type PreviewOptions,
  previewCorrection,
  previewEvent,
  previewReversal,
} from "./usecases/preview-event.js";
export { loadAndProject, type ProjectedLedger } from "./usecases/project-ledger.js";
export {
  completeDraft,
  type RecordOptions,
  type RecordResult,
  recordEvent,
} from "./usecases/record-event.js";
export {
  type CorrectResult,
  correctEvent,
  type PreparedCorrection,
  prepareCorrection,
  type ReverseResult,
  reverseEvent,
} from "./usecases/rectify.js";
