// What a warning of the domain says to the person, in Spanish.

import type { Warning } from "@atlas/domain";
import { text } from "./format.js";

/** Why a quote has no value in euros. */
export const fxMissingText = (reason: unknown): string => {
  switch (reason) {
    case "not_yet_published":
      return "el BCE aún no ha publicado el tipo de esa fecha";
    case "currency_not_published":
      return "el BCE no publica esa divisa; una subunidad como GBX no es su divisa";
    case "currency_stale":
      return "el BCE dejó de publicar esa divisa";
    default:
      return "no hay histórico del BCE; descárgalo con «atlas fx update»";
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
      return d.source === "ecb"
        ? `El tipo de cambio aplicado a ${text(d.currency)} es el del histórico del BCE del ${text(d.date)}, de hace ${text(d.age_days)} días; actualízalo con \`atlas fx update\`.`
        : `El tipo de cambio aplicado a ${text(d.currency)} es de ${text(d.age_days)} días atrás (${text(d.date)}); registra una operación o una valoración más reciente en esa divisa.`;
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
    case "weights_use_approximation":
      return `Los pesos de ${(d.assets as string[]).join(", ")} se apoyan en una aproximación por su ETF de referencia, no en un valor liquidativo: el reparto de la aportación depende de una estimación.`;
    case "price_without_eur_value":
      return `${text(d.asset_id)}: la cotización en ${text(d.currency)} del ${text(d.date)} no tiene tipo del BCE (${fxMissingText(d.reason)}); se enseña en su divisa y falta su valor en euros, así que no suma en ningún total.`;
    case "stale_price":
      return `${text(d.asset_id)}: el precio es de ${text(d.age_days)} días atrás (${text(d.date)}); registra una valoración más reciente.`;
    case "currency_mismatch":
      return `El evento está en ${text(d.currency)} y el activo ${text(d.asset_id)} está en ${text(d.asset_currency)}.`;
    case "fx_rate_date_after_fiscal_date":
      return `fx_rate_date (${text(d.fx_rate_date)}) es posterior a la fecha fiscal (${text(d.fiscal_date)}).`;
    case "same_asset_two_accounts":
      return `El activo ${text(d.asset_id)} está ahora en ${(d.accounts as string[]).length} cuentas; el FIFO sigue siendo global.`;
    case "transfer_not_between_funds":
      return `Un traspaso entre ${text(d.from_asset_id)} y ${text(d.to_asset_id)} no difiere impuestos: ${text(d.asset_id)} no es un fondo. Hacienda lo trata como una venta y una compra; regístralo así (transfer_not_between_funds).`;
    case "transfer_not_resident":
      return `Un traspaso se registró con tax_residence ${text(d.tax_residence)}: sin residencia en España no hay diferimiento; regístralo como venta y compra (transfer_not_resident).`;
    case "transferable_not_fund":
      return `El activo ${text(d.asset_id)} es de tipo ${text(d.asset_type)} y está marcado como traspasable: el diferimiento solo existe entre fondos, así que esa marca no tiene efecto.`;
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
    case "tax_crypto_custody_not_deductible":
      return `No se deduce la custodia de cripto en tenencia directa (${((d.fees as string[] | undefined) ?? []).join(", ")}): la cripto no es un valor negociable (art. 26.1.a LIRPF, DGT V0648-24).`;
    case "tax_currency_withdrawn":
      return `Se ha sacado divisa de una cuenta (${listOf(d.events)}): sale a su coste y no imputa nada; lo que se haga con ella fuera no está en el libro.`;
    case "tax_currency_spent_without_lots":
      return `Se ha gastado divisa sin tenerla (${listOf(d.currencies)}; ${listOf(d.events)}): se valora al tipo del BCE de ese día hasta que una entrada posterior la cubra, y entonces se imputa la diferencia (criterio #4).`;
    case "tax_currency_mixed_lots":
      return `Hay lotes comprados en otra divisa que la de la venta (${listOf(d.events)}): se calculan con el tipo de cada día, y la diferencia de cambio de la divisa gastada en ellos se imputa en la venta (criterio #4:mixed_currency).`;
    case "tax_in_kind_income_not_integrated":
      return `Renta en especie registrada (${text(d.income_eur)} EUR, base ${text(d.base) === "general" ? "general" : "del ahorro"}) y NO integrada: el criterio vigente (#8) no declara nada al recibirla.`;
    case "tax_fx_rate_finding":
      return `Esta línea depende de un tipo del BCE que no es el oficial de su fecha (${(d.codes as string[]).join(", ")}; eventos ${(d.events as string[]).join(", ")}). La cifra se calcula con el tipo del libro; si está mal, corrígelo anulando y registrando de nuevo (criterio 25), y compruébalo antes de declarar.`;
    case "tax_fx_rate_unverified":
      return `Esta línea depende de un tipo del BCE que el histórico no ha podido contrastar (${(d.codes as string[]).join(", ")}; eventos ${(d.events as string[]).join(", ")}): no se dice si es bueno ni malo. La cifra se calcula con el tipo del libro (criterio 25).`;
    case "tax_fx_rate_date_after_fiscal_date":
      return `Esta línea depende de un tipo del BCE fechado después de su fecha fiscal (eventos ${(d.events as string[]).join(", ")}). La cifra se calcula con el tipo del libro; el aplicable es el último publicado en o antes de la fecha fiscal (criterio 25).`;
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
    case "informative_not_resident":
      return `Sin obligación: el Modelo ${text(d.model)} solo obliga a los residentes fiscales en España, y la residencia de ${text(d.year)} es ${text(d.tax_residence)} (arts. 42 bis, 42 ter y 42 quater RGAT).`;
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
