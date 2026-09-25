// The use case that re-applies a queue of ledger lines on top of a ledger and
// classifies the result (ADR-0026, Part B), shared by the client and the
// remote. Built in block 3 of feature 014; the guards of block 2 cover this
// folder before a line of it exists.

export const SYNC_ENGINE = "reapply";
