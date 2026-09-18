// User-facing messages in Spanish, derived from domain error codes.

import type {
  DependentEventsError,
  DomainError,
  DuplicateFingerprintError,
  Warning,
} from "@atlas/domain";
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

/**
 * The wash-sale window by its real name. Calling a one-year window "the
 * two-month rule" is not a wording slip: it states something fiscally false
 * next to a date that contradicts it.
 */
const windowText = (window: unknown): string => {
  const value = text(window);
  if (value === "2m") {
    return "ventana de dos meses";
  }
  if (value === "1y") {
    return "ventana de un año";
  }
  return `ventana de ${value.slice(0, -1)} días`;
};

/** Why a control rule of the bucket could not be measured, with what is missing. */
const gapText = (d: Record<string, unknown>): string => {
  const missing = [
    ...((d.assets as string[] | undefined) ?? []),
    ...((d.currencies as string[] | undefined) ?? []),
  ];
  const detail = missing.length === 0 ? "" : ` (faltan ${missing.join(", ")})`;
  switch (d.reason) {
    case "missing_prices":
      return `hay posiciones del cubo sin precio${detail}`;
    case "no_contribution":
      return "todavía no hay aporte bruto al cubo sobre el que medir";
    case "partial_net_worth":
      return `el patrimonio total es parcial${detail}`;
    default:
      return "el patrimonio total no es positivo";
  }
};

/**
 * Spanish text of a projection warning. The domain speaks English and the CLI
 * translates the `code` (see `errors.ts`); an unknown code falls back to the
 * message, so a warning added later is never swallowed.
 */
