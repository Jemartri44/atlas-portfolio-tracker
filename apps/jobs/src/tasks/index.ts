// The tasks, by name. A function configured with a task that has
// no runner does not start (`task_not_available`). Every task of the catalog has one.

import type { JobTask } from "@atlas/domain/jobs";
import type { TaskRunner } from "../run.js";
import { monthlyBackup } from "./backup.js";
import { ecbUpdate } from "./ecb.js";
import { FISCAL_RUNNERS } from "./fiscal.js";
import { quarterlyIntegrity } from "./integrity.js";
import { MAIL_RUNNERS } from "./mail.js";
import { pricesUpdate } from "./prices.js";

export const RUNNERS: Readonly<Partial<Record<JobTask, TaskRunner>>> = {
  ...MAIL_RUNNERS,
  ...FISCAL_RUNNERS,
  ecb_update: ecbUpdate,
  prices_update: pricesUpdate,
  monthly_backup: monthlyBackup,
  quarterly_integrity: quarterlyIntegrity,
};
