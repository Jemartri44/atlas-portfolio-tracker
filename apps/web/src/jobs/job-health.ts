// The last run of each scheduled task, read from the API with the session (`docs/api.md` §6.3) and
// judged by the domain with the frequencies of the ledger. It never throws: a card or a warning
// that cannot read this says so, or stays quiet, and takes nothing else with it.

import {
  type CivilDate,
  type JobHealth,
  jobHealth,
  parseJobStatus,
  readJobFrequencies,
} from "@atlas/domain";
import { cloudFetch } from "../ledger/cloud.js";

export type JobHealthLoad =
  | { readonly kind: "ready"; readonly rows: readonly JobHealth[] }
  | { readonly kind: "failed" };

export const loadJobHealth = async (
  frequencies: unknown,
  today: CivilDate,
): Promise<JobHealthLoad> => {
  try {
    const response = await cloudFetch()("/api/jobs/status");
    const status = response.status === 200 ? parseJobStatus(await response.json()) : undefined;
    return status === undefined
      ? { kind: "failed" }
      : {
          kind: "ready",
          rows: jobHealth(status, readJobFrequencies(frequencies).frequencies, today),
        };
  } catch {
    return { kind: "failed" };
  }
};
