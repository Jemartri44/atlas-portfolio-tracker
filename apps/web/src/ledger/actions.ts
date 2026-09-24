// Opening a ledger, reading it and translating what goes wrong. Writing lives
// next door, in `write.ts`: opening is what the boot does and writing is what a
// form does, and keeping them together put the write flows in the boot chunk.
//
// Two rules live here:
//   1. Loading projects **once** and stores the snapshot; nobody re-projects.
//   2. Every failure becomes an `AppError` with a message in Spanish and, where
//      there is one, the action that fixes it. `toAppError` (`errors.ts`) is the
//      only door.

import { projectLedger } from "@atlas/domain";
import { forgetKind, type LedgerSource, type LedgerSourceKind, rememberedKind } from "./source.js";
import { store } from "./state.js";
import { forgetLedger, type OpenedLedger, openBrowserStorage } from "./store.js";

/**
 * The Spanish explanation of a failure, fetched **only when there is one**.
 * The catalogue of messages names fields, types and settings by their labels,
 * and loading all of that before the first screen — to explain an error that
 * almost never happens — would cost every start of the application.
 */
const explained = async (error: unknown) => (await import("./errors.js")).toAppError(error);

/** Loads the opened ledger, projects it once and publishes the snapshot. */
export const loadInto = async (opened: OpenedLedger): Promise<void> => {
  store.setLoad({ phase: "loading", source: opened.source });
  store.setDeps(opened.deps);
  store.clearCache();
  try {
    const { events, lines, etag } = await opened.deps.store.load();
    const state = projectLedger(events, { collectErrors: true });
    store.setLoad({
      phase: "ready",
      source: opened.source,
      snapshot: { events, lines, etag, state, loadedAt: new Date().toISOString() },
    });
  } catch (error) {
    store.setLoad({ phase: "failed", source: opened.source, error: await explained(error) });
  }
};

/** Re-reads the ledger from the same store: after writing, or after a conflict. */
export const reloadLedger = async (): Promise<void> => {
  const current = store.load();
  const source: LedgerSource | undefined =
    current.phase === "ready" || current.phase === "failed" ? current.source : undefined;
  const deps = store.deps();
  if (deps === undefined || source === undefined) {
    return;
  }
  await loadInto({ deps, source });
};

export const openBrowserLedger = async (): Promise<void> => {
  await loadInto(await openBrowserStorage());
};

/** What the boot has to do, decided before touching any storage. */
export type BootDecision = "browser" | "retired-folder" | "nothing";

/**
 * The remembered choice, read as a rule instead of inline in the boot:
 * `browser` is reopened with no gesture at all. A session that wrote in the
 * console's folder — which the web no longer does (feature 012) — does not
 * reopen anything: the opening screen says why, instead of starting from an
 * empty ledger in the browser as if there had never been one.
 */
export const bootDecision = (remembered: LedgerSourceKind | undefined): BootDecision => {
  if (remembered === undefined) {
    return "nothing";
  }
  return remembered === "browser" ? "browser" : "retired-folder";
};

/**
 * On boot: reopen what was open, **without a click**.
 *
 * It never throws: the store starts in `loading` and something has to take it
 * out of there, so a browser with its storage blocked ends in `failed` with its
 * explanation and its way out, not in a skeleton for ever.
 */
export const restoreLedger = async (): Promise<void> => {
  try {
    const decision = bootDecision(rememberedKind());
    if (decision === "browser") {
      await openBrowserLedger();
      return;
    }
    if (decision === "retired-folder") {
      // Said once: from now on the choice is the browser's, or nothing.
      forgetKind();
      store.setLoad({ phase: "unconfigured", retiredFolder: true });
      return;
    }
    store.setLoad({ phase: "unconfigured" });
  } catch (failure) {
    store.setLoad({ phase: "failed", error: await explained(failure) });
  }
};

/** Forgets the current ledger and goes back to the opening screen. */
export const changeLedger = async (): Promise<void> => {
  forgetLedger();
  store.setDeps(undefined);
  store.clearCache();
  store.setLoad({ phase: "unconfigured" });
};
