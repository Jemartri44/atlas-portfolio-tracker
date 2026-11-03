// The door of the run records for the API (`docs/api.md` §6.3): what it reads of `jobs/`, without the
// mail or the rest of `@atlas/domain/jobs`, which the API never reaches.

export { JOB_FAMILIES, JOB_TASKS, type JobFamily, type JobTask } from "./jobs/catalog.js";
export { lastRunOf, runPeriods } from "./jobs/health.js";
export { parseRunRecord, type RunRecord, runRecordKey } from "./jobs/run-record.js";
export type { JobLastRun, JobStatus } from "./settings/job-health.js";
