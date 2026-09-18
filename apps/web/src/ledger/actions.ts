// Everything that opens, reads or writes the ledger. The screens call these
// and never touch a use case directly, which is what lets the write flows be
// tested end to end **without a DOM**, checking the bytes of the file (Q8, D16).
//
// Three rules live here:
//   1. Loading projects **once** and stores the snapshot; nobody re-projects.
//   2. Writing goes through the domain use cases with the etag of that load; a
//      conflict reloads and is reported, never overwritten (FR-015).
//   3. A duplicate fingerprint and a dependent-events refusal are **outcomes**,
//      not exceptions: the interface has to ask before insisting.

import {
  type AffectedEvent,
  ConflictError,
  correctEvent,
  DependentEventsError,
  DomainError,
  type Draft,
  DuplicateFingerprintError,
  type EventPreview,
  type PreviewOptions,
  previewEvent,
  projectLedger,
  type RecordOptions,
  type RecordResult,
  type ReverseResult,
  recordEvent,
  reverseEvent,
  type Settings,
  type SupportedEvent,
  type UseCaseDeps,
} from "@atlas/domain";
import { describeError } from "../format/messages/errors.js";
import {
  canUseDirectory,
  type LedgerSource,
  type LedgerSourceKind,
  rememberedKind,
} from "./source.js";
import type { AppError } from "./state.js";
import { requireDeps, store } from "./state.js";
import {
  chooseDirectory,
  forgetLedger,
  type OpenedLedger,
  openBrowserStorage,
  reconnectDirectory,
  rememberedDirectoryState,
} from "./store.js";

/** A domain error (or anything else) as the interface shows it, in Spanish. */
export const toAppError = (error: unknown): AppError => {
  if (error instanceof DomainError) {
    const line = error.details.line;
    return {
      code: error.code,
      message: describeError(error),
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

// --- Writing -------------------------------------------------------------

export type WriteFailure =
  | { kind: "duplicate"; existing: readonly string[] }
  | { kind: "conflict" }
  | { kind: "dependents"; target: string; affected: readonly AffectedEvent[]; settings: boolean }
  | { kind: "error"; error: AppError };

export type WriteResult<T> = { ok: true; value: T } | { ok: false; failure: WriteFailure };

/**
 * Has the ledger changed since the screen read it? The use cases load the
 * ledger themselves and append with the etag of **their own** load, which
 * protects the write but says nothing about what the user was looking at. On a
 * phone a form can stay open for minutes while the CLI writes, so the etag of
 * the snapshot is compared before writing: the preview the user confirmed has
 * to belong to the ledger that is on disk (FR-015).
 */
const changedUnderneath = async (deps: UseCaseDeps): Promise<boolean> => {
  const snapshot = store.snapshot();
  if (snapshot === undefined) {
    return false;
  }
  const { etag } = await deps.store.load();
  return etag !== snapshot.etag;
};

/** Runs a write, translating the three answers the interface has to act on. */
const write = async <T>(run: () => Promise<T>): Promise<WriteResult<T>> => {
  store.setWriting(true);
  try {
    if (await changedUnderneath(requireDeps())) {
      await reloadLedger();
      return { ok: false, failure: { kind: "conflict" } };
    }
    const value = await run();
    await reloadLedger();
    return { ok: true, value };
  } catch (error) {
    if (error instanceof DuplicateFingerprintError) {
      return { ok: false, failure: { kind: "duplicate", existing: error.existing } };
    }
    if (error instanceof ConflictError) {
      // The file changed underneath: reload so the preview is built again on
      // what is there now. Nothing was written (FR-015).
      await reloadLedger();
      return { ok: false, failure: { kind: "conflict" } };
    }
    if (error instanceof DependentEventsError) {
      return {
        ok: false,
        failure: {
          kind: "dependents",
          target: String(error.details.target_id ?? ""),
          affected: error.affected,
          settings: error.code === "newly_invalid_events",
        },
      };
    }
    return { ok: false, failure: { kind: "error", error: toAppError(error) } };
  } finally {
    store.setWriting(false);
  }
};

/** The preview of a candidate, straight from the domain use case (decision (h)). */
export const previewDraft = async <E extends SupportedEvent>(
  draft: Draft<E>,
  options: PreviewOptions = {},
): Promise<EventPreview<E>> => previewEvent(requireDeps(), draft, options);

export const recordDraft = async <E extends SupportedEvent>(
  draft: Draft<E>,
  options: RecordOptions = {},
): Promise<WriteResult<RecordResult<E>>> =>
  write(() => recordEvent<E>(requireDeps(), draft, options));

export const reverse = async (id: string, reason: string): Promise<WriteResult<ReverseResult>> =>
  write(() => reverseEvent(requireDeps(), id, reason));

export const correct = async <E extends SupportedEvent>(
  id: string,
  draft: Draft<E>,
  reason: string,
  options: RecordOptions = {},
): Promise<WriteResult<{ event: E; priorYear: boolean }>> =>
  write(async () => {
    const result = await correctEvent<E>(requireDeps(), id, draft, reason, options);
    return { event: result.event, priorYear: result.priorYear };
  });

export const changeSettings = async (
  settings: Settings,
  options: RecordOptions = {},
): Promise<WriteResult<RecordResult>> =>
  write(() => recordEvent(requireDeps(), { type: "settings_changed", settings }, options));
