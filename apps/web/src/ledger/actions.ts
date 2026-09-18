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
import {
  canUseDirectory,
  type LedgerSource,
  type LedgerSourceKind,
  rememberedKind,
} from "./source.js";
import { store } from "./state.js";
import {
  chooseDirectory,
  forgetLedger,
  type OpenedLedger,
  openBrowserStorage,
  reconnectDirectory,
  rememberedDirectoryState,
} from "./store.js";

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

export const openDirectoryLedger = async (): Promise<void> => {
  const opened = await chooseDirectory();
  if (opened !== undefined) {
    await loadInto(opened);
  }
};

export const openBrowserLedger = async (): Promise<void> => {
  await loadInto(await openBrowserStorage());
};

/** Re-asks for the folder permission; call it from a click (D5). */
export const reconnect = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  const opened = await reconnectDirectory(handle);
  if (opened === undefined) {
    return;
  }
  await loadInto(opened);
};

/** What the boot has to do, decided before touching any storage. */
export type BootDecision = "browser" | "directory" | "nothing";

/**
 * The remembered choice, read as a rule instead of inline in the boot:
 * `browser` is reopened with no gesture at all (on a phone it is the only path
 * there is, decision (l)), and a folder is only worth trying where the File
 * System Access API exists — a ledger opened on the desktop and reopened on a
 * phone is not an error, it is a ledger that has to be chosen again.
 */
export const bootDecision = (
  remembered: LedgerSourceKind | undefined,
  canDirectory: boolean,
): BootDecision => {
  if (remembered === undefined) {
    return "nothing";
  }
  if (remembered === "browser") {
    return "browser";
  }
  return canDirectory ? "directory" : "nothing";
};

/**
 * On boot: reopen what was open, **without a click** when the ledger lives in
 * this browser. The folder handle survives but its permission does not, so that
 * path can end in `reconnect`, which needs a gesture and is therefore a screen,
 * not a silent retry (research.md §4).
 *
 * It never throws: the store starts in `loading` and something has to take it
 * out of there, so a browser with its storage blocked ends in `failed` with its
 * explanation and its way out, not in a skeleton for ever.
 */
export const restoreLedger = async (): Promise<void> => {
  try {
    const decision = bootDecision(rememberedKind(), canUseDirectory());
    if (decision === "nothing") {
      store.setLoad({ phase: "unconfigured" });
      return;
    }
    if (decision === "browser") {
      await openBrowserLedger();
      return;
    }
    const remembered = await rememberedDirectoryState();
    if (remembered === undefined) {
      store.setLoad({ phase: "unconfigured" });
      return;
    }
    if (remembered.permission === "granted") {
      await reconnect(remembered.handle);
      return;
    }
    store.setLoad({
      phase: "reconnect",
      handle: remembered.handle,
      directory: {
        kind: "directory",
        directoryName: remembered.name,
        fileName: "ledger.jsonl",
        permission: remembered.permission,
      },
    });
  } catch (failure) {
    store.setLoad({ phase: "failed", error: await explained(failure) });
  }
};

/** Forgets the current ledger and goes back to the opening screen. */
export const changeLedger = async (): Promise<void> => {
  await forgetLedger();
  store.setDeps(undefined);
  store.clearCache();
  store.setLoad({ phase: "unconfigured" });
};
