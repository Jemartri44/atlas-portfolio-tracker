// The sync of the ledger between devices (ADR-0026, feature 014), as a
// **separate entry point** of the domain, like `ecb.ts` and `quotes.ts`:
// nothing of the sync may land on the boot path of the web, and the sync is
// explicit — no module that boots or records reaches it. The barrel never
// re-exports any of it, and the architecture test holds that.

export {
  type AppendEntry,
  type AppendResult,
  type DeviceQueueState,
  LINE_REJECTION_CODES,
  type LineRejection,
  REMOTE_FAILURE_CODES,
  RemoteError,
  type RemoteLedger,
  type RemoteSnapshot,
} from "./ports/remote-ledger.js";
export type { DeviceChange, DeviceState, SyncStateStore } from "./ports/sync-state-store.js";
export {
  etagOfHeader,
  parseAppendAnswer,
  parseErrorAnswer,
  parseInitAnswer,
  parsePublishAnswer,
} from "./sync/answers.js";
export { syncArchiveName } from "./sync/archive.js";
export {
  type HoldReason,
  type Inspection,
  inspect,
  type LocalSide,
  localChanged,
  planUpload,
  publishFailed,
  remoteContention,
  remoteFailed,
  type SyncStop,
  settle,
  type UploadPlan,
  unitAtEntry,
} from "./sync/client-plan.js";
export {
  type AffectedByUnit,
  evaluateUnit,
  type UnitCheck,
  type UnitFailure,
} from "./sync/evaluate.js";
export {
  DISCARDED_FORMAT,
  type DiscardedRecord,
  HELD_FORMAT,
  type HeldOrigin,
  type HeldReason,
  type HeldRecord,
  type HeldUnit,
  holdRecords,
  parseDiscarded,
  parseHeld,
  recordsText,
  unresolvedHeld,
} from "./sync/held.js";
export { initRefusal, joinWithMine, replaceWithRemote } from "./sync/join.js";
export {
  EMPTY_ETAG,
  lineSha256,
  linesOfText,
  prefixSha256,
  textOfLines,
} from "./sync/lines.js";
export {
  commonPrefix,
  markerFor,
  parseMarker,
  SYNC_FORMAT,
  type SyncConfirmation,
  type SyncMarker,
  type SyncPresence,
  serializeMarker,
  syncConfigured,
  syncConfiguredByText,
} from "./sync/marker.js";
export {
  compactPermission,
  deactivatePermission,
  importPermission,
  type Refusal,
  RefusedError,
  rewritePermission,
  syncPermission,
} from "./sync/permission.js";
export { type ReapplyBase, type ReapplyOutcome, reapplyUnits } from "./sync/reapply.js";
export {
  type AppendAcceptance,
  acceptAppend,
  acceptInit,
  initDuplicateIds,
  parseAppendBody,
  parseInitBody,
  parsePublishBody,
  type RemoteRules,
} from "./sync/remote.js";
export {
  assertRedoRecorded,
  confirmHeld,
  decisionOf,
  discardHeld,
  heldUnitById,
  type RedoPlan,
  type Resolution,
  redoFinished,
  redoneLines,
  resolutionsFor,
  sealedIds,
  startRedoPlan,
} from "./sync/resolve.js";
export { canonicalForRewrite, classifyAgainst, REWRITTEN_BY_COMPACT } from "./sync/rewrite.js";
export { SEALS_PREFIX, sealHolds, sealsPrefix } from "./sync/seal.js";
export { entriesOf, type QueueUnit, unitsOf } from "./sync/units.js";
