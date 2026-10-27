// User-facing messages in Spanish, derived from domain error codes.

import type { DependentEventsError, DomainError, DuplicateFingerprintError } from "@atlas/domain";
import { text } from "./format.js";
import { table } from "./table.js";

/**
 * The safe way out of a ledger with Windows line endings: `compact` does not normalise, so the
 * message gives the exact order, with nothing but the Node the console already runs on. It copies
 * the file first, refusing to overwrite a copy, and only then rewrites `\r\n` as `\n`. Exported so
 * that a test runs it for real.
 */
export const RAW_LINE_BREAK_FIX = `node -e "const fs=require('fs'),f='ledger.jsonl';fs.copyFileSync(f,f+'.crlf',fs.constants.COPYFILE_EXCL);fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\\r\\n/g,'\\n'))"`;

/**
 * Why the cloud refused a line (`docs/api.md` §5.2): what the person does about it. Said after the
 * code in `remote_rejected`, which carries these details.
 */
const describeRejection = (
  code: unknown,
  d: Readonly<Record<string, unknown>>,
): string | undefined => {
  switch (code) {
    case "domain_rejected":
      return `Sobre lo que ya hay en la nube, el libro la rechaza (${text(d.domain_code)}${d.affected === undefined ? "" : `; dejaría inválidos ${text(d.affected)}`}). Rehazla sobre el estado actual.`;
    case "pair_rejected":
      return `Corrección rechazada entera (anulación y operación corregida, juntas): sobre lo que ya hay en la nube no cabe (${text(d.member)}: ${text(d.member_code)}${d.affected === undefined ? "" : `; dejaría inválidos ${text(d.affected)}`}). Ninguna de las dos se ha subido. Rehazla.`;
    case "pair_not_contiguous":
      return "La operación corregida no va justo detrás de su anulación, que es como la aplicación las escribe siempre. Rehaz la corrección.";
    case "pair_incomplete":
      return "La nube ha rechazado una anulación que anunciaba su corrección y no la traía detrás: se sube siempre la pareja entera.";
    case "pair_declaration_invalid":
      return "La nube ha rechazado la petición: una línea declaraba ser una anulación con corrección, o parte de una cadena, sin serlo.";
    case "line_unreadable":
      return `La nube no ha podido leer una línea${d.line === undefined ? "" : ` (la ${text(d.line)})`}.`;
    case "line_invalid":
      return `La nube ha rechazado una línea por su forma (${text(d.domain_code)}).`;
    case "schema_version_unsupported":
      return `La nube no conoce todavía el formato ${text(d.found)} de esta línea (entiende hasta el ${text(d.supported)}). Espera a que la nube se actualice.`;
    case "recorded_at_in_future":
      return `Su fecha de registro (${text(d.recorded_at)}) va por delante del reloj de la nube. Revisa la hora de este dispositivo y rehaz la operación.`;
    case "duplicate_unconfirmed":
      return `La nube pide confirmar una operación que repite la huella de otra (${text(d.existing ?? d.id)}). Confírmala si de verdad son dos.`;
    case "seal_mismatch":
      return "La declaración ya no cuadra con los movimientos que tendría delante en la nube. Regístrala otra vez sobre el libro actual.";
    case "waiver_not_appendable":
      return "Una renuncia a verificar una huella solo nace dentro de una compactación, y nunca se sube línea a línea.";
    default:
      return undefined;
  }
};

/** What each kind of field of the schema has to be, as the person would say it. */
const FIELD_KINDS: Readonly<Record<string, string>> = {
  string: "un texto que no esté vacío",
  decimal: "un número decimal sin signo (123.45)",
  signed_decimal: "un número decimal (123.45)",
  positive_decimal: "un número decimal mayor que cero (123.45)",
  negative_decimal: "un número decimal negativo",
  non_positive_decimal: "un número decimal cero o negativo",
  non_negative_integer: "un entero no negativo",
  positive_integer: "un entero mayor que cero",
  date: "una fecha AAAA-MM-DD",
  currency: "un código de divisa de tres letras (EUR)",
  country: "un país de dos letras (ES)",
  ratio: "un ratio (4, 0.25 o 4/3)",
  unit_interval: "un número entre 0 y 1",
  boolean: "verdadero o falso",
};

