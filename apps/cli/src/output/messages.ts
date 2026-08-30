// User-facing messages in Spanish, derived from domain error codes.

import type { DependentEventsError, DomainError, DuplicateFingerprintError } from "@atlas/domain";
import { table } from "./table.js";

const text = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

export const describeError = (error: DomainError): string => {
  const d = error.details;
  switch (error.code) {
    case "unknown_account":
      return `La cuenta ${text(d.account_id)} no existe.`;
    case "unknown_asset":
      return `El activo ${text(d.asset_id)} no existe.`;
    case "duplicate_account":
      return `La cuenta ${text(d.account_id)} ya existe.`;
    case "duplicate_asset":
      return `El activo ${text(d.asset_id)} ya existe.`;
    case "asset_book_change":
      return `El activo ${text(d.asset_id)} no puede cambiar de libro (ADR-0009): dalo de alta como activo nuevo.`;
    case "asset_type_change":
      return `El activo ${text(d.asset_id)} no puede cambiar de tipo (${text(d.from)} → ${text(d.to)}): alteraría la fecha fiscal de todas sus operaciones. Dalo de alta como activo nuevo.`;
    case "asset_currency_change":
      return `El activo ${text(d.asset_id)} no puede cambiar de divisa (${text(d.from)} → ${text(d.to)}): alteraría la base de coste de todas sus operaciones. Dalo de alta como activo nuevo.`;
    case "account_book_change":
      return `La cuenta ${text(d.account_id)} tiene operaciones registradas: su libro no puede cambiar.`;
    case "book_mismatch":
      return "La cuenta y el activo pertenecen a libros distintos (núcleo y cubo no se mezclan).";
    case "thesis_required":
      return "Las compras en el cubo exigen una tesis previa; las tesis llegan con la feature 002.";
    case "insufficient_position":
      return `La cuenta ${text(d.account_id)} no tiene suficiente ${text(d.asset_id)} en esa fecha (disponible: ${text(d.available)}).`;
    case "insufficient_lots":
      return `Los lotes abiertos de ${text(d.asset_id)} no cubren la cantidad (abiertos: ${text(d.open ?? d.missing)}).`;
    case "not_transferable":
      return "Un traspaso fiscal exige que ambos activos sean traspasables.";
    case "reversal_of_reversal":
      return "No se puede anular una anulación: registra de nuevo el evento original.";
    case "already_reversed":
      return "Ese evento ya está anulado.";
    case "reversal_target_missing":
    case "not_found":
      return `El evento ${text(d.reverses_id ?? d.id)} no existe.`;
    case "unknown_order":
      return `La orden ${text(d.order_id)} no existe en esa fecha.`;
    case "order_closed":
      return `La orden ${text(d.order_id)} ya está cerrada (${text(d.stage)}).`;
    case "order_mismatch":
      return `La orden ${text(d.order_id)} no coincide con la cuenta, el activo o el sentido de la operación.`;
    case "unknown_request":
      return `La solicitud de traspaso ${text(d.request_id)} no existe en esa fecha.`;
    case "request_closed":
      return `La solicitud de traspaso ${text(d.request_id)} ya está cerrada (${text(d.stage)}).`;
    case "request_mismatch":
      return `La solicitud de traspaso ${text(d.request_id)} se refiere a otras cuentas o activos.`;
    case "dependent_events":
      return `El evento ${text(d.target_id)} ha sido consumido por eventos posteriores; rectifícalos antes.`;
    case "unsupported_event":
      return `El tipo de evento ${text(d.type)} todavía no está soportado (feature 002).`;
    case "schema_too_new":
      return `El libro usa schema_version ${text(d.found)} y esta CLI solo entiende hasta ${text(d.supported)}: actualiza la aplicación.`;
    case "conflict":
      return "El libro ha cambiado desde que se cargó: repite el comando.";
    case "missing_field":
      return `Falta el campo ${text(d.field)} en ${text(d.type)}.`;
    case "invalid_field":
      return `El campo ${text(d.field ?? d.fields)} de ${text(d.type)} no es válido: ${error.message}.`;
    case "invalid_decimal":
      return `Valor numérico no válido: ${text(d.value)} (usa cadenas decimales como 123.45).`;
    case "invalid_date":
      return `La fecha de ${text(d.field)} debe tener el formato YYYY-MM-DD.`;
    default:
      return error.message;
  }
};

export const describeDuplicate = (error: DuplicateFingerprintError): string =>
  `Ya existe un evento con la misma huella (${error.existing.join(", ")}). Si es una repetición legítima, añade --confirm-duplicate.`;

export const describeDependants = (error: DependentEventsError): string =>
  `${describeError(error)}\nEventos que dejarían de ser válidos (rectifícalos primero):\n${table(
    ["id", "tipo", "motivo"],
    error.affected.map((entry) => [entry.id, entry.type, entry.error]),
  )}`;

export const priorYearWarning =
  "Aviso: el evento rectificado pertenece a un ejercicio anterior; puede afectar a una declaración ya presentada.";
