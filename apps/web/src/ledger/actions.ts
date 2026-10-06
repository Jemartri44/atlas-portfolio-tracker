// Reading the ledger and translating what goes wrong. Writing lives next door,
// in `write.ts`: opening is what the boot does and writing is what a form does,
// and keeping them together put the write flows in the boot chunk.
//
// Two rules live here:
//   1. Loading projects **once** and stores the snapshot; nobody re-projects.
//   2. Every failure becomes an `AppError` with a message in Spanish and, where
//      there is one, the action that fixes it. `toAppError` (`errors.ts`) is the
//      only door.

import { projectLedger, type UseCaseDeps } from "@atlas/domain";
import type { LedgerSource } from "./source.js";
import { type LoadPhase, store } from "./state.js";

/** What the boot opens: the dependencies of the use cases and where the ledger comes from. */
export interface OpenedLedger {
  deps: UseCaseDeps;
  source: LedgerSource;
}

/**
 * The Spanish explanation of a failure, fetched **only when there is one**.
 * The catalogue of messages names fields, types and settings by their labels,
 * and loading all of that before the first screen — to explain an error that
 * almost never happens — would cost every start of the application.
 */
const explained = async (error: unknown) => (await import("./errors.js")).toAppError(error);

/**
 * Loads the opened ledger, projects it once and publishes the snapshot.
 * `classify` gives a failure its own phase (the cloud turns a cut connection
 * into «Sin conexión»); without it, or when it answers nothing, a failure is
 * `cloud_failed` with its explanation. Nothing partial is ever published.
 *
 * `quiet` is a **reload** under a screen that holds what the person typed (a
 * `412`): it does not go through `loading`, so the form is not unmounted.
 */
export const loadInto = async (
  opened: OpenedLedger,
  classify?: (error: unknown) => Promise<LoadPhase | undefined>,
  /** False once a newer boot started: whatever this load found is then dropped. */
  current: () => boolean = () => true,
  quiet = false,
): Promise<void> => {
  if (!quiet) {
    store.setLoad({ phase: "loading", source: opened.source });
  }
  store.setDeps(opened.deps);
  store.clearCache();
  try {
    const { events, lines, etag } = await opened.deps.store.load();
    if (!current()) {
      return;
    }
    const state = projectLedger(events, { collectErrors: true });
    store.setLoad({
      phase: "ready",
      source: opened.source,
      snapshot: { events, lines, etag, state, loadedAt: new Date().toISOString() },
    });
  } catch (error) {
    const verdict = await classify?.(error);
    if (!current()) {
      return;
    }
    store.setLoad(verdict ?? { phase: "cloud_failed", error: await explained(error) });
  }
};
