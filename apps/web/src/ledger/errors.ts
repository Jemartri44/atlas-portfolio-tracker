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
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return {
      code: "permission_denied",
      message:
        "El navegador ha denegado el acceso a la carpeta de tus datos. Vuelve a conectarla para seguir.",
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
  if (error instanceof Error && error.name === "StorageUnavailable") {
    return {
      code: "storage_unavailable",
      message:
        "Este navegador no permite guardar datos del sitio (modo privado o datos bloqueados). Abre tus datos desde una carpeta, o usa otro navegador.",
      action: { label: "Abrir tus datos", to: "/libro" },
    };
  }
  return {
    code: "unexpected",
    message: error instanceof Error ? error.message : String(error),
  };
};
