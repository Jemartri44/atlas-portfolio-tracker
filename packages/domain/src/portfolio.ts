// The analysis of the Cartera and the Cubo, as a **separate entry point** of the
// domain: the monthly contribution, what the portfolio costs, the statistics
// and control rules of the bucket and its theses against the index. The same
// code as always; what this file adds is a door of its own, for the reason of
// `charts.ts` and `tools.ts`: the barrel is the module the browser downloads at
// boot, and these four serve two screens opened on demand (about 25 KB of
// source on the boot path). Imported from here, `@atlas/domain/portfolio`, by
// whoever needs them; the barrel never exports them.
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
export { bucketShareOf, coreMonthlyOf } from "./projections/core-monthly.js";
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
  type AssetExposure,
  type Exposure,
  type ExposureAsset,
  type ExposureCatalogue,
  type ExposureDimension,
  type ExposureIndex,
  type ExposureShare,
  type ExposureState,
  type Exposures,
  exposure,
  resolveAsset,
  type Split,
} from "./projections/exposure.js";
export {
  EXPOSURE_FORMAT,
  EXPOSURE_KEY,
  type ExposureReason,
  exposureOrNone,
  exposureText,
  MAX_EXPOSURE_ASSETS,
  MAX_EXPOSURE_BYTES,
  parseExposureText,
  validateExposure,
} from "./projections/exposure-file.js";
export { MAX_HORIZON_YEARS } from "./projections/growth.js";
export {
  DEFAULT_INDEX_TABLES,
  INDEX_PROFILES,
  type IndexProfile,
  type IndexTables,
  type KnownFund,
} from "./projections/index-profiles.js";
export {
  type MonthAssetTask,
  type MonthPlan,
  type MonthTask,
  monthPlan,
} from "./projections/month-plan.js";
export {
  accountHolding,
  type FeeEstimate,
  type Order,
  type PlatformLine,
  type PlatformPlan,
  type PlatformRow,
  platformPlan,
  type UnassignedOrder,
} from "./projections/platform-plan.js";
export {
  PROJECTION_CASES,
  type ProjectionCase,
  type ProjectionCaseEnd,
  type ProjectionCases,
  type ProjectionCasesGap,
  type ProjectionCasesPoint,
  type ProjectionDiscounts,
  projectionCases,
} from "./projections/projection-cases.js";
export {
  type ClassEdit,
  type ClassStart,
  DEFAULT_PROJECTION_YEARS,
  MAX_PROJECTION_BYTES,
  PROJECTION_FORMAT,
  PROJECTION_KEY,
  PROJECTION_START,
  type ProjectionEdits,
  type ProjectionFileReason,
  parseProjectionText,
  projectionAssumptions,
  projectionOrNone,
  projectionText,
  type ResolvedAssumptions,
  validateProjection,
} from "./projections/projection-file.js";
