// Public API of @atlas/domain.

export {
  assertCivilDate,
  type CivilDate,
  compareCivilDates,
  daysInMonth,
  isCivilDate,
  isLeapYear,
  yearOf,
} from "./dates/civil-date.js";
export { madridDateOf, todayInMadrid } from "./dates/madrid.js";
export * from "./errors.js";
export { sha256Hex, utf8Encode } from "./ids/sha256.js";
export { createUlidGenerator, isUlid, type Ulid, type UlidGenerator } from "./ids/ulid.js";
export * from "./money/index.js";
export type { Clock } from "./ports/clock.js";
export type { LedgerStore, LoadedLedger } from "./ports/ledger-store.js";
export type { RandomSource } from "./ports/random.js";
export * from "./projections/cash.js";
export { accounts, assets } from "./projections/catalogue.js";
export { realizedGains } from "./projections/gains.js";
export { investmentIncome } from "./projections/income.js";
export { type IntegrityFinding, integrity } from "./projections/integrity.js";
export { fiscalLots } from "./projections/lots.js";
export {
  type OpenOrder,
  type OpenTransfer,
  pendingOrders,
  pendingTransfers,
} from "./projections/pending.js";
export { type PhysicalPosition, physicalPositions } from "./projections/positions.js";
export {
  isOperationEvent,
  type OperationEvent,
  type ProjectOptions,
  projectLedger,
} from "./projections/project-ledger.js";
export { type SettingsResolution, settingsAt } from "./projections/settings-at.js";
export type * from "./projections/state.js";
export * from "./schema/envelope.js";
export * from "./schema/events.js";
export { fingerprintOf } from "./schema/fingerprint.js";
export { type DecodedLine, decodeLine, encodeLine } from "./schema/line.js";
export {
  MIGRATIONS,
  type Migration,
  type MigrationChain,
  migrate,
} from "./schema/migrations/index.js";
export { validateShape } from "./schema/validate.js";
export { type BusinessDates, fiscalDateOf } from "./settings/fiscal-date.js";
export * from "./settings/settings.js";
export type { UseCaseDeps } from "./usecases/deps.js";
export { loadAndProject, type ProjectedLedger } from "./usecases/project-ledger.js";
export { type RecordOptions, type RecordResult, recordEvent } from "./usecases/record-event.js";
export {
  type CorrectResult,
  correctEvent,
  type ReverseResult,
  reverseEvent,
} from "./usecases/rectify.js";
