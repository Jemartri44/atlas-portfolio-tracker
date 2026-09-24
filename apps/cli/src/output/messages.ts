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
    // --- Corporate actions composed from parameters (feature 007) ----------
    case "missing_source_document":
      return `Un evento corporativo de tipo ${text(d.kind)} necesita su fuente documental: la URL o el PDF del emisor. No es opcional (data-schema.md §6.5).`;
    case "missing_effect_parameter":
      return `Un evento corporativo de tipo ${text(d.kind)} necesita ${text(d.parameter)} para poder componer sus efectos.`;
    case "no_wizard_for_kind":
      return `El tipo ${text(d.kind)} no se compone a partir de parámetros: sus efectos se indican a mano con atlas ca raw --kind ${text(d.kind)} --effects-json …`;
    case "fee_account_not_selling":
      return `La cuenta ${text(d.account_id)} no participa en la venta forzosa, así que no puede llevar comisión. Venden: ${(d.selling as string[]).join(", ")}.`;
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
    case "invalid_settings": {
      // `validateSettings` names the parameter it rejected; the CLI is the only
      // place that speaks to a person, so it is the one that has to say it in
      // Spanish (deuda anotada en la feature 004).
      if (d.total !== undefined) {
        return `Los pesos objetivo deben sumar 100 y suman ${text(d.total)}: corrígelos con \`atlas settings set --target-weights …\`.`;
      }
      if (d.min !== undefined) {
        const range =
          d.max === undefined
            ? `${text(d.min)} o mayor`
            : `un valor entre ${text(d.min)} y ${text(d.max)}`;
        return `El parámetro ${text(d.field)} debe ser ${range} (recibido: ${text(d.value)}).`;
      }
      if (d.value === undefined) {
        return `Falta el parámetro ${text(d.field)} en la configuración.`;
      }
      return `El parámetro ${text(d.field)} no admite ese valor (recibido: ${text(d.value)}).`;
    }
    case "invalid_wash_sale_window":
      return `La ventana de recompra de ${text(d.asset_type)} debe ser "2m", "1y" o "<n>d" (recibido: ${text(d.value)}).`;
    case "filing_year_unsupported":
      return `El Modelo ${text(d.model)} no existe para el ejercicio ${text(d.tax_year)}: el primero que se puede registrar es ${text(d.first_supported)}.`;
    case "filed_at_not_after_year":
      return `Una declaración del ejercicio ${text(d.tax_year)} no se pudo presentar el ${text(d.filed_at)}: la fecha tiene que ser posterior al 31/12 de ${text(d.tax_year)}.`;
    case "filed_at_in_future":
      return `La fecha de presentación (${text(d.filed_at)}) es posterior al día en que se registra (${text(d.recorded_at)}): no se registra lo que aún no se ha presentado.`;
    case "as_of_before_year_end":
      return `El cálculo que acompaña a la declaración es del ${text(d.as_of)}, anterior al cierre del ejercicio ${text(d.tax_year)}: no puede cubrirlo entero, así que sus cifras estarían a medias.`;
    case "as_of_in_future":
      return `El cálculo que acompaña a la declaración es del ${text(d.as_of)}, posterior al día en que se registra (${text(d.recorded_at)}): no se calcula en el futuro.`;
    case "duplicate_pending_loss":
      return `Los saldos pendientes declarados repiten el ejercicio ${text(d.origin_year)} en ${text(d.category)}: cada origen y categoría va una sola vez.`;
    case "duplicate_filed_item":
      return `Los bienes declarados repiten ${text(d.account_id)}${d.asset_id === undefined ? "" : `/${text(d.asset_id)}`} en ${text(d.category)}: cada bien va una sola vez.`;
    case "alert_above_threshold":
      return `El aviso del Modelo ${text(d.model)} (${text(d.alert)} €) no puede superar el umbral que obliga a presentarlo (${text(d.threshold)} €): nunca llegaría a saltar.`;
    case "invalid_renta_season":
      return d.value === undefined
        ? `La temporada de Renta empieza el ${text(d.start)} y termina el ${text(d.end)}: el inicio no puede ser posterior al fin.`
        : `El parámetro ${text(d.field)} debe ser un día del año con la forma MM-DD (recibido: ${text(d.value)}).`;
    case "tax_ledger_invalid":
      return `El libro tiene ${text(d.count)} eventos inválidos y un cálculo fiscal sobre él sería aproximado: repáralos antes (\`atlas check\`). Inválidos: ${((d.invalid as { id: string; type: string; code: string }[] | undefined) ?? []).map((entry) => `${entry.type} ${entry.id} (${entry.code})`).join(", ")}.`;
    case "tax_year_unsupported":
      return `El motor fiscal aplica el régimen de compensación vigente desde ${text(d.first_supported)}; ${text(d.year)} es anterior (o no es un año).`;
    case "duplicate_isin":
      return `El ISIN ${text(d.isin)} ya es del activo ${text(d.existing_asset_id)}: un mismo valor no puede ser dos activos, porque la regla de recompra y el FIFO los tratarían como distintos (ADR-0009). Registra las operaciones en ${text(d.existing_asset_id)}.`;
    case "invalid_fiscal_date_rule":
      return `La fecha fiscal de ${text(d.asset_type)} debe ser trade_date (contratación) o value_date (fecha valor) (recibido: ${text(d.value)}): decide el ejercicio de cada operación (ADR-0013).`;
    case "invalid_income_category":
      return `La categoría de renta de ${text(d.asset_type)} debe ser capital_gain (ganancia patrimonial) o movable_capital (rendimiento del capital mobiliario) (recibido: ${text(d.value)}): decide en qué parte de la base del ahorro entra cada transmisión (ADR-0021).`;
    case "negative_target_weight":
      return `El peso objetivo de ${text(d.asset_id)} no puede ser negativo (recibido: ${text(d.value)}).`;
    case "reversal_of_reversal":
      return "No se puede anular una anulación: registra de nuevo el evento original.";
    // What it records already happened: the ledger was compacted without
    // verifying that fingerprint, and annulling the line does not undo it.
    case "waiver_not_reversible":
      return "No se puede anular la renuncia a verificar una huella: registra una compactación que ya ocurrió, y anular la línea que lo cuenta no la deshace. No hay nada que deshacer.";
    case "waiver_filing_unknown":
      return `La renuncia nombra la declaración ${text(d.filing_id)}, que no está en tus datos: es una renuncia a nada.`;
    case "already_reversed":
      return "Ese evento ya está anulado.";
    case "reversal_target_missing":
    case "not_found":
      return `El evento ${text(d.reverses_id ?? d.id)} no existe.`;
    case "unknown_order":
      return `La orden ${text(d.order_id)} no existe en esa fecha.`;
    case "order_closed":
      return d.stage === "filled"
        ? `La orden ${text(d.order_id)} ya se ejecutó: otra operación la cerró.`
        : `La orden ${text(d.order_id)} está cancelada: ya no se puede ejecutar.`;
    case "order_mismatch":
      return `La orden ${text(d.order_id)} no coincide con la cuenta, el activo o el sentido de la operación.`;
    case "unknown_request":
      return `La solicitud de traspaso ${text(d.request_id)} no existe en esa fecha.`;
    case "request_closed":
      return d.stage === "completed"
        ? `La solicitud de traspaso ${text(d.request_id)} ya se completó.`
        : `La solicitud de traspaso ${text(d.request_id)} está cancelada: ya no admite más pasos.`;
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
    case "missing_basis":
      return `Falta la base de la operación ${text(d.type ?? "")}: indica --amount o --unit-price.`;
    case "invalid_local_config":
      return `La configuración local atlas.config.json de la carpeta del libro no se entiende${d.field === undefined ? "" : ` (${text(d.field)})`}: corrígela o bórrala para volver a los valores por defecto.`;
    case "second_live_correction":
      return `${text(d.corrects_id)} ya tiene una corrección en vigor en ese punto del libro (${text(d.live_correction_id)}): una operación anulada solo puede tener una. Anula antes esa corrección, o corrígela a ella (ADR-0026).`;
    case "broker_settled_eur_in_eur":
      return "--broker-settled-eur solo se indica en una operación en otra divisa: en euros repetiría el importe.";
    case "broker_settled_eur_negative":
      return "--broker-settled-eur nunca es negativo: el sentido lo da el tipo de operación. Indica lo que movió el bróker, sin signo.";
    case "broker_settled_eur_zero":
      return "--broker-settled-eur no puede ser cero en una compra, una venta o una comisión: si el extracto no da la cifra, no lo indiques (sin él, la cifra queda como desconocida).";
    case "dangling_correction":
      return `La corrección apunta a ${text(d.corrects_id)}, que no está anulado: una corrección va siempre con su anulación (ADR-0003).`;
    case "dangling_reference":
      return `Referencia colgante: ${text(d.event_ids ?? d.ids)}.`;
    case "negative_position":
      return `Posición negativa en ${text(d.key ?? "una cuenta")}: falta una compra o sobra una venta.`;
    case "lots_mismatch":
      return `Los lotes fiscales de ${text(d.asset_id)} no suman la posición física.`;
    case "filing_fingerprint_lines":
      return `Una declaración presentada dice que se calculó sobre otros movimientos de los que tiene delante en el fichero: se ha insertado o quitado una línea antes de ella.`;
    case "filing_fingerprint_mismatch":
      return `Los movimientos anteriores a una declaración presentada ya no son los que había cuando se presentó (editados a mano). Recupera la copia anterior a la edición.`;
    // No es una edición: están, pero no se pueden releer en el formato que la
    // huella declara. Acusar de manipular el libro a quien tiene esto, y
    // mandarle restaurar una copia, sería falso dos veces.
    case "filing_fingerprint_unreadable":
      return `Los movimientos anteriores a una declaración presentada no se pueden leer en el formato que dice su huella: no se puede comprobar. No es una edición y no hay copia que restaurar; para poder compactar, acéptalo a propósito con «atlas compact --accept-unverified <id>», y quedará registrado.`;
    case "tax_filing_prefix_unverified":
      return `La huella de la declaración presentada no cubre los movimientos que tiene delante${d.reason === "waived" ? " y la diste por no verificable" : ""}: la diferencia con lo declarado no se reparte en sus cuatro causas, porque una de ellas solo se sostiene si todo lo demás está comprobado.`;
    case "filing_fingerprint_waived":
      return `La huella de una declaración presentada nunca llegó a comprobarse y lo diste por bueno para poder compactar: queda registrado, con su motivo y su fecha.`;
    case "duplicate_id":
      return "Dos líneas del libro tienen el mismo identificador: el fichero está corrupto.";
    case "invalid_line":
      return `Línea no válida${d.line === undefined ? "" : ` (${text(d.line)})`}: ${text(d.value ?? "no es un objeto JSON")}.`;
    case "invalid_json":
      return `La línea ${text(d.line ?? "")} no es JSON válido: el fichero no es un libro de Atlas.`;
    case "invalid_envelope":
      return `El sobre de la línea no es válido: falta o sobra ${text(d.field)}.`;
    case "invalid_currency":
      return `Divisa no válida: ${text(d.value)} (tres letras, ISO 4217).`;
    case "fx_rate_unknown":
      return `El libro tiene saldo en ${text(d.currency)} y no conoce ningún tipo del BCE para esa divisa: no se puede valorar. No debería poder pasar —toda operación lleva su tipo—, así que es un defecto: repórtalo con el libro a mano.`;
    case "invalid_fx_rate":
      return `Tipo de cambio no válido: ${text(d.value)}.`;
    case "invalid_instant":
      return "La marca de tiempo del evento (recorded_at) no es válida.";
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
    case "transfer_overdue":
      return `El traspaso ${text(d.request_id)} (${text(d.from_asset_id)} → ${text(d.to_asset_id)}) lleva ${text(d.days_open)} días abierto, más de los ${text(d.max_days)} configurados, y sigue en etapa "${text(d.stage)}". Reclama a la gestora: mientras dure, el dinero no está invertido ni en el origen ni en el destino.`;
    case "partial_bucket_total":
      return `Faltan precios de ${(d.assets as string[]).join(", ")} a ${text(d.date)}: el total del cubo solo cubre lo que sí tiene precio.`;
    case "partial_net_worth":
      return `El patrimonio a ${text(d.date)} es parcial: faltan ${[...(d.assets as string[]), ...(d.currencies as string[])].join(", ")}.`;
    case "bucket_sample_too_small":
      return `Solo ${text(d.closed_theses)} tesis cerradas y ${text(d.realized_operations)} operaciones realizadas (ventas y realizaciones por evento corporativo): por debajo de ${text(d.sample)} operaciones la muestra no distingue habilidad de suerte.`;
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
      return `Compra del ${text(d.buy_date)} de ${text(d.buy_quantity)} títulos de ${text(d.asset_id)} dentro de la ventana de su venta con pérdida del ${text(d.sale_date)} (${text(d.loss_eur)} EUR; ${windowText(d.window)}, hasta el ${text(d.window_end)}): puede hacer que esa pérdida no sea computable en ${text(d.tax_year)}. Cuánto difiere, lo dice \`atlas tax ${text(d.tax_year)}\` (business-rules.md §5.4).`;
    case "wash_sale_window_prior_buy":
      return `Venta con pérdida de ${text(d.asset_id)} del ${text(d.sale_date)} (${text(d.loss_eur)} EUR) cuando siguen en cartera ${text(d.held_quantity)} títulos de una compra del ${text(d.buy_date)}, dentro de la ventana abierta el ${text(d.window_start)} (${windowText(d.window)}): la pérdida puede no ser computable en ${text(d.tax_year)}. Cuánto, lo dice \`atlas tax ${text(d.tax_year)}\` (business-rules.md §5.4).`;
    case "swap_fiscal_dates_differ":
      return `En la permuta, ${text(d.from_asset_id)} tiene fecha fiscal ${text(d.fiscal_date_out)} y ${text(d.to_asset_id)} la tiene ${text(d.fiscal_date_in)}: la transmisión y la adquisición caen en días distintos porque sus tipos de activo usan reglas distintas (ADR-0013).`;
    case "tax_quota_not_computed":
      return "Esto es la BASE del ahorro, no la cuota ni lo que se paga: el mínimo personal, la base general y el tipo medio efectivo no están en el libro.";
    case "tax_double_taxation_partial":
      return "Doble imposición: solo se calcula el primer límite (impuesto extranjero limitado al tipo del convenio). El segundo (tipo medio efectivo) exige la declaración entera; y lo que no se deduce se pierde, no hay arrastre.";
    case "tax_treaty_rate_missing":
      return `No hay tipo de convenio configurado para ${text(d.country)}: no se calcula deducción por los ${text(d.foreign_tax_eur)} EUR retenidos. Fíjalo con \`atlas settings set --treaty-withholding-pct ${text(d.country)}=<tipo>\`.`;
    case "tax_dividend_without_country":
      return `El dividendo no dice qué país lo pagó (source_country): no se calcula deducción por los ${text(d.foreign_tax_eur)} EUR retenidos en origen.`;
    case "tax_fx_differences_not_computed":
      return `Las diferencias de cambio del efectivo en divisa (${((d.currencies as string[] | undefined) ?? []).join(", ")}) NO se calculan: criterio #4, en disputa, sin lotes de divisa. Cambios de divisa del ejercicio: ${((d.fx_exchanges as string[] | undefined) ?? []).join(", ") || "ninguno"}.`;
    case "tax_in_kind_income_not_integrated":
      return `Renta en especie registrada (${text(d.income_eur)} EUR, base ${text(d.base) === "general" ? "general" : "del ahorro"}) y NO integrada: el criterio vigente (#8) no declara nada al recibirla.`;
    case "tax_window_open":
      return `La pérdida de ${text(d.asset_id)} (${text(d.loss_eur)} EUR) es PROVISIONAL: su ventana de recompra sigue abierta hasta el ${text(d.window_end)} y una compra antes de esa fecha la diferiría.`;
    case "tax_neutrality_contradiction":
      return `El evento corporativo (${text(d.kind)}) dice que NO se acoge al régimen de neutralidad y aun así se registró conservando fecha y coste: si no hay régimen, es una permuta sujeta y falta su ganancia.`;
    case "tax_loss_expires":
      return `CADUCA al cierre de este ejercicio un saldo negativo de ${text(d.origin_year)} (${text(d.category) === "capital_gain" ? "ganancias y pérdidas patrimoniales" : "rendimientos del capital mobiliario"}) de ${text(d.amount_eur)} EUR que no ha podido compensarse.`;
    case "tax_release_category_differs":
      return `Se liberan aquí ${text(d.amount_eur)} EUR diferidos de una pérdida de la otra categoría de renta: se integran donde nació la pérdida.`;
    case "tax_duplicate_isin":
      return `El ISIN ${text(d.isin)} lo comparten ${((d.assets as string[] | undefined) ?? []).join(", ")}: para Hacienda son el mismo valor, y la regla de recompra y el FIFO de este informe los tratan como distintos. Sus cifras pueden estar mal: registra ese valor en un solo activo (\`atlas check\`).`;
    case "tax_settings_default_used":
      return `Parámetros fiscales que no están en el libro y se han tomado del código (ADR-0022): ${((d.fields as string[] | undefined) ?? []).join(", ")}. El próximo \`atlas settings set\` los dejará fijados.`;
    case "tax_boxes_missing_year":
      return `Las casillas de ${text(d.year)} no están comprobadas en un formulario oficial: los importes salen por conceptos, sin número de casilla. Nunca se usa la casilla de otro ejercicio.`;
    case "tax_box_missing":
      return `Sin casilla en el formulario de ${text(d.year)}: ${listOf(d.concepts)}. Esos importes salen por concepto y sin número.`;
    case "tax_box_value_missing":
      return `Falta en tus datos lo que piden estas casillas: ${listOf(d.boxes)}. El libro no guarda el NIF de un tercero y aquí no se inventa ninguno.`;
    case "tax_box_partial":
      return `${PARTIAL_BOX[text(d.reason)] ?? warning.message} (casillas ${listOf(d.boxes)}).`;
    case "tax_box_rounding_differs":
      return `El formulario redondea cada valor y hace él mismo la resta: en ${listOf(d.boxes)} sale un céntimo distinto del que calcula el motor. Se enseñan los dos.`;
    case "tax_box_repurchase_has_no_number":
      return "La parte de una pérdida que no es computable por recompra se marca en la ventana de captura de Renta WEB: no tiene casilla con número.";
    case "informative_current_year":
      return `El modelo va de lo que hay a 31/12 y ese día no ha llegado: esto es el estado a ${text(d.as_of)}, sin veredicto.`;
    case "informative_model_did_not_exist":
      return `El modelo ${text(d.model)} no existía en ${text(d.year)}: no hay nada que presentar por ese ejercicio (existe desde ${text(d.first_year)}).`;
    case "informative_domestic_accounts_left_out":
      return `Quedan fuera las cuentas registradas en España (${listOf(d.accounts)}) aunque lo que tengan sea extranjero: ante el registro el titular es la comercializadora (business-rules.md §5.8).`;
    case "informative_account_changed_country":
      return `Alguna cuenta ha cambiado de país (${listOf(d.accounts)}): cuenta el país que tenía a 31/12, tomado del día en que se registró cada cambio.`;
    case "informative_crypto_custody_unknown":
      return "Se cuenta todo lo que hay en cuentas extranjeras; si alguna es de autocustodia, no entraría. El libro no distingue las dos cosas.";
    case "informative_criteria_not_numbered":
      return "El método del saldo medio del trimestre y la clasificación de ETF, ETC y ETP se apoyan en criterios que la dirección todavía no ha numerado (fichas F3 y F4).";
    case "thesis_closed_with_position":
      return `La tesis ${text(d.thesis_id)} está cerrada pero ${text(d.account_id)} sigue teniendo ${text(d.asset_id)} (${text(d.position)}).`;
    default:
      return warning.message;
  }
};

/** A list of codes or box numbers, as the message prints them. */
const listOf = (value: unknown): string =>
  ((Array.isArray(value) ? value : [value]) as unknown[]).map((entry) => text(entry)).join(", ");

/** Why a box of the return is not the whole of what the form will hold. */
const PARTIAL_BOX: Record<string, string> = {
  reductions_unknown:
    "La base liquidable resta dos remanentes de reducciones que no están en el libro: se da la base imponible y no el importe de la casilla",
  treaty_limit_only:
    "La deducción por doble imposición es la menor de dos límites y el motor solo conoce el primero: se da ese, nunca como importe de la casilla",
  ledger_withholdings_only:
    "Solo se cuentan las retenciones que constan en el libro, que no tienen por qué ser todas",
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
