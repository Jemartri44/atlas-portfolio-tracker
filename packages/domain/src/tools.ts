// The tools of the screens opened on demand, as a **separate entry point** of
// the domain (feature 015, E5; decision of the direction on Q12, §33): the
// draft of a corporate action, the deep check of the raw lines and the
// simulation of a transfer. The same code as always; what this file adds is a
// door of its own, for the same reason as `fiscal.ts`: the barrel of the domain
// is one module the browser downloads at boot, and these three were riding in
// it for screens a user opens now and then — about 12.6 KB of source on the
// boot path. Imported from here, `@atlas/domain/tools`, by whoever needs them;
// the barrel never exports them again (`tests/architecture.test.ts`).

export {
  type CashSettlement,
  type CorporateActionDraft,
  type CorporateActionParams,
  corporateActionDraft,
  type FractionRow,
} from "./projections/corporate-action-draft.js";
export { deepCheck } from "./projections/deep-check.js";
export {
  type SimulateTransferInput,
  simulateTransfer,
  type TransferSimulation,
} from "./projections/simulate-transfer.js";
