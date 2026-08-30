import { type ProjectOptions, projectLedger } from "../projections/project-ledger.js";
import type { LedgerState } from "../projections/state.js";
import type { LedgerEvent } from "../schema/events.js";
import type { UseCaseDeps } from "./deps.js";

export interface ProjectedLedger {
  events: readonly LedgerEvent[];
  state: LedgerState;
  etag: string;
  /** Raw lines as stored, for the deep checks. */
  lines: readonly string[];
}

/** Loads the whole ledger and projects it. Every query of the CLI starts here. */
export const loadAndProject = async (
  deps: Pick<UseCaseDeps, "store">,
  options: ProjectOptions = {},
): Promise<ProjectedLedger> => {
  const { events, etag, lines } = await deps.store.load();
  return { events, state: projectLedger(events, options), etag, lines };
};
