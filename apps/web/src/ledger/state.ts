// The state of the application: **one** loaded ledger, **one** base projection
// and a memo per date (D7, ADR-0016).
//
// Measured (research.md §3): projecting the 200 events of the golden file costs
// 1,2 ms warm and 4,6 ms cold, and the cost is linear, so the rule is not about
// speed but about coherence — every screen reads the same projection instead of
// building its own, which is how two views end up disagreeing.
//
// A module-level store inside `createRoot`: the application has exactly one
// ledger, and a context would add plumbing without adding a capability. The
// signals are plain functions, so the tests drive this without a DOM (Q8).

import {
  type CivilDate,
  type LedgerEvent,
  type LedgerState,
  madridDateOf,
  projectLedger,
  type UseCaseDeps,
} from "@atlas/domain";
import { createMemo, createRoot, createSignal } from "solid-js";
import type { DirectorySource, LedgerSource } from "./source.js";

export interface LedgerSnapshot {
  events: readonly LedgerEvent[];
  lines: readonly string[];
  etag: string;
  /** Base projection: no `asOf`, degraded mode (ADR-0015). */
  state: LedgerState;
  loadedAt: string;
}

export interface AppError {
  code: string;
  message: string;
  line?: number;
  action?: { label: string; to: string };
}

export type LoadPhase =
  | { phase: "unconfigured" }
  | { phase: "reconnect"; directory: DirectorySource; handle: FileSystemDirectoryHandle }
  | { phase: "loading"; source?: LedgerSource }
  | { phase: "ready"; source: LedgerSource; snapshot: LedgerSnapshot }
  | { phase: "failed"; source?: LedgerSource; error: AppError };

export type Theme = "system" | "light" | "dark";

const PRIVACY_KEY = "atlas.privacy";
const THEME_KEY = "atlas.theme";

/** localStorage, tolerant: in private mode it can throw or come back empty. */
const readLocal = (key: string): string | undefined => {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
};

const writeLocal = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembering a preference is a minor loss.
  }
};

/**
 * Privacy is **on** unless the device explicitly says it is off (FR-021,
 * decision (d)): anything that is not the literal "off" — nothing stored,
 * storage blocked, a value written by an older version — leaves the amounts
 * covered.
 *
 * It is a function of its own, and not an expression inside `createStore`, so a
 * test can reach it: turning `!== "off"` into `=== "on"` used to pass the whole
 * suite and left every amount visible on first run.
 */
export const privacyFromPreference = (stored: string | undefined): boolean => stored !== "off";

const createStore = () => {
  /*
   * It starts **loading**, not `unconfigured`. `restoreLedger` is async (it
   * reads localStorage, then IndexedDB or the folder handle) and every screen
   * behind `RequireLedger` sends an `unconfigured` phase straight to `/libro`
   * with a `<Navigate>`: whoever won the race decided the first screen, so a
   * reload with a ledger already chosen landed on the opening screen instead of
   * the summary (review of 2026-09-18). `unconfigured` is now a **conclusion**
   * of the boot, never its starting point, and while it lasts the screens show
   * their skeleton.
   */
  const [load, setLoad] = createSignal<LoadPhase>({ phase: "loading" });
  const [deps, setDeps] = createSignal<UseCaseDeps | undefined>(undefined);
  const [writing, setWriting] = createSignal(false);
  // Privacy is **on** by default: the first read is what decides (FR-021).
  const [privacy, setPrivacyRaw] = createSignal(privacyFromPreference(readLocal(PRIVACY_KEY)));
  const [theme, setThemeRaw] = createSignal<Theme>((readLocal(THEME_KEY) as Theme) ?? "system");

  const snapshot = createMemo<LedgerSnapshot | undefined>(() => {
    const phase = load();
    return phase.phase === "ready" ? phase.snapshot : undefined;
  });

  const source = createMemo<LedgerSource | undefined>(() => {
    const phase = load();
    return phase.phase === "ready" || phase.phase === "loading" || phase.phase === "failed"
      ? phase.source
      : undefined;
  });

  const invalidCount = createMemo<number>(() => snapshot()?.state.invalid.length ?? 0);

  /**
   * Projection cut at a date (`asOf`), memoised per date. The cache is keyed by
   * the etag too, so a write invalidates it without anyone having to remember.
   */
  const cache = new Map<string, LedgerState>();
  const projectionAt = (date: CivilDate): LedgerState | undefined => {
    const current = snapshot();
    if (current === undefined) {
      return undefined;
    }
    const key = `${current.etag}|${date}`;
    const hit = cache.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const projected = projectLedger(current.events, { collectErrors: true, asOf: date });
    cache.set(key, projected);
    return projected;
  };

  const clearCache = (): void => cache.clear();

  return {
    load,
    setLoad,
    deps,
    setDeps,
    snapshot,
    source,
    invalidCount,
    projectionAt,
    clearCache,
    writing,
    setWriting,
    privacy,
    setPrivacy: (value: boolean): void => {
      setPrivacyRaw(value);
      writeLocal(PRIVACY_KEY, value ? "on" : "off");
    },
    theme,
    setTheme: (value: Theme): void => {
      setThemeRaw(value);
      writeLocal(THEME_KEY, value);
    },
  };
};

export type Store = ReturnType<typeof createStore>;

/** The single store of the application. */
export const store: Store = createRoot(createStore);

export const usePrivacy = (): (() => boolean) => store.privacy;
export const useLoad = (): (() => LoadPhase) => store.load;
export const useSnapshot = (): (() => LedgerSnapshot | undefined) => store.snapshot;

/** Today in Europe/Madrid, from the clock the use cases use. */
export const today = (): CivilDate => madridDateOf(new Date());

/** The dependencies of the use cases; only defined once a ledger is open. */
export const requireDeps = (): UseCaseDeps => {
  const current = store.deps();
  if (current === undefined) {
    throw new Error("no hay ningún libro abierto");
  }
  return current;
};