/** The rules of the schema that have no code of their own, said without the English of the domain. */
const describeInvalidField = (error: DomainError): string => {
  const d = error.details;
  const where = `El campo ${text(d.field ?? d.fields)} de ${text(d.type)} no es válido`;
  const kind = /is not a valid (\w+)$/.exec(error.message)?.[1];
  if (kind !== undefined) {
    const received = d.value === undefined ? "" : ` (recibido: ${text(d.value)})`;
    return `${where}: tiene que ser ${FIELD_KINDS[kind] ?? kind}${received}.`;
  }
  const exactlyOne = /exactly one of (\w+) or (\w+) is required/.exec(error.message);
  if (exactlyOne !== null) {
    return `Hace falta exactamente uno de ${exactlyOne[1]} o ${exactlyOne[2]} en ${text(d.type)}: ni los dos ni ninguno.`;
  }
  if (error.message.includes("an asset cannot be swapped for itself")) {
    return "Una permuta no puede cambiar un activo por sí mismo.";
  }
  if (error.message.includes("value_date must not precede trade_date")) {
    return "La fecha valor no puede ser anterior a la fecha de la operación.";
  }
  if (error.message.includes("sold_currency and bought_currency must differ")) {
    return "Las divisas vendida y comprada han de ser distintas.";
  }
  return `${where}: ${error.message}.`;
};

