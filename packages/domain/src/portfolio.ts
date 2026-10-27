// The analysis of the Cartera and the Cubo, as a **separate entry point** of the
// domain: the monthly contribution, what the portfolio costs, the statistics
// and control rules of the bucket and its theses against the index. The same
// code as always; what this file adds is a door of its own, for the reason of
// `charts.ts` and `tools.ts`: the barrel is the module the browser downloads at
// boot, and these four serve two screens opened on demand (about 25 KB of
// source on the boot path). Imported from here, `@atlas/domain/portfolio`, by
// whoever needs them; the barrel never exports them
// (`tests/architecture/barrels-and-doors.test.ts`).
//
// Their types are also in the barrel: nothing is downloaded for a type.

export {
  type BucketControls,
  type BucketReport,
  type BucketStats,
  bucketStats,
  type ControlGap,
  type DrawdownPoint,
  type ExcludedThesis,
  NEAR_LIMIT_PCT,
} from "./projections/bucket-stats.js";
export {
  type BenchmarkGap,
  type BucketThesesView,
  type BucketThesisView,
  bucketTheses,
} from "./projections/bucket-theses.js";
export {
  type ContributionInput,
  type ContributionPlan,
  type ContributionRow,
  contributionPlan,
} from "./projections/contribution.js";
export {
  type BucketCostRow,
  type CoreCostRow,
  type CoreCostTotals,
  type CostSummary,
  costSummary,
  type StandaloneFeeRow,
  type StandaloneFees,
} from "./projections/costs.js";
export {
  type FeeEstimate,
  type Order,
  type PlatformLine,
  type PlatformPlan,
  type PlatformRow,
  platformPlan,
  type UnassignedOrder,
} from "./projections/platform-plan.js";
