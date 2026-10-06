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
import { RemoteError } from "@atlas/domain/sync";
import { readSession, type SessionState } from "../sync/session.js";
import { loadInto } from "./actions.js";
import type { AppError, LoadPhase, SignedOutReason } from "./state.js";
import { store } from "./state.js";

type Fetch = typeof fetch;

/** The page's `fetch`, looked up at each call so a test can replace it. */
const pageFetch: Fetch = (input, init) => fetch(input, init);

const failed = (code: string, message: string): LoadPhase => ({
  phase: "cloud_failed",
  error: { code, message },
});

/** The codes of §7 that mean «no usable session», each with its reason. */
const SIGNED_OUT: Readonly<Record<string, SignedOutReason>> = {
  unauthenticated: "signed_out",
  session_invalid: "expired",
  not_allowed: "not_allowed",
  device_forgotten: "forgotten",
};

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

/** Leaves the screen without any data: the snapshot goes with the phase. */
const showOffline = (): void => {
  store.setDeps(undefined);
  store.clearCache();
  store.setLoad({ phase: "offline" });
};

/**
 * Boots, or **reboots**: it always asks for the session and the ledger again,
 * so what comes back after an outage is never what was on the screen before.
 */
export const bootCloud = async (request: Fetch = pageFetch): Promise<void> => {
  store.setDeps(undefined);
  store.clearCache();
  store.setLoad({ phase: "loading" });
  const session = await readSession(request);
  if (session.kind !== "signed_in") {
    store.setLoad(ofStopped(session));
    return;
  }
  await loadInto(
    {
      deps: {
        store: new ApiLedgerStore(
          // `expectedDevice`: the API binds the ledger routes to the device of the cookie.
          httpRemote({ origin: "", fetch: request, expectedDevice: session.deviceId }),
        ),
        clock: systemClock,
        random: webCryptoRandom,
      },
      source: { kind: "cloud", expiresAt: session.expiresAt },
    },
    ofReadFailure,
  );
  // The connection went while the ledger was coming: whatever arrived is not shown.
  if (isOffline()) {
    showOffline();
  }
};

/**
 * Hides the data the moment the connection is lost, and reads everything again
 * when it returns. Called once, by the boot.
 */
export const watchConnection = (request: Fetch = pageFetch): void => {
  window.addEventListener("offline", showOffline);
  window.addEventListener("online", () => {
    void bootCloud(request);
  });
};
