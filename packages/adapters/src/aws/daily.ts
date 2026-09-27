// The door `@atlas/adapters/aws-daily` (feature 016, E2): what the daily jobs
// of the ECB and the prices build on the narrow interfaces of S3 and SSM —
// their stores of `reference/ecb/` and `prices/`, the keys of the sources —
// and the simulated source of `dev`. Apart from `@atlas/adapters/aws` and
// `@atlas/adapters/aws-jobs`, so that neither the API nor the mail function
// reaches the keys (`tests/jobs-access.test.ts`, §8.2 B2). Node only.

export {
  PriceKeyInvalid,
  type PriceKeys,
  priceKeyParameters,
  readPriceKeys,
} from "./price-keys.js";
export { type EcbRecovered, EcbStoreConflict, S3EcbHistoryStore } from "./s3-ecb-store.js";
export { PriceStoreConflict, PriceStoreRefused, S3PriceStore } from "./s3-price-store.js";
export { SimulatedPriceSource } from "./simulated-prices.js";
