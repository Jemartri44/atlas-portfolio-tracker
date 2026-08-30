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
      return `Las compras en el cubo exigen --thesis <id> de una tesis abierta y registrada antes (regla 15): atlas thesis open --id … --account ${text(d.account_id)} --asset ${text(d.asset_id)} …`;
    case "unknown_thesis":
      return `La tesis ${text(d.thesis_id)} no existe.`;
    case "thesis_mismatch":
      return `La tesis ${text(d.thesis_id)} es de ${text(d.asset_id)} en ${text(d.account_id)}, no de esta operación.`;
    case "thesis_not_open":
      return `La tesis ${text(d.thesis_id)} no está abierta en este punto del libro (se abre antes de comprar y no se cierra antes).`;
    case "thesis_not_allowed":
      return `--thesis solo se usa en cuentas del cubo; ${text(d.account_id)} es del núcleo.`;
    case "duplicate_thesis":
      return `La tesis ${text(d.thesis_id)} ya existe.`;
    case "thesis_already_open":
      return `Ya hay una tesis abierta (${text(d.thesis_id)}) sobre ${text(d.asset_id)} en ${text(d.account_id)}: ciérrala antes.`;
    case "thesis_already_closed":
      return `La tesis ${text(d.thesis_id)} ya está cerrada.`;
    case "not_bucket":
      return `Una tesis exige cuenta y activo del cubo (${text(d.account_id)}, ${text(d.asset_id)}).`;
    case "effects_not_allowed_for_kind":
      return `El kind ${text(d.kind)} no admite la secuencia de efectos ${text(d.effects)}; admitidas: ${text(d.allowed)}.`;
    case "liquidation_must_cover_all_accounts":
      return `Una liquidación vende "all" en exactamente las cuentas con posición de ${text(d.asset_id)} (faltan: ${text(d.missing)}; sobran: ${text(d.extra)}; parciales: ${text(d.partial)}).`;
    case "no_open_lots":
      return `El activo ${text(d.asset_id)} no tiene lotes abiertos en la fecha de efecto: nada que transformar.`;
    case "same_asset":
      return `El activo destino no puede ser el propio ${text(d.asset_id)}.`;
    case "duplicate_account_in_effect":
      return `La cuenta ${text(d.account_id)} aparece dos veces en per_account.`;
    case "invalid_ratio":
      return `Ratio no válido: ${text(d.value)} (decimal positivo o fracción nuevas/antiguas como 4/3).`;
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
      return `El tipo de evento ${text(d.type)} está reservado para una feature posterior y esta CLI no lo proyecta.`;
    case "schema_too_new":
      return `El libro usa schema_version ${text(d.found)} y esta CLI solo entiende hasta ${text(d.supported)}: actualiza la aplicación.`;
    case "conflict":
      return "El libro ha cambiado desde que se cargó: repite el comando.";
    case "invalid_events":
      return `El libro tiene eventos inválidos; rectifícalos antes de compactar:\n${table(
        ["id", "tipo", "motivo"],
        (d.affected as { id: string; type: string; error: string }[]).map((e) => [
          e.id,
          e.type,
          e.error,
        ]),
      )}`;
    case "projection_changed":
      return `La reescritura cambiaría la proyección (${text(d.keys)}): no se ha escrito nada.`;
    case "archive_exists":
      return `El archivo ${text(d.archive_name)} ya existe y nunca se sobrescribe.`;
    case "ledger_missing":
      return `No hay libro en ${text(d.path)}: nada que copiar.`;
    case "backup_mismatch":
      return `La copia ${text(d.path)} no coincide con el libro (etag o número de líneas): bórrala y repite.`;
    case "path_exists":
      return `La ruta ${text(d.path)} ya existe: no se sobrescribe nada.`;
    case "synthetic_invalid":
      return `El libro generado no supera la verificación (${text(d.invalid)}, ${text(d.findings)}): es un error del generador.`;
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
