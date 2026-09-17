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
      return d.asset_id === undefined
        ? "Un traspaso fiscal exige que ambos activos sean traspasables."
        : `El activo ${text(d.asset_id)} no es traspasable (not_transferable): un traspaso fiscal exige que ambos lo sean.`;
    case "not_core_asset":
      return `El activo ${text(d.asset_id)} no pertenece al núcleo: el simulador de traspaso solo opera sobre la cartera principal.`;
    case "missing_manual_prices":
      return `Faltan precios manuales a ${text(d.date)}: ${(d.assets as string[]).join(", ")}. Regístralos con \`atlas add valuation --asset <id> --date ${text(d.date)} …\`.`;
    case "missing_target_weights":
      return "No hay pesos objetivo configurados: fíjalos con `atlas settings set --target-weights ast_x=60,ast_y=40` (target_weights).";
    case "missing_bucket_pct":
      return "Falta el porcentaje del cubo: `atlas settings set --bucket-pct-of-contribution 10` (bucket_pct_of_contribution).";
    case "missing_amount":
      return "Falta el importe de la aportación: pásalo con --amount o fíjalo con `atlas settings set --monthly-contribution-eur 600` (monthly_contribution_eur).";
    case "no_target_weight_in_table":
      return `Los pesos objetivo vigentes no apuntan a ningún activo de la tabla del núcleo${
        (d.assets as string[]).length === 0
          ? " (la tabla está vacía)"
          : `: ${(d.assets as string[]).join(", ")} están todos al 0 %`
      }. Es casi seguro un asset_id mal escrito en target_weights: mira el aviso unknown_target_weight de \`atlas weights\` y corrígelo con \`atlas settings set --target-weights …\`.`;
    case "split_not_exact":
      return `El reparto de la aportación no cuadra (${text(d.distributed)} repartidos de ${text(d.core)}): es un fallo interno de la calculadora, no registres nada.`;
    case "invalid_amount":
      return `El importe de la aportación debe ser mayor que cero (recibido: ${text(d.value)}).`;
    case "invalid_quantity":
      return `La cantidad traspasada debe ser mayor que cero (recibido: ${text(d.value)}).`;
    case "eur_fx_rate_not_one":
      return `${text(d.field)} debe ser exactamente "1" cuando la divisa es EUR (recibido: ${text(d.value)}): el BCE no publica un tipo del euro contra sí mismo.`;
    case "fx_rate_date_weekend":
      return `${text(d.field)} (${text(d.value)}) cae en fin de semana y el BCE no publica: usa el último día hábil anterior.`;
    case "transfer_fee_not_allowed":
      return "Un traspaso no lleva comisión: registra el cargo del depositario como `standalone_fee` (atlas add fee).";
    case "accept_invalid_not_allowed":
      return `--accept-invalid solo se admite en un cambio de configuración, no en ${text(d.type)} (ADR-0015).`;
    case "newly_invalid_events":
      return `Este cambio de configuración deja inválidos ${(d.affected as unknown[]).length} eventos ya registrados.`;
    case "invalid_wash_sale_window":
      return `La ventana de recompra de ${text(d.asset_type)} debe ser "2m", "1y" o "<n>d" (recibido: ${text(d.value)}).`;
    case "negative_target_weight":
      return `El peso objetivo de ${text(d.asset_id)} no puede ser negativo (recibido: ${text(d.value)}).`;
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
    case "ledger_has_invalid_events": {
      const count = d.invalid_count as number;
      return `El libro ya tenía ${count} ${
        count === 1 ? "evento inválido" : "eventos inválidos"
      } antes de esta operación: sobre un libro degradado solo puede escribirse un cambio de configuración (ADR-0015). El primero es ${text(d.offending_type)} ${text(d.offending_id)}: ${text(d.offending_error)}. Ejecuta \`atlas check\` y rectifícalo antes.`;
    }
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
