// `@atlas/domain/remote-answers` (feature 016, E3; review of PR #108, N3):
// what any client of our API reads of an answer — the error of the closed
// list, the index of the reference data — and the error it throws. A door of
// its own, **not the one of the sync**: the web reaches the client of the
// reference data outside the engine of the sync, and the guardian of the sync
// stays strict, with no exception.

export { RemoteError } from "./ports/remote-ledger.js";
export {
  parseErrorAnswer,
  parseReferenceIndex,
  type ReferenceIndexEntry,
} from "./remote/answers.js";
