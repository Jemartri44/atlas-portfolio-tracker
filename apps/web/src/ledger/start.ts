// The lazy start of the cloud mode: the chunk with the session and the ledger is loaded on
// demand, and a chunk that cannot be fetched (a stale `index.html` after a deploy, a lost
// connection) must show «Reintentar» instead of leaving the skeleton for ever.

import { store } from "./state.js";

let watching = false;

/** Loads the cloud chunk and boots it; a failure to load the chunk ends in `CloudGate`. */
export const startCloud = async (): Promise<void> => {
  let cloud: typeof import("./cloud.js");
  try {
    cloud = await import("./cloud.js");
  } catch {
    store.setLoad({
      phase: "cloud_failed",
      error: {
        code: "chunk_failed",
        message:
          "No se ha podido cargar la aplicación (puede que haya una versión nueva). No se ha leído ni cambiado nada: reintenta, o recarga la página si sigue igual.",
      },
    });
    return;
  }
  if (!watching) {
    watching = true;
    cloud.watchConnection();
  }
  await cloud.bootCloud();
};
