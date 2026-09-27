// How many units the sync holds back, for the notice of an invalid ledger
// (review of PR #97, correctness B1). One read-only name of the store of the
// sync, by name, so the notice can load it lazily without reaching the writer
// (`tests/api-access.test.ts`: never a door of the sync with `import()`).

export { browserHeldPending } from "@atlas/adapters/sync";
