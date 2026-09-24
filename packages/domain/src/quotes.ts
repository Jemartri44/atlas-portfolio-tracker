// The automatic daily closes (feature 013, ADR-0031) as a **separate entry
// point** of the domain, for the same reason as `ecb.ts`: nothing of the
// automatic prices may land on the boot path of the web. The barrel never
// re-exports any of it; the architecture test holds that, and
// `check-bundle.mjs` lists this folder among the modules that must be lazy.
//
// And none of it may reach a fiscal calculation: every file of `quotes/` and
// the two ports of prices are "price-aware" for the architecture test, which
// reads them off the folder, so a file added tomorrow is covered unnamed.

export type {
  DailyClose,
  PriceSource,
  SourceFailureKind,
  SourceResult,
} from "./ports/price-source.js";
export { SOURCE_FAILURE_KINDS } from "./ports/price-source.js";
export type { PriceFiles, PriceStore, PriceTransaction } from "./ports/price-store.js";
export {
  type AssetOutcome,
  type AssetReport,
  type UpdatePricesInput,
  type UpdateReport,
  updatePrices,
} from "./quotes/cascade.js";
export {
  DEFAULT_PRICE_CONFIG,
  PRICE_CONFIG_FILE,
  type PriceConfig,
  parsePriceConfig,
} from "./quotes/config.js";
export { checkSymbols, recordSymbols, removeSymbols, type SymbolCheck } from "./quotes/declare.js";
export {
  type Approximation,
  type ApproximationGap,
  approximationAt,
  externalPricesOf,
  type QuoteBook,
  quoteDates,
} from "./quotes/external.js";
export {
  type CloseLine,
  closeOn,
  closeOnOrBefore,
  type EffectiveClose,
  effectiveCloses,
  encodeCloseLine,
  linesToAppend,
  PRICE_LINE_VERSION,
  readCloseFile,
  readCloses,
  type UnreadableCloses,
} from "./quotes/line.js";
export { downloadPlan, type PlannedAsset, type PriorityGroup } from "./quotes/priority.js";
export { isQuoteSource, QUOTE_SOURCES } from "./quotes/sources.js";
export {
  type AssetFailure,
  BUDGET_WINDOW,
  EMPTY_STATUS,
  type PriceStatus,
  parseStatus,
  type QuoteFailureKind,
  type SourceStatus,
  spentAt,
} from "./quotes/status.js";
export {
  type CurrencyDisagreement,
  currencyAgrees,
  declareSymbols,
  EMPTY_SYMBOLS,
  parseSymbols,
  type SymbolDeclaration,
  type SymbolEntry,
  type SymbolsFile,
  serializeSymbols,
} from "./quotes/symbols.js";
export {
  type AssetStatusView,
  approximationWarning,
  priceStatusView,
  type SourceStatusView,
} from "./quotes/view.js";
