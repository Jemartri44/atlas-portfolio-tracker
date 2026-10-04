// The indicators and the series of the screens opened on demand, as a
// **separate entry point** of the domain (feature 020, E3; contracts/
// domain-doors.md): the three gauges of the bucket and the percentages of its
// theses, and (E4) the contributions and the bucket against the index in
// percent. Same reason as `fiscal.ts` and `tools.ts`: the barrel is the module
// the browser downloads at boot, and these are for the Cubo, a screen opened
// now and then. Imported from here, `@atlas/domain/charts`, by whoever draws
// them; the barrel never exports them (`tests/architecture.test.ts`) and no
// other module of the domain imports them.

export { type BookCashPoint, type BookCashSeries, bookCashSeries } from "./charts/book-cash.js";
export {
  type BucketIndexPctPoint,
  type BucketIndexPctSeries,
  bucketIndexPctSeries,
} from "./charts/bucket-pct.js";
export {
  type ContributedPoint,
  type ContributedSeries,
  contributedSeries,
} from "./charts/contributed.js";
export { type BucketGauges, bucketGauges } from "./charts/gauges.js";
export { type ThesisPct, thesisVsIndexPct } from "./charts/theses.js";
