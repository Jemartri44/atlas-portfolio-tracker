// Which ledger the application opens at boot (ADR-0035).
//
// `cloud` is the product: the ledger of S3, read through the API with the
// session of the browser, and nothing of it kept on the device. `local` is the
// ledger in the browser's IndexedDB (ADR-0019), which stays **only** until the
// write half of the cloud (E2b) and the removal of dead code (E5) replace it;
// the tests still drive it by opening a ledger directly. The constant is the
// switch: no screen reads it, they read the phase of the load.

export type LedgerMode = "cloud" | "local";

export const LEDGER_MODE: LedgerMode = "cloud";