export const describeError = (error: DomainError): string => {
  const d = error.details;
  switch (error.code) {
    case "unknown_account":
      return `La cuenta ${text(d.account_id)} no existe.`;
    case "unknown_asset":
      return `El activo ${text(d.asset_id)} no existe.`;
    // --- Corporate actions composed from parameters ----------
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
        : `El activo ${text(d.asset_id)} no es traspasable (not_transferable): el diferimiento solo existe entre fondos de inversión; registra una venta y una compra.`;
    case "transfer_not_resident":
      return `La residencia fiscal es ${text(d.tax_residence)}: el diferimiento del traspaso solo existe para residentes en España (transfer_not_resident).`;
    case "not_core_asset":
      return `El activo ${text(d.asset_id)} no pertenece al núcleo: el simulador de traspaso solo opera sobre la cartera principal.`;
    case "missing_manual_prices":
      return `Faltan precios en euros a ${text(d.date)}: ${(d.assets as string[]).join(", ")}. Registra una valoración (\`atlas add valuation --asset <id> --date ${text(d.date)} …\`), o, si tienen una cotización en otra divisa, descarga el histórico del BCE con \`atlas fx update\`.`;
    case "missing_target_weights":
      return "No hay pesos objetivo configurados: fíjalos con `atlas settings set --target-weights ast_x=60,ast_y=40` (target_weights).";
    case "missing_bucket_pct":
      return "Falta el porcentaje del cubo: `atlas settings set --bucket-pct-of-contribution 10` (bucket_pct_of_contribution).";
    case "missing_deviation_threshold":
      return "Falta el umbral de desviación: `atlas settings set --deviation-threshold-pp 5` (deviation_threshold_pp).";
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
      // Spanish.
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
    case "remote_rejected": {
      const why = describeRejection(d.remote_code, d);
      return `La API ha rechazado la escritura (${text(d.remote_code)}${
        d.domain_code === undefined ? "" : `, ${text(d.domain_code)}`
      }): ${
        d.accepted === 0
          ? "no se ha escrito nada"
          : `se han escrito ${Math.floor(Number(d.accepted) || 0)} líneas y el resto no; mira el libro antes de repetir: lo ya escrito está y repetir la operación desde cero lo duplicaría`
      }.${why === undefined ? "" : ` ${why}`}`;
    }
    case "write_outcome_unknown":
      return "La conexión se cortó al guardar y no se sabe si la operación quedó registrada: cuando vuelva la conexión, comprueba el libro antes de repetirla.";
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
    // What a synced folder or browser refuses.
    case "forget_device_missing":
      return "Ese dispositivo no existe en sync/devices/: los enseña «atlas admin devices».";
    case "forget_device_unreadable":
      return "El objeto de ese dispositivo no se puede leer: no se ha tocado. Revísalo a mano en sync/devices/.";
    case "forget_contention":
      return "El objeto del dispositivo ha cambiado tres veces mientras se olvidaba: repite la orden.";
    case "admin_config_missing":
      return `No existe ${text(d.path)}: escríbelo con la región, el bucket de datos y el prefijo de SSM de cada entorno (runbook «Revocar todos los tokens»).`;
    case "admin_config_unreadable":
      return `${text(d.path)} no se puede leer: tiene que llevar admin_format 1 y, por entorno, solo region, data_bucket y ssm_prefix.`;
    case "admin_environment_unknown":
      return `${text(d.path)} no tiene el entorno ${text(d.environment)}.`;
    case "admin_remote_unavailable":
      return "AWS no responde ahora (el bucket de datos o SSM): no se ha escrito nada que no se diga. Repite dentro de un rato.";
    case "admin_aws_refused":
      return `AWS ha rechazado la orden (${text(d.name)}): la consola usa una sesión ya abierta del rol de administración del entorno, con MFA («aws sso login», o «aws configure export-credentials» tras el código), como dice el procedimiento «Revocar todos los tokens».`;
    case "admin_secret_invalid":
      return `El valor de ${text(d.parameter)} no vale (${text(d.reason)}): no se ha escrito. No se enseña el valor.`;
    case "admin_secret_tags_missing":
      return `${text(d.parameter)}: el valor SÍ se ha cambiado, pero no se han podido escribir las etiquetas (project, env, managed_by). Repite la orden para ese parámetro (sobrescribirlo vuelve a etiquetarlo) o etiquétalo a mano; los parámetros siguientes no se han tocado.`;
    case "admin_secret_write_failed":
      return `No se ha podido escribir ${text(d.parameter)}. Comprueba qué parámetros quedaron con «atlas admin secrets» otra vez: salta los que ya están si no se escribe nada.`;
    case "symbols_push_missing":
      return "No hay prices/symbols.json en la carpeta: declara antes los símbolos con «atlas prices symbols set».";
    case "symbols_push_misstored":
      return `No se sube: prices/symbols.json aún tiene cierres guardados en otra divisa (${text(d.assets)}). Púrgalos antes en local con «atlas prices purge».`;
    case "symbols_push_remote_newer":
      return `No se sube: el prices/symbols.json de la nube es de una versión más nueva de la aplicación (formato ${text(d.format)}), y esta consola no lo sobrescribe. Actualiza la aplicación.`;
    case "symbols_push_conflict":
      return "El prices/symbols.json de la nube ha cambiado mientras se comparaba: no se ha escrito nada. Repite la orden para ver la diferencia nueva.";
    case "restore_source_missing":
      return `No se encuentra la copia ${text(d.from)}.`;
    case "restore_candidate_invalid":
      return `La copia no pasa la comprobación (eventos inválidos: ${text(d.invalid)}; errores de la verificación a fondo: ${text(d.findings)}): no se ha tocado la nube.`;
    case "init_refused_invalid_ledger":
      return `No se sube el libro a la nube: tiene operaciones inválidas (${text(d.invalid)}), y la nube nunca recibe un libro inválido. Repáralas primero (atlas check te las enseña).`;
    case "accept_invalid_while_synced":
      return `Ese cambio de configuración dejaría inválidos ${Array.isArray(d.affected) ? d.affected.length : 0} eventos, y --accept-invalid solo vale en una carpeta local sin nube ni sincronización (ADR-0035): la nube rechaza siempre un libro inválido. Repara antes esos eventos (atlas check te los enseña).`;
    case "folder_mode_ambiguous":
      return `Esta carpeta tiene a la vez un libro local (${text(d.ledger)}) y la identidad de una nube (sync/remote.json, ${text(d.origin)}): no se sabe cuál es la verdad y no se ha leído ni escrito nada. Una carpeta es de nube (sync/remote.json y sin ledger.jsonl) o local (ledger.jsonl y sin sync/remote.json), nunca las dos. Si su libro es el de la nube: guarda una copia de ledger.jsonl fuera de la carpeta, comprueba con «atlas backup --to <directorio>» que la nube la tiene, y quita ledger.jsonl de aquí. Si es local: quita sync/remote.json (y el resto de sync/). Nada se sincroniza entre los dos.`;
    case "compact_cloud_folder":
      return "Esta carpeta es de nube: no tiene libro que compactar aquí. Compactar el libro de la nube es «atlas admin compact --env <entorno>», con el rol de administración (ADR-0032).";
    case "ledger_in_cloud_folder":
      return `No se escribe un ledger.jsonl en una carpeta de nube (${text(d.path)}, nube ${text(d.origin)}): sería la carpeta ambigua de ADR-0035, que la consola se niega a abrir. Escríbelo en otra carpeta o con otro nombre.`;
    case "upload_needs_cloud_folder":
      return "La subida inicial se hace desde una carpeta de nube: inicia sesión en una carpeta sin libro con «atlas remote login --origin <https://…>» y repite «atlas remote upload --from <ledger.jsonl>» desde ella.";
    case "upload_cloud_not_empty":
      return `La nube ya tiene un libro (${typeof d.cloud_lines === "number" ? d.cloud_lines : 0} líneas) que no es este: la subida inicial nunca escribe encima. Para sustituirlo está «atlas admin restore --from <copia> --env <entorno>» (ADR-0032), que compara por identificador y pide confirmar.`;
    case "upload_source_missing":
      return `No existe el fichero ${text(d.path)}.`;
    case "upload_source_not_utf8":
      return `El fichero ${text(d.path)} no es UTF-8: no es un libro de Atlas.`;
    case "login_timeout":
      return "El inicio de sesión no ha vuelto a tiempo: no se ha guardado ninguna sesión. Repite «atlas remote login» y completa el paso del navegador, o usa --manual.";
    case "login_interrupted":
      return "Se ha cancelado el inicio de sesión: no se ha guardado ninguna sesión.";
    case "login_no_code":
      return "No ha llegado el código de la página (la entrada se cerró antes de recibirlo): no se ha guardado ninguna sesión. Repite «atlas remote login --manual» desde una terminal.";
    case "raw_lone_surrogate":
      return `La línea ${text(d.line)} lleva un carácter que no es Unicode (un suplente suelto): sus bytes no serían UTF-8 y el libro no se podría leer. No se ha escrito nada; esa línea no la escribe la aplicación.`;
    case "raw_line_break":
      return `La línea ${text(d.line)} lleva dentro un salto de línea o un retorno de carro (\\r): el libro tiene finales de línea de Windows, que solo deja una edición a mano. Así no se escribe tal cual, y atlas no lo arregla solo. Conviértelo a finales LF desde la carpeta del libro, con una copia previa en ledger.jsonl.crlf (se niega si ya existe): ${RAW_LINE_BREAK_FIX}.`;
    case "archive_exists":
      return `El archivo ${text(d.archive_name)} ya existe y nunca se sobrescribe.`;
    case "ledger_missing":
      return `No hay libro en ${text(d.path)}: nada que copiar.`;
    case "backup_mismatch":
      return `La copia ${text(d.path)} no coincide con el libro (etag o número de líneas): bórrala y repite.`;
    case "path_exists":
      return `La ruta ${text(d.path)} ya existe: no se sobrescribe nada.`;
    case "not_a_directory":
      return `La ruta ${text(d.path)} existe y no es una carpeta: indica la carpeta donde dejar la copia.`;
    case "export_over_ledger":
      return `La ruta ${text(d.path)} es el propio libro: la exportación nunca lo sustituye. Elige otra ruta.`;
    case "export_in_ledger_folder":
      return `La ruta ${text(d.path)} es un fichero de la carpeta del libro: la exportación nunca lo sustituye. Elige otra ruta.`;
    case "prompt_interrupted":
      return "Interrumpido: no se ha escrito nada de lo que quedaba por preguntar.";
    case "synthetic_invalid":
      return `El libro generado no supera la verificación (${text(d.invalid)}, ${text(d.findings)}): es un error del generador.`;
    case "missing_basis":
      return `Falta la base de la operación ${text(d.type ?? "")}: indica --amount o --unit-price.`;
    case "invalid_local_config":
      return `La configuración local atlas.config.json de la carpeta del libro no se entiende${d.field === undefined ? "" : ` (${text(d.field)})`}: corrígela o bórrala para volver a los valores por defecto.`;
    case "invalid_price_config":
      return `La configuración de precios prices/config.json no se entiende (${text(d.field)}): corrígela o bórrala para volver a los valores por defecto. La aplicación nunca la escribe.`;
    case "invalid_price_status":
      return `El estado de las fuentes de precios prices/_status.json no se entiende (${text(d.field)}): no se descarga nada hasta arreglarlo, porque dice lo gastado hoy de cada cupo.`;
    case "invalid_symbols_file":
      return `La correspondencia de símbolos prices/symbols.json no se entiende (${text(d.field)}): corrígela, o vuelve a declarar los símbolos con «atlas prices symbols set».`;
    case "symbols_file_newer_version":
      return `La correspondencia de símbolos prices/symbols.json es de una versión más nueva de la aplicación (formato ${text(d.format)}): esta consola no la lee ni la escribe. Actualiza la aplicación.`;
    case "invalid_cloud_pull":
      return `prices/_cloud.json, lo que la carpeta guarda de su última descarga de la nube, no se entiende (${text(d.field)}): bórralo y vuelve a ejecutar «atlas prices update», que lo rehace sin tocar ningún cierre.`;
    case "json_key_repeated":
      return `${text(d.file)}${d.line === undefined ? "" : `, línea ${text(d.line)},`} repite la clave ${text(d.key)}: dice dos cosas a la vez y no se lee. Quita una de las dos; la aplicación nunca escribe una clave dos veces.`;
    case "symbols_file_unknown_key":
      return `La correspondencia de símbolos prices/symbols.json tiene una clave de primer nivel que no es suya (${text(d.key)}): quítala del fichero. Solo lleva symbols_format y assets; nunca se sube ni se lee con otra cosa.`;
    case "symbols_misstored_pending":
      return `${text(d.asset_id)} tiene cierres de ${text(d.source)} guardados en una divisa equivocada, pendientes de purgar: mientras tanto no se puede quitar esa fuente ni el activo, porque volverían a contar en euros sin aviso. Púrgalos con «atlas prices purge ${text(d.asset_id)} --source ${text(d.source)}».`;
    case "symbols_not_declared":
      return `${text(d.asset_id)} no tiene símbolo declarado para ${text(d.source)}: no hay con qué comparar sus cierres. Declara antes su símbolo y su divisa con «atlas prices symbols set».`;
    case "price_file_newer_version":
      return `prices/${text(d.asset_id)}.jsonl tiene una línea de una versión más nueva que esta aplicación (línea ${text(d.line)}): ese activo se queda sin precio automático y no se añade nada a su fichero. Actualiza la aplicación.`;
    case "price_line_invalid":
      return `prices/${text(d.asset_id)}.jsonl, línea ${text(d.line)}: no se entiende (${text(d.field)}). Ese activo se queda sin precio automático; nunca se lee a medias.`;
    case "second_live_correction":
      return `${text(d.corrects_id)} ya tiene una corrección en vigor en ese punto del libro (${text(d.live_correction_id)}): una operación anulada solo puede tener una. Anula antes esa corrección, o corrígela a ella (ADR-0026).`;
    case "broker_settled_eur_in_eur":
      return "--broker-settled-eur solo se indica en una operación en otra divisa: en euros repetiría el importe.";
    case "broker_settled_eur_negative":
      return "--broker-settled-eur nunca es negativo: el sentido lo da el tipo de operación. Indica lo que movió el bróker, sin signo.";
    case "broker_settled_eur_zero":
      return "--broker-settled-eur no puede ser cero en una compra, una venta o una comisión: si el extracto no da la cifra, no lo indiques (sin él, la cifra queda como desconocida).";
    case "ecb_history_unreadable":
      return `El histórico del BCE no tiene el formato esperado${d.line === undefined ? "" : ` (línea ${text(d.line)})`}: no se ha usado. Vuelve a descargarlo con \`atlas fx update\`.`;
    case "draft_not_needed":
      return "Ningún tipo de esta operación está esperando al BCE: regístrala como siempre, sin --draft.";
    case "draft_changed":
      return d.now === "gone"
        ? "Ese borrador ya no está en drafts/: se ha confirmado o descartado desde otra orden. No se ha registrado nada; consulta `atlas draft list` y el libro."
        : "Ese borrador se está confirmando desde otra orden (ya lleva el id de su registro): no se ha registrado nada. Espera y consulta `atlas draft list`.";
    case "draft_unreadable":
      return "Un borrador de drafts/ no tiene el formato esperado: no se ha tocado. Revísalo a mano; puede ser la única copia de una operación.";
    case "ecb_history_empty":
      return "El histórico del BCE no trae ninguna publicación: no se ha usado. Vuelve a descargarlo con `atlas fx update`.";
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
    case "duplicate_key":
      // An annulment cannot be annulled: its only remedy is the file itself.
      return d.type === "reversal"
        ? "Una anulación del libro repite un campo (lo deja así una edición a mano): cuenta como inválida, no anula nada y la nube no la acepta. Una anulación no se puede anular: corrígela a mano en el fichero, quitando el campo repetido."
        : "Una línea del libro repite un campo (lo deja así una edición a mano): se lee con el último valor, pero el evento cuenta como inválido y la nube no lo acepta. Anúlala (atlas delete) y registra el evento correcto.";
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
      return describeInvalidField(error);
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

export const describeDependants = (
  error: DependentEventsError,
  /** False in a cloud folder: the cloud never accepts an invalid ledger (ADR-0035). */
  canAcceptInvalid = true,
): string => {
  const isSettings = error.code === "newly_invalid_events";
  const heading = isSettings
    ? "Eventos que pasan a ser inválidos con la configuración nueva:"
    : "Eventos que dejarían de ser válidos (rectifícalos primero):";
  const footer = isSettings
    ? canAcceptInvalid
      ? "\nLos hechos no cambian, cambia su interpretación (ADR-0015). Repite con --accept-invalid si es lo que quieres."
      : "\nLos hechos no cambian, cambia su interpretación (ADR-0015). En una carpeta de nube no se puede aceptar un libro inválido: repara antes esos eventos."
    : "";
  return `${describeError(error)}\n${heading}\n${table(
    ["id", "tipo", "motivo"],
    error.affected.map((entry) => [entry.id, entry.type, entry.error]),
  )}${footer}`;
};

export const priorYearWarning =
  "Aviso: el evento rectificado pertenece a un ejercicio anterior; puede afectar a una declaración ya presentada.";
