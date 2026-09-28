// The tasks built so far, by name (feature 016). A function configured with a
// task that has no runner yet does not start (`task_not_available`): E2 adds
// the ECB and the prices, E4 the backup, the integrity and the periodic
// warnings.

import type { JobTask } from "@atlas/domain/jobs";
import type { TaskRunner } from "../run.js";
import { monthlyBackup } from "./backup.js";
import { ecbUpdate } from "./ecb.js";
import { quarterlyIntegrity } from "./integrity.js";
import { MAIL_RUNNERS } from "./mail.js";
import { pricesUpdate } from "./prices.js";

export const RUNNERS: Readonly<Partial<Record<JobTask, TaskRunner>>> = {
  ...MAIL_RUNNERS,
  ecb_update: ecbUpdate,
  prices_update: pricesUpdate,
  monthly_backup: monthlyBackup,
  quarterly_integrity: quarterlyIntegrity,
};
