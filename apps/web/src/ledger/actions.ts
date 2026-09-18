// Opening a ledger, reading it and translating what goes wrong. Writing lives
// next door, in `write.ts`: opening is what the boot does and writing is what a
// form does, and keeping them together put the write flows in the boot chunk.
//
// Two rules live here:
//   1. Loading projects **once** and stores the snapshot; nobody re-projects.
//   2. Every failure becomes an `AppError` with a message in Spanish and, where
//      there is one, the action that fixes it. `toAppError` is the only door.

import { DomainError, projectLedger } from "@atlas/domain";
import { describeError } from "../format/messages/errors.js";
import { nameIndex } from "../format/names.js";
import {
  canUseDirectory,
  type LedgerSource,
  type LedgerSourceKind,
  rememberedKind,
} from "./source.js";
import type { AppError } from "./state.js";
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
 * A domain error (or anything else) as the interface shows it, in Spanish.
 *
 * The catalogue comes from the loaded snapshot, so "La cuenta acc_mi no existe"
 * reads "La cuenta Fondos indexados no existe". During the boot there is no
 * snapshot yet and `nameIndex` answers with an empty index, which resolves
 * every identifier to itself — the behaviour this had before.
 */
export const toAppError = (error: unknown): AppError => {
  if (error instanceof DomainError) {
    const line = error.details.line;
    return {
      code: error.code,
      message: describeError(error, nameIndex(store.snapshot()?.state)),
      ...(typeof line === "number" ? { line } : {}),
    };
  }
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return {
      code: "permission_denied",
      message:
        "El navegador ha denegado el acceso a la carpeta del libro. Vuelve a conectarla para seguir.",
      action: { label: "Abrir el libro", to: "/libro" },
    };
  }
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return {
      code: "storage_full",
      message:
        "No cabe en el almacenamiento del navegador: no se ha escrito nada. Exporta el libro y libera espacio del sitio antes de volver a intentarlo.",
      action: { label: "Exportar el libro", to: "/ajustes" },
    };
  }
  if (error instanceof Error && error.name === "StorageUnavailable") {
    return {
      code: "storage_unavailable",
      message:
        "Este navegador no permite guardar datos del sitio (modo privado o datos bloqueados). Abre el libro desde un fichero, o usa otro navegador.",
      action: { label: "Abrir el libro", to: "/libro" },
    };
  }
  return {
    code: "unexpected",
    message: error instanceof Error ? error.message : String(error),
  };
};

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
    store.setLoad({ phase: "failed", source: opened.source, error: toAppError(error) });
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
    store.setLoad({ phase: "failed", error: toAppError(failure) });
  }
};

/** Forgets the current ledger and goes back to the opening screen. */
export const changeLedger = async (): Promise<void> => {
  await forgetLedger();
  store.setDeps(undefined);
  store.clearCache();
  store.setLoad({ phase: "unconfigured" });
};
