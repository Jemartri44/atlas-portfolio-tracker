// The one door through which any failure becomes something the interface can
// paint: an `AppError` with its message in Spanish and, where there is one, the
// action that fixes it.
//
// Its own module, and not part of `actions.ts`, so that the boot does not carry
// the whole catalogue of messages: opening a ledger imports this lazily, and
// only when something went wrong.

import { DomainError } from "@atlas/domain";
import { describeError } from "../format/messages/errors.js";
import { nameIndex } from "../format/names.js";
import type { AppError } from "./state.js";
import { store } from "./state.js";

/**
 * A domain error (or anything else) as the interface shows it, in Spanish.
 *
 * The catalogue comes from the loaded snapshot, so "La cuenta acc_mi no existe"
 * reads "La cuenta Fondos indexados no existe". During the boot there is no
 * snapshot yet and `nameIndex` answers with an empty index, which resolves
 * every identifier to itself — the behaviour this had before.
 */
/** What the browser throws when a chosen file cannot be read. */
const FILE_READ_ERRORS = new Set(["NotReadableError", "NotFoundError", "EncodingError"]);

export const toAppError = (error: unknown): AppError => {
  if (error instanceof DomainError) {
    const line = error.details.line;
    return {
      code: error.code,
      message: describeError(error, {
        names: nameIndex(store.snapshot()?.state),
        privacy: store.privacy(),
      }),
      ...(typeof line === "number" ? { line } : {}),
    };
  }
  if (error instanceof Error && error.name === "NoLedgerInFolder") {
    return {
      code: "no_ledger_in_folder",
      message:
        "En esa carpeta no hay ningún ledger.jsonl: elige la carpeta donde la consola guarda tus datos. No se ha tocado nada.",
    };
  }
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return {
      code: "permission_denied",
      message:
        "El navegador ha denegado el permiso para leer la carpeta. Vuelve a elegirla y concédelo para seguir; no se ha tocado nada.",
      action: { label: "Abrir tus datos", to: "/libro" },
    };
  }
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return {
      code: "storage_full",
      message:
        "No cabe en el almacenamiento del navegador: no se ha escrito nada. Exporta tus datos y libera espacio del sitio antes de volver a intentarlo.",
      action: { label: "Exportar tus datos", to: "/ajustes" },
    };
  }
  // Reading a file the user chose: it moved, it was a folder, the permission
  // lapsed, it is not text. The browser says so in English; the user reads it
  // in Spanish, with what to do (review of 2026-09-19).
  if (error instanceof DOMException && FILE_READ_ERRORS.has(error.name)) {
    return {
      code: "file_unreadable",
      message:
        "No se ha podido leer el archivo: puede que se haya movido, que no sea un archivo de texto o que el navegador ya no tenga permiso. Vuelve a elegirlo; no se ha tocado nada.",
    };
  }
  // Another tab still has the previous version of the database open (feature
  // 012 added the store of drafts). It is not the browser refusing to keep
  // data, and saying so sent the user to change a setting that was fine.
  if (error instanceof Error && error.name === "StorageUnavailable" && error.cause === "blocked") {
    return {
      code: "storage_blocked",
      message:
        "Hay otra pestaña de Atlas abierta con una versión anterior de la aplicación y no deja actualizar el almacenamiento. Ciérrala y recarga esta; tus datos no se han tocado.",
    };
  }
  if (error instanceof Error && error.name === "StorageUnavailable") {
    return {
      code: "storage_unavailable",
      message:
        "Este navegador no permite guardar datos del sitio (modo privado o datos bloqueados), y tus datos viven en él. Permite los datos del sitio o usa otro navegador.",
      action: { label: "Abrir tus datos", to: "/libro" },
    };
  }
  // Never swallowed: what failed goes after a sentence in Spanish, so the
  // screen still says what happened and nothing is hidden.
  return {
    code: "unexpected",
    message: `Algo ha fallado sin que la aplicación lo esperase; no se ha escrito nada. Detalle: ${
      error instanceof Error ? error.message : String(error)
    }`,
  };
};
