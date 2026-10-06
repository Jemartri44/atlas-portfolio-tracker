// The boot of the cloud mode (ADR-0035, E2a; `docs/api.md` §3 and §5.8).
//
//   session → ledger → projection, in this order, and each step can stop:
//   - no session (or an expired one, or one that is not allowed): the screen
//     «Entrar con Google», and nothing else;
//   - no connection: «Sin conexión», no data and no forms; when the connection
//     returns the ledger is **always** read again before anything is shown;
//   - a read that fails for any other reason: its sentence and «Reintentar».
//
// The whole ledger is downloaded with `ApiLedgerStore.load()` (`GET /api/ledger`,
// `no-store`, the etag checked against the bytes) and projected once on the
// client. Nothing is written to the device: no `localStorage` key, no IndexedDB
// store, no cache entry (`test/cloud-device.test.tsx`).
//
// Lazy: the boot only holds the `import()` of this file.

import { ApiLedgerStore } from "@atlas/adapters/api-store";
import { systemClock } from "@atlas/adapters/clock";
import { webCryptoRandom } from "@atlas/adapters/random";
import { httpRemote } from "@atlas/adapters/sync-http";
import type { UseCaseDeps } from "@atlas/domain";
import { RemoteError } from "@atlas/domain/sync";
import { readSession, type SessionState } from "../sync/session.js";
import { loadInto } from "./actions.js";
import { SIGNED_OUT } from "./session-errors.js";
import type { AppError, LoadPhase } from "./state.js";
import { store } from "./state.js";

type Fetch = typeof fetch;

/** The page's `fetch`, looked up at each call so a test can replace it. */
const pageFetch: Fetch = (input, init) => fetch(input, init);

/** The `fetch` of the last boot, so a reload or a new session goes through the same door. */
let lastRequest: Fetch = pageFetch;

/** The use cases over the ledger of the cloud. */
const depsFor = (request: Fetch): UseCaseDeps => ({
  store: new ApiLedgerStore(httpRemote({ origin: "", fetch: request })),
  clock: systemClock,
  random: webCryptoRandom,
});

const failed = (code: string, message: string): LoadPhase => ({
  phase: "cloud_failed",
  error: { code, message },
});

/** What the boot makes of a session check that did not give a session. */
const ofStopped = (session: Exclude<SessionState, { kind: "signed_in" }>): LoadPhase => {
  switch (session.kind) {
    case "unavailable":
      return session.code === "network_failed"
        ? { phase: "offline" }
        : failed(
            session.code,
            "No se ha podido comprobar la sesión: la nube no ha respondido como debe. No se ha leído ni cambiado nada.",
          );
    default:
      return { phase: "signed_out", reason: session.kind };
  }
};

/** What a failed read of the ledger turns into. Never silent, never a partial ledger. */
const ofReadFailure = async (error: unknown): Promise<LoadPhase> => {
  if (error instanceof RemoteError) {
    if (error.code === "network_failed") {
      return { phase: "offline" };
    }
    const reason = SIGNED_OUT[error.code];
    if (reason !== undefined) {
      return { phase: "signed_out", reason };
    }
    return failed(
      error.code,
      "No se han podido leer tus datos de la nube. No se ha cambiado nada: reintenta en unos instantes.",
    );
  }
  const explained: AppError = (await import("./errors.js")).toAppError(error);
  return { phase: "cloud_failed", error: explained };
};

/** The device is offline (as far as the browser knows): nothing may be shown. */
const isOffline = (): boolean => typeof navigator !== "undefined" && navigator.onLine === false;

/**
 * The number of the boot that may publish. A boot that started earlier never
 * overwrites a later one, whether it ends offline, failed or ready; going
 * offline is itself a later event, so it takes a number too.
 */
let generation = 0;

/** Leaves the screen without any data: the snapshot goes with the phase. */
const showOffline = (): void => {
  generation += 1;
  store.setDeps(undefined);
  store.clearCache();
  store.setLoad({ phase: "offline" });
};

/**
 * Boots, or **reboots**: it always asks for the session and the ledger again,
 * so what comes back after an outage is never what was on the screen before.
 */
export const bootCloud = async (request: Fetch = pageFetch): Promise<void> => {
  lastRequest = request;
  generation += 1;
  const mine = generation;
  const current = (): boolean => generation === mine;
  store.setDeps(undefined);
  store.clearCache();
  store.setLoad({ phase: "loading" });
  const session = await readSession(request);
  if (!current()) {
    return;
  }
  if (session.kind !== "signed_in") {
    store.setLoad(ofStopped(session));
    return;
  }
  await loadInto(
    { deps: depsFor(request), source: { kind: "cloud", expiresAt: session.expiresAt } },
    ofReadFailure,
    current,
  );
  // The connection went while the ledger was coming: whatever arrived is not shown.
  if (current() && isOffline()) {
    showOffline();
    return;
  }
  settleAfterBoot();
};

/** A write whose answer was lost is looked for as soon as the ledger is back (ADR-0035, §2). */
const settleAfterBoot = (): void => {
  if (store.pending() !== undefined && store.load().phase === "ready") {
    void import("./pending.js").then((pending) => pending.settlePending());
  }
};

/**
 * Reads the ledger again from the same store, after a write or a `412`.
 * `quiet` keeps the screen mounted (it never passes through `loading`), which
 * is what lets a form keep what was typed while the preview is rebuilt.
 */
export const reloadLedger = async (options: { quiet?: boolean } = {}): Promise<void> => {
  const phase = store.load();
  const deps = store.deps();
  if (deps === undefined || (phase.phase !== "ready" && phase.phase !== "loading")) {
    return;
  }
  const source = phase.source;
  if (source === undefined) {
    return;
  }
  const mine = generation;
  await loadInto(
    { deps, source },
    ofReadFailure,
    () => generation === mine,
    options.quiet === true,
  );
  if (generation === mine && isOffline()) {
    showOffline();
  }
};

/**
 * The person signed in again (in another tab, so what is on screen stays): the
 * session is read again and the store is rebuilt for the device it names. The
 * ledger on screen is **not** replaced; the next write finds out, through
 * `If-Match`, whether it is still the same.
 */
export const refreshSession = async (
  request: Fetch = lastRequest,
): Promise<"signed_in" | "signed_out" | "offline"> => {
  const session = await readSession(request);
  if (session.kind === "unavailable") {
    return "offline";
  }
  if (session.kind !== "signed_in") {
    return "signed_out";
  }
  const phase = store.load();
  store.setDeps(depsFor(request));
  if (phase.phase === "ready") {
    store.setLoad({ ...phase, source: { kind: "cloud", expiresAt: session.expiresAt } });
  }
  return "signed_in";
};

/**
 * Hides the data the moment the connection is lost, and reads everything again
 * when it returns. Called once, by the boot.
 */
export const watchConnection = (request: Fetch = pageFetch): (() => void) => {
  const back = (): void => {
    void bootCloud(request);
  };
  window.addEventListener("offline", showOffline);
  window.addEventListener("online", back);
  return () => {
    window.removeEventListener("offline", showOffline);
    window.removeEventListener("online", back);
  };
};
