// The sync of the ledger between devices (ADR-0026, feature 014), as a
// **separate entry point** of the domain, like `ecb.ts` and `quotes.ts`:
// nothing of the sync may land on the boot path of the web, and the sync is
// explicit — no module that boots or records reaches it. The barrel never
// re-exports any of it, and the architecture test holds that.

export {
  type AppendEntry,
  type AppendResult,
  type DeviceQueueState,
  type LineRejection,
  RemoteError,
  type RemoteLedger,
  type RemoteSnapshot,
} from "./ports/remote-ledger.js";
export { SYNC_ENGINE } from "./sync/reapply.js";
