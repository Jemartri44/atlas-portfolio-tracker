// The ECB reference rates and the local configuration, as a **separate entry
// point** of the domain (feature 012), for the same reason as `fiscal.ts`:
// nothing of the ECB may land on the boot path of the web (decision (r) of
// prompt 012). A lazily loaded screen imports from here and gets a chunk of its
// own; the barrel never re-exports any of it, and the architecture test holds
// that.

export {
  DEFAULT_LOCAL_CONFIG,
  LOCAL_CONFIG_FILE,
  type LocalConfig,
  parseLocalConfig,
} from "./config/local-config.js";
export { type BrokerSettlement, brokerSettlementOf } from "./ecb/broker-settlement.js";
export { checkLedgerRates, foreignRatesOf, type RateCheck } from "./ecb/check.js";
export {
  asciiText,
  type CurrencySeries,
  type EcbHistory,
  type EcbSource,
  isPublication,
  latestPublication,
  rateOn,
  readEcbApiCsv,
  readEcbHistory,
  readEcbZipCsv,
  sameRate,
} from "./ecb/history.js";
export { firstRateDateOf, type RatePoint, ratePointsOf } from "./ecb/ledger-rates.js";
export {
  type OfficialRate,
  officialRatesOf,
  proposeRates,
  type RateMismatch,
  rateConfirmations,
  unpublishedRates,
} from "./ecb/propose.js";
export { isDecided, type RateResolution, resolveRate } from "./ecb/resolve.js";
export {
  type CalendarDisagreement,
  calendarYears,
  crossCheckCalendar,
  easterSunday,
  isTargetClosingDay,
  targetHolidays,
} from "./ecb/target.js";
export { checkHistoryUpdate, type HistoryConflict, type HistoryUpdate } from "./ecb/update.js";
export { type EcbUpdateResult, updateEcbHistory } from "./ecb/update-history.js";
export type {
  DownloadedHistory,
  EcbHistoryStore,
  FxRateSource,
  StoredHistory,
  StoredHistoryMeta,
} from "./ports/fx-rate-source.js";
