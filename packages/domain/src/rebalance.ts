// The rebalance proposal, as a **separate entry point** of the domain.
//
// It is the only consumer of the tax engine outside the fiscal screens (it
// estimates the tax of a sale before it is placed), so it lives behind a door of
// its own, `@atlas/domain/rebalance`, and is loaded when the owner presses the
// button, not with the Cartera. The barrel never exports it
// (`tests/architecture/barrels-and-doors.test.ts`).

export {
  type CashMove,
  type ContributionStep,
  type DiagnosisRow,
  type RebalanceInput,
  type RebalancePlan,
  type RebalanceStep,
  rebalancePlan,
  type SaleOrder,
  type SaleStep,
  type SaleTax,
  type StepOutcome,
  type TransferStep,
} from "./projections/rebalance.js";
