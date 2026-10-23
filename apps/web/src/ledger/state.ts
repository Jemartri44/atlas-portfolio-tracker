// The state of the application: **one** loaded ledger, **one** base projection and a memo per date
// (ADR-0016).
//
// Measured: projecting the 200 events of the golden file costs 1,2 ms warm and 4,6 ms cold, and the
// cost is linear, so the rule is not about speed but about coherence — every screen reads the same
// projection instead of building its own, which is how two views end up disagreeing.
//
// A module-level store inside `createRoot`: the application has exactly one
// ledger, and a context would add plumbing without adding a capability. The
// signals are plain functions, so the tests drive this without a DOM.

import {
  type CivilDate,
  type LedgerEvent,
  type LedgerState,
  madridDateOf,
  projectLedger,
  type UseCaseDeps,
} from "@atlas/domain";
import { createMemo, createRoot, createSignal } from "solid-js";
import { readDay } from "./day-watch.js";
import type { PendingWrite } from "./pending.js";
import type { LedgerSource } from "./source.js";

export interface LedgerSnapshot {
  events: readonly LedgerEvent[];
  lines: readonly string[];
  etag: string;
  /** Base projection: no `asOf`, degraded mode (ADR-0015). */
  state: LedgerState;
  loadedAt: string;
}

/** An error as the interface paints it: a code, a sentence in Spanish and, where there is one, the action that fixes it. */
export interface AppError {
  code: string;
  message: string;
  /** The line of the ledger a rejected line comes from, when the API says so. */
  line?: number;
  action?: { label: string; to: string };
}

/** The message of an error **with the line of the ledger** it comes from, when the API names one. */
export const messageWithLine = (error: AppError): string =>
  error.line === undefined || error.message.includes(`línea ${error.line}`)
    ? error.message
    : `Línea ${error.line} del archivo: ${error.message}`;

export type LoadPhase =
  | { phase: "loading"; source?: LedgerSource }
  | { phase: "ready"; source: LedgerSource; snapshot: LedgerSnapshot }
  /**
   * No valid session. Nothing of the ledger is shown, only the way to sign in;
   * `reason` tells why, so the sentence is the right one.
   */
  | { phase: "signed_out"; reason: SignedOutReason }
  /** No connection. No data, no forms; it reloads when it comes back. */
  | { phase: "offline" }
  /** The session or the ledger could not be read. Nothing is shown but the reason. */
  | { phase: "cloud_failed"; error: AppError };

/**
 * The phases of the boot that replace the whole content with one screen
 * (`shell/CloudGate.tsx`): no session, no connection, or a read that failed.
 */
export const blocksTheApp = (phase: LoadPhase): boolean =>
  phase.phase === "signed_out" || phase.phase === "offline" || phase.phase === "cloud_failed";

export type SignedOutReason = "signed_out" | "expired" | "not_allowed" | "forgotten";

const createStore = () => {
  // It starts **loading**: the boot is async (session, then ledger), and while
  // it lasts the screens show their skeleton.
  const [load, setLoad] = createSignal<LoadPhase>({ phase: "loading" });
  const [pending, setPending] = createSignal<PendingWrite | undefined>(undefined);
  const [deps, setDeps] = createSignal<UseCaseDeps | undefined>(undefined);
  const [writing, setWriting] = createSignal(false);

  const snapshot = createMemo<LedgerSnapshot | undefined>(() => {
    const phase = load();
    return phase.phase === "ready" ? phase.snapshot : undefined;
  });

  const source = createMemo<LedgerSource | undefined>(() => {
    const phase = load();
    return phase.phase === "ready" || phase.phase === "loading" ? phase.source : undefined;
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
    pending,
    setPending,
    deps,
    setDeps,
    snapshot,
    source,
    invalidCount,
    projectionAt,
    clearCache,
    writing,
    setWriting,
  };
};

export type Store = ReturnType<typeof createStore>;

/** The single store of the application. */
export const store: Store = createRoot(createStore);

/**
 * Today in Europe/Madrid, from the clock the use cases use — which is what
 * this comment always said and what the code did **not** do: it read
 * `new Date()`, the wall clock.
 *
 * A component that reads the wall clock while the domain reads an injected one
 * makes the two look at different days, and nothing that depends on the date
 * can be tested deterministically. In production both are the system clock, so
 * nothing changes there; what changes is that they can no longer disagree.
 *
 * Before a ledger is open there are no dependencies yet —the chip of the
 * source and the date picker are painted then— so it falls back to the wall
 * clock, which is the same clock the use cases will bring.
 */
const clockDay = (): CivilDate => madridDateOf(store.deps()?.clock.now() ?? new Date());
export const today = (): CivilDate => readDay(clockDay);

/** The dependencies of the use cases; only defined once a ledger is open. */
export const requireDeps = (): UseCaseDeps => {
  const current = store.deps();
  if (current === undefined) {
    throw new Error("no hay datos abiertos");
  }
  return current;
};
