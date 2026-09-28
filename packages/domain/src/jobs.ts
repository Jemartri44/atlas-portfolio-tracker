// The rules of the scheduled jobs (feature 016), as a **separate entry point**
// of the domain, like `access.ts`: which job is due, its period in
// `Europe/Madrid`, its run record and what a retry does, the streaks of the
// warnings, the event of EventBridge Scheduler, the configuration of each
// function, the switch of the amounts and every mail, written here and only
// here. Pure. The barrel never re-exports any of it, and neither the web nor
// the API reach it (`tests/jobs-access.test.ts`; `check-bundle.mjs`).

export { isMailAddress } from "./jobs/address.js";
export { type AmountsSwitch, amountsSwitch } from "./jobs/amounts.js";
export {
  backupFindings,
  DUMP_LEDGER,
  DUMP_POSITIONS,
  type DumpStep,
  dumpablePriceName,
  dumpManifestStep,
  dumpPrefix,
  dumpStep,
} from "./jobs/backup.js";
export {
  type Delivery,
  frequencyOf,
  isJobTask,
  JOB_FAMILIES,
  JOB_TASKS,
  type JobFamily,
  type JobTask,
  PRODUCER_TASKS,
} from "./jobs/catalog.js";
export {
  cloudPriceConfigText,
  FAILURE_THRESHOLD_CEILING,
  type IntegrityConfig,
  JOB_MAX_RUN_CEILING_SECONDS,
  JOBS_CONFIG_VARIABLES,
  type JobsConfig,
  LEDGER_SIZE_WARNING_RANGE,
  type MailConfig,
  OAUTH_IDLE_WARNING_CEILING_DAYS,
  PRICE_BUDGET_CEILINGS,
  type PricesConfig,
  parseJobsConfig,
} from "./jobs/config.js";
export {
  type ActiveHistory,
  activeHistoryOf,
  type PreviousHistory,
  previousHistoryOf,
} from "./jobs/ecb-manifest.js";
export { type EcbRecovery, ecbRecovery } from "./jobs/ecb-recovery.js";
export { type JobEvent, type JobEventRefusal, parseJobEvent } from "./jobs/event.js";
export { ecbFindings, PRODUCER_FINDINGS, pricesFindings } from "./jobs/findings.js";
export { type InformativeFacts, informativeFacts } from "./jobs/informative.js";
export { INTEGRITY_ERROR_CODES, integrityFindings, REHEARSAL_CODES } from "./jobs/integrity.js";
export { type LedgerFailureKind, ledgerFailureKind } from "./jobs/ledger-failure.js";
export { NOTICE_CODES, type NoticeFacts, noticeMail } from "./jobs/mail/notice.js";
export {
  informativeMail,
  taxReturnMail,
  weeklyReviewMail,
  weeklyReviewUnavailableMail,
} from "./jobs/mail/periodic.js";
export { reminderMail } from "./jobs/mail/reminder.js";
export {
  conditionsOf,
  FABRICATED_CODES,
  NOTICES_PREFIX,
  type Notice,
  type NoticeStep,
  noticeIn,
  noticeKey,
  noticeStep,
  ownFindings,
  type ProducerFindings,
  parseNotice,
  producerOf,
  serializeNotice,
} from "./jobs/notices.js";
export { inWindow, lastDayOfWindow, periodOf, previousPeriod } from "./jobs/periods.js";
export {
  type PositionsDocument,
  type PositionsInput,
  positionsDocument,
  serializePositions,
} from "./jobs/positions.js";
export { type LatestDump, latestDump, type Rehearsal, restoreRehearsal } from "./jobs/rehearsal.js";
export { type ReminderFacts, type ReminderInput, reminderFacts } from "./jobs/reminder.js";
export { type ReviewFacts, reviewDue, reviewFacts } from "./jobs/review.js";
export {
  claimRecord,
  type DumpObject,
  type Finding,
  isClosed,
  nextStep,
  type Outcome,
  parseRunRecord,
  type RunRecord,
  type RunState,
  type RunStep,
  recordIn,
  runRecordKey,
  serializeRunRecord,
} from "./jobs/run-record.js";
export { type TaxReturnFacts, taxReturnFacts } from "./jobs/tax-return.js";
export type { MailMessage, Notifier, NotifierFailure, NotifierResult } from "./ports/notifier.js";
export { NOTIFIER_FAILURES } from "./ports/notifier.js";
export {
  type IgnoredFrequency,
  type JobFrequencies,
  type JobFrequency,
  type JobFrequencyKey,
  readJobFrequencies,
} from "./settings/job-frequencies.js";
