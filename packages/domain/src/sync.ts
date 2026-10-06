// What the API and its clients share about the remote ledger (ADR-0026,
// feature 014; ADR-0035), as a **separate entry point** of the domain, like
// `ecb.ts` and `quotes.ts`: the rules the API applies to a line it appends
// (`acceptAppend`, `acceptInit`), the units a correction travels in, the
// answers a client reads and the port of the remote. There is no queue and no
// client-side sync any more (ADR-0035, E5). The barrel never re-exports any of
// it, and the architecture test holds that.

export {
  type AppendEntry,
  type AppendResult,
  LINE_REJECTION_CODES,
  type LineRejection,
  REMOTE_FAILURE_CODES,
  RemoteError,
  type RemoteLedger,
  type RemoteSnapshot,
} from "./ports/remote-ledger.js";
export {
  etagOfHeader,
  parseAppendAnswer,
  parseErrorAnswer,
  parseInitAnswer,
} from "./sync/answers.js";
export { syncArchiveName } from "./sync/archive.js";
export {
  type AffectedByUnit,
  evaluateUnit,
  type UnitCheck,
  type UnitFailure,
} from "./sync/evaluate.js";
export { initRefusal } from "./sync/init-refusal.js";
export { EMPTY_ETAG, linesOfText, textOfLines } from "./sync/lines.js";
export { type Refusal, RefusedError } from "./sync/permission.js";
export { type ReapplyBase, type ReapplyOutcome, reapplyUnits } from "./sync/reapply.js";
export {
  type AppendAcceptance,
  acceptAppend,
  acceptInit,
  initDuplicateIds,
  parseAppendBody,
  parseInitBody,
  type RemoteRules,
} from "./sync/remote.js";
export { entriesOf, type QueueUnit, unitsOf } from "./sync/units.js";
