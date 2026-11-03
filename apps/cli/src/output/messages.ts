// User-facing messages in Spanish, derived from domain error codes.

import type { DependentEventsError, DomainError, DuplicateFingerprintError } from "@atlas/domain";
import { say } from "@atlas/domain/messages";
import { table } from "./table.js";
import { CLI_VOICE } from "./voice.js";

export { RAW_LINE_BREAK_FIX } from "@atlas/domain/messages";

export const describeError = (error: DomainError): string => {
  const said = say("error", error.code, error.details, CLI_VOICE, error.message);
  if (said === undefined) {
    return error.message;
  }
  if (error.code === "invalid_events") {
    // The list of what is invalid is a table, which only the console draws.
    return `${said}\n${table(
      ["id", "tipo", "motivo"],
      (error.details.affected as { id: string; type: string; error: string }[]).map((e) => [
        e.id,
        e.type,
        e.error,
      ]),
    )}`;
  }
  return said;
};

export const describeDuplicate = (error: DuplicateFingerprintError): string =>
  `Ya existe un evento con la misma huella (${error.existing.join(", ")}). Si es una repetición legítima, añade --confirm-duplicate.`;

export const describeDependants = (error: DependentEventsError): string => {
  const isSettings = error.code === "newly_invalid_events";
  const heading = isSettings
    ? "Eventos que pasan a ser inválidos con la configuración nueva:"
    : "Eventos que dejarían de ser válidos (rectifícalos primero):";
  const footer = isSettings
    ? "\nLos hechos no cambian, cambia su interpretación (ADR-0015). Repite con --accept-invalid si es lo que quieres."
    : "";
  return `${describeError(error)}\n${heading}\n${table(
    ["id", "tipo", "motivo"],
    error.affected.map((entry) => [entry.id, entry.type, entry.error]),
  )}${footer}`;
};

export const priorYearWarning =
  "Aviso: el evento rectificado pertenece a un ejercicio anterior; puede afectar a una declaración ya presentada.";