export const describeWarning = (warning: Warning): string => {
  const d = warning.details;
  switch (warning.code) {
    case "unknown_target_weight":
      return `El peso objetivo de ${text(d.asset_id)} no corresponde a ningún activo del núcleo: revisa si el asset_id está mal escrito.`;
    case "asset_without_target":
      return `${text(d.asset_id)} tiene posición y ningún peso objetivo asignado.`;
    case "deviation_above_threshold":
      return `${text(d.asset_id)} se desvía ${text(d.deviation_pp)} pp del objetivo (umbral ${text(d.threshold_pp)} pp). El rebalanceo por venta es decisión anual tuya (regla 3).`;
    case "satellite_below_minimum":
      return `La clase satélite ${text(d.asset_class)} pesa ${text(d.weight_pct)} %, por debajo del mínimo de ${text(d.minimum_pct)} % (regla 6b: 0 % o al menos el mínimo).`;
    case "partial_core_total":
      return `Faltan precios de ${(d.assets as string[]).join(", ")} a ${text(d.date)}: no se calculan pesos sobre un total parcial.`;
    case "stale_fx_rate":
      return `El tipo de cambio aplicado a ${text(d.currency)} es de ${text(d.age_days)} días atrás (${text(d.date)}); registra una operación o una valoración más reciente en esa divisa.`;
    case "partial_bucket_total":
      return `Faltan precios de ${(d.assets as string[]).join(", ")} a ${text(d.date)}: el total del cubo solo cubre lo que sí tiene precio.`;
    case "partial_net_worth":
      return `El patrimonio a ${text(d.date)} es parcial: faltan ${[...(d.assets as string[]), ...(d.currencies as string[])].join(", ")}.`;
    case "bucket_sample_too_small":
      return `Solo ${text(d.closed_theses)} tesis cerradas y ${text(d.sell_operations)} ventas: por debajo de ${text(d.sample)} operaciones la muestra no distingue habilidad de suerte.`;
    case "bucket_contaminated_theses":
      return `${(d.theses as string[]).length} tesis quedan fuera de las medias (${(d.theses as string[]).join(", ")}): sus ventas consumieron lotes comprados por otra tesis (FIFO global, ADR-0009).`;
    case "bucket_contribution_exceeded":
      return `El aporte bruto al cubo (${text(d.gross_eur)} EUR) supera el tope de ${text(d.limit_eur)} EUR (regla 17). Las retiradas no devuelven margen: la regla 19 prohíbe reponer el cubo.`;
    case "bucket_contribution_near_limit":
      return `El aporte bruto al cubo (${text(d.gross_eur)} EUR) pasa del 80 % del tope de ${text(d.limit_eur)} EUR (regla 17).`;
    case "bucket_stop_loss_reached":
      return `REGLA DE PARADA: la pérdida acumulada del cubo (${text(d.loss_eur)} EUR) es el ${text(d.loss_pct)} % del aporte bruto (${text(d.gross_eur)} EUR), por encima del ${text(d.limit_pct)} % configurado (regla 17). La app avisa; la decisión es tuya.`;
    case "bucket_stop_loss_not_evaluated":
      return `La regla de parada (${text(d.limit_pct)} %) no se ha podido evaluar: ${gapText(d)}. Sin ese dato no hay control de pérdida acumulada, no es que no la haya (regla 17).`;
    case "bucket_weight_not_evaluated":
      return `La regla de peso (${text(d.limit_pct)} %) no se ha podido evaluar: ${gapText(d)}. Sin ese dato no hay control de peso del cubo, no es que esté dentro (regla 18).`;
    case "bucket_weight_exceeded":
      return `El cubo pesa el ${text(d.weight_pct)} % del patrimonio total, por encima del ${text(d.limit_pct)} % configurado (regla 18): valora traspasar el exceso al núcleo.`;
    case "missing_benchmark_asset":
      return "No hay índice de referencia configurado: fíjalo con `atlas settings set --bucket-benchmark-asset <asset_id>` (regla 16).";
    case "unknown_benchmark_asset":
      return `El índice de referencia ${text(d.asset_id)} no está en el catálogo: la comparación queda sin dato.`;
    case "missing_benchmark_price":
      return `Falta el precio del índice ${text(d.asset_id)} a ${text(d.date)}: la comparación queda sin dato (nunca se estima).`;
    case "stale_price":
      return `${text(d.asset_id)}: el precio es de ${text(d.age_days)} días atrás (${text(d.date)}); registra una valoración más reciente.`;
    case "currency_mismatch":
      return `El evento está en ${text(d.currency)} y el activo ${text(d.asset_id)} está en ${text(d.asset_currency)}.`;
    case "fx_rate_date_after_fiscal_date":
      return `fx_rate_date (${text(d.fx_rate_date)}) es posterior a la fecha fiscal (${text(d.fiscal_date)}).`;
    case "same_asset_two_accounts":
      return `El activo ${text(d.asset_id)} está ahora en ${(d.accounts as string[]).length} cuentas; el FIFO sigue siendo global.`;
    case "sell_without_thesis":
      return `La venta de ${text(d.asset_id)} en ${text(d.account_id)} no está enlazada a ninguna tesis.`;
    case "thesis_size_exceeded":
      return `La tesis ${text(d.thesis_id)} lleva ${text(d.invested_eur)} EUR invertidos, por encima de los ${text(d.planned_size_eur)} EUR previstos.`;
    case "wash_sale_window_repurchase":
      return `Recompra de ${text(d.asset_id)} dentro de la ventana de la venta ${text(d.sale_event_id)} (${text(d.sale_date)}, pérdida ${text(d.loss_eur)} EUR): esa pérdida no será computable este ejercicio. La ventana llega hasta el ${text(d.window_end)} (${windowText(d.window)}, business-rules.md §5.4). El diferimiento lo calculará el motor fiscal.`;
    case "wash_sale_window_prior_buy":
      return `Venta con pérdida de ${text(d.asset_id)} (${text(d.loss_eur)} EUR) con una compra del ${text(d.buy_date)} (${text(d.buy_event_id)}, ${text(d.quantity)} títulos) dentro de la ventana abierta el ${text(d.window_start)} (${windowText(d.window)}): la pérdida no será computable este ejercicio (business-rules.md §5.4).`;
    case "thesis_closed_with_position":
      return `La tesis ${text(d.thesis_id)} está cerrada pero ${text(d.account_id)} sigue teniendo ${text(d.asset_id)} (${text(d.position)}).`;
    default:
      return warning.message;
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
