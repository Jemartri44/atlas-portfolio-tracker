// Warnings of the tax report, the boxes of the return and the informative returns (720/721).

import { TREATY_RATE_SUGGESTIONS } from "../settings/defaults.js";
import type { Details, Entry, Say, Voice } from "./voice.js";
import { year } from "./words.js";

/** «1 cuenta», «3 cuentas»: the number is the length of a list, never a figure. */
const counted = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const listOf = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === undefined ? [] : [value];

/** The items of a detail as plain text, comma separated. */
const texts = (v: Voice, value: unknown): string =>
  listOf(value)
    .map((item) => v.text(item))
    .join(", ");

/** Why a box of the return is not the whole of what the form will hold. */
const PARTIAL_BOX: Record<string, string> = {
  reductions_unknown:
    "La base liquidable resta dos remanentes de reducciones que no están en tus datos: te damos la base imponible, no el importe de la casilla",
  treaty_limit_only:
    "La deducción por doble imposición es la menor de dos límites y solo conocemos el primero: te damos ese, no el importe de la casilla",
  ledger_withholdings_only:
    "Solo contamos las retenciones que constan en tus datos, que no tienen por qué ser todas",
};

/**
 * The suggested treaty rate with the article it comes from. The source is read from the table of
 * the domain by country, not echoed from the note: a citation is a fixed text.
 */
const treatySuggestion = (d: Details, v: Voice): string => {
  if (d.suggested_pct === undefined) {
    return "";
  }
  const source = TREATY_RATE_SUGGESTIONS.get(v.text(d.country))?.source;
  return ` Sugerencia para dividendos de una persona física: ${v.pct(d.suggested_pct)}${source === undefined ? "" : ` (${source})`}; compruébalo antes de fijarlo.`;
};

/** What only the console adds: the events a line is about. */
const eventsRemedy =
  (prefix: string, suffix = ""): Say =>
  (d, v) =>
    `${prefix}${texts(v, d.events)}${suffix}`;

/** The «tipo del BCE» notes: the currencies and events they are about. */
const rateRemedy =
  (reference: string): Say =>
  (d, v) =>
    `(${d.codes === undefined ? "" : `${texts(v, d.codes)}; `}eventos ${texts(v, d.events)}) ${reference}`;

const FX_FINDING_CORRECTION =
  "La cifra se calcula con el tipo de tus datos; si está mal, corrige el movimiento (anular y registrar de nuevo) y compruébalo antes de declarar.";

export const WARNINGS_TAX: Record<string, Entry> = {
  cost_adjustment_currency_mismatch: {
    say: (d, v) =>
      `El dinero en ${v.text(d.currency)} rebaja compras de ${v.one(d.asset_id)} hechas en ${v.text(d.lot_currency)}: Atlas lo reparte en proporción al coste en euros, lo que equivale a convertirlo al tipo de la compra, y ninguna fuente dice qué tipo de cambio usar. Es un criterio abierto.`,
    cli: () => "(fiscal-questions.md #13)",
  },
  capital_return_partial_accounts: (d, v) =>
    `La devolución no da importe a todas las cuentas que tienen ${v.one(d.asset_id)} (faltan: ${v.many(d.accounts)}): como el FIFO es global, el dinero rebaja también los lotes de esas cuentas. Revisa si falta alguna.`,
  tax_quota_not_computed: () =>
    "Esto es la base del ahorro, no la cuota ni lo que se paga: el mínimo personal, la base general y el tipo medio efectivo no están en tus datos.",
  tax_filing_prefix_unverified: (d) =>
    `La huella de la declaración presentada no cubre los movimientos que tiene delante${d.reason === "waived" ? " y la diste por no verificable" : ""}: la diferencia con lo declarado no se reparte en sus cuatro causas.`,
  tax_double_taxation_partial: () =>
    "Doble imposición: solo se calcula el primer límite, el del convenio (impuesto extranjero limitado al tipo del convenio). El segundo, el tipo medio efectivo, exige la declaración entera; y lo que no se deduce se pierde, no hay arrastre.",
  tax_treaty_rate_missing: {
    say: (d, v) =>
      `No hay tipo de convenio configurado para ${v.text(d.country)}: no se calcula deducción por los ${v.money(d.foreign_tax_eur)} retenidos.${treatySuggestion(d, v)}`,
    cli: (d, v) =>
      `Fíjalo con \`atlas settings set --treaty-withholding-pct ${v.text(d.country)}=<tipo>\`.`,
  },
  tax_dividend_without_country: (d, v) =>
    `El dividendo no dice qué país lo pagó (${v.field("source_country")}): no se calcula deducción por los ${v.money(d.foreign_tax_eur)} retenidos en origen.`,
  tax_crypto_custody_not_deductible: {
    say: () =>
      "No se resta la custodia de las cuentas con solo cripto en tenencia directa: la cripto no es un valor negociable, y solo se deduce el depósito de valores negociables.",
    cli: (d, v) =>
      `${Array.isArray(d.fees) ? `Comisiones: ${texts(v, d.fees)}. ` : ""}Art. 26.1.a LIRPF, DGT V0648-24.`,
  },
  tax_currency_withdrawn: {
    say: () =>
      "Has sacado divisa de una cuenta: sale a lo que te costó y no imputa nada. Lo que hagas con ella fuera no está en tus datos.",
    cli: eventsRemedy("Eventos: ", "."),
  },
  tax_currency_spent_without_lots: {
    say: (d, v) =>
      `Has gastado ${texts(v, d.currencies)} sin tenerlos en la cuenta: se valoran al tipo del BCE de ese día hasta que entren, y entonces se imputa la diferencia.`,
    cli: eventsRemedy("Eventos: ", ". Criterio #4."),
  },
  tax_currency_mixed_lots: {
    say: () =>
      "Hay lotes comprados en una divisa y vendidos en otra: se calculan con el tipo de cada día, y la diferencia de cambio de lo que se gastó en ellos se imputa en la venta.",
    cli: eventsRemedy("Eventos: ", ". Criterio #4:mixed_currency."),
  },
  tax_in_kind_income_not_integrated: {
    say: (d, v) =>
      `Renta en especie registrada (${v.money(d.income_eur)}, base ${v.text(d.base) === "general" ? "general" : "del ahorro"}) y no integrada: el criterio vigente no declara nada al recibirla.`,
    cli: () => "Criterio #8.",
  },
  tax_fx_rate_finding: {
    say: () =>
      `Esta línea depende de un tipo del BCE que no es el oficial de su fecha. ${FX_FINDING_CORRECTION}`,
    cli: rateRemedy("Criterio 25."),
  },
  tax_fx_rate_unverified: {
    say: () =>
      "Esta línea depende de un tipo del BCE que el histórico no ha podido contrastar: no se dice si es bueno ni malo. La cifra se calcula con el tipo de tus datos.",
    cli: rateRemedy("Criterio 25."),
  },
  tax_fx_rate_date_after_fiscal_date: {
    say: () =>
      "Esta línea depende de un tipo del BCE fechado después de su fecha fiscal. La cifra se calcula con el tipo de tus datos; el aplicable es el último publicado en o antes de la fecha fiscal.",
    cli: (d, v) => `(eventos ${texts(v, d.events)}) Criterio 25.`,
  },
  tax_window_open: (d, v) =>
    `La pérdida de ${v.one(d.asset_id)} (${v.money(d.loss_eur)}) es provisional: su ventana de recompra sigue abierta hasta el ${v.date(d.window_end)} y una compra antes de esa fecha la diferiría.`,
  tax_neutrality_contradiction: (d, v) =>
    `El evento corporativo (${v.word(d.kind)}) dice que no se acoge al régimen de neutralidad y aun así conserva fecha y coste: si no hay régimen, es una permuta sujeta y falta su ganancia.`,
  tax_loss_expires: (d, v) =>
    `Caduca al cierre del ejercicio un saldo negativo de ${year(v, d.origin_year)} (${v.text(d.category) === "capital_gain" ? "ganancias y pérdidas patrimoniales" : "rendimientos del capital mobiliario"}) de ${v.money(d.amount_eur)} que no ha podido compensarse.`,
  tax_release_category_differs: (d, v) =>
    `Se liberan aquí ${v.money(d.amount_eur)} diferidos de una pérdida de la otra categoría de renta: se integran donde nació la pérdida.`,
  tax_duplicate_isin: {
    say: (d, v) =>
      `El ISIN ${v.text(d.isin)} lo comparten ${v.many(d.assets)}: para Hacienda son el mismo valor, y la regla de recompra y el FIFO de este informe los tratan como distintos. Sus cifras pueden estar mal: registra ese valor en un solo activo.`,
    cli: () => "(`atlas check`)",
  },
  tax_settings_default_used: {
    say: (d, v) =>
      `Hay ${counted(v.count(d.fields), "parámetro fiscal", "parámetros fiscales")} que no están en tus datos y se han tomado del código: ${listOf(
        d.fields,
      )
        .map((field) => v.setting(field))
        .join(", ")}.`,
    cli: () => "El próximo `atlas settings set` los dejará fijados (ADR-0022).",
    web: () => "Guardar la configuración los dejará fijados.",
  },

  // The return laid out by box.
  tax_boxes_missing_year: (d, v) =>
    `Las casillas de ${year(v, d.year)} no están comprobadas en el formulario oficial: te damos los importes por conceptos, sin números de casilla. Nunca usamos la casilla de otro ejercicio.`,
  tax_box_missing: {
    say: (d, v) =>
      `Hay ${counted(v.count(d.concepts), "importe", "importes")} sin casilla en el formulario de ${year(v, d.year)}: van por concepto y sin número.`,
    cli: (d, v) => `Conceptos: ${texts(v, d.concepts)}.`,
  },
  tax_box_value_missing: {
    say: (d, v) =>
      `${counted(v.count(d.boxes), "casilla pide", "casillas piden")} algo que no está en tus datos, como el NIF de una gestora. Lo decimos en vez de inventarlo.`,
    cli: (d, v) => `Casillas: ${texts(v, d.boxes)}.`,
  },
  tax_box_partial: {
    say: (d, v) => `${PARTIAL_BOX[v.text(d.reason)] ?? "Esta casilla no se calcula entera"}.`,
    cli: (d, v) => `(casillas ${texts(v, d.boxes)})`,
  },
  tax_box_section_doubtful: () =>
    "Las acciones de mercados de fuera de la UE (NYSE, Nasdaq…) van a «otros elementos patrimoniales» con la clave 2, como dice la ayuda del Modelo 100; ninguna fuente leída extiende a la declaración la equivalencia de esos mercados, así que el apartado es dudoso.",
  tax_box_market_unknown: {
    say: (d, v) =>
      `Atlas no sabe si estas acciones están admitidas en un mercado regulado de la UE (${v.many(d.assets)}): no tienen mercado anotado, tienen uno que Atlas no conoce, o se compraron en Xetra, Fráncfort, Euronext o BME sin un ISIN de la UE en euros. Se dejan en «acciones negociadas». Compruébalo antes de presentar: si el valor no está admitido en un mercado regulado de la UE (lo normal en una acción de EE. UU. comprada en Xetra), va a «otros elementos patrimoniales» con la clave 2. Si es de la UE, anota su mercado, su ISIN y su divisa y el aviso desaparece; si no lo es, Atlas todavía no tiene cómo marcarlo: teclea esa venta en la clave 2 a mano y el aviso se queda.`,
    cli: () => "`atlas asset update <asset_id> --market <MIC> --isin <ISIN>`.",
    web: () => "Se anota en Catálogo.",
  },
  tax_box_other_inferred: () =>
    "Las diferencias de cambio de la divisa (y un ETC o ETP configurado como ganancia) no tienen apartado propio en el impreso: van a «otros elementos patrimoniales» con la clave 4, que la ayuda del Modelo 100 de 2025 reserva para «cualesquiera otros bienes o derechos no incluidos en los apartados anteriores». El apartado se elige por exclusión: ninguna fuente nombra la divisa.",
  tax_box_repurchase_has_no_number: () =>
    "La parte de una pérdida que no es computable por recompra se marca en la ventana de captura de Renta WEB: no tiene casilla con número.",

  // The informative returns.
  informative_current_year: {
    say: () =>
      "El modelo va de lo que hay a 31 de diciembre y ese día no ha llegado: esto es cómo está hoy, sin veredicto.",
    cli: (d, v) => `(Estado a ${v.date(d.as_of)}.)`,
  },
  informative_not_resident: {
    say: (d, v) =>
      `Sin obligación: el Modelo ${v.num(d.model)} solo obliga a los residentes fiscales en España, y en ${year(v, d.year)} no lo eras (residencia: ${v.text(d.tax_residence)}).`,
    cli: () => "Arts. 42 bis, 42 ter y 42 quater RGAT.",
  },
  informative_model_did_not_exist: (d, v) =>
    `El modelo ${v.num(d.model)} no existía en ${year(v, d.year)}: no hay nada que presentar por ese ejercicio (existe desde ${year(v, d.first_year)}).`,
  informative_domestic_accounts_left_out: {
    say: (d, v) => {
      const n = v.count(d.accounts);
      return `${n === 1 ? "1 cuenta registrada en España queda fuera" : `${n} cuentas registradas en España quedan fuera`} (${v.many(d.accounts)}) aunque lo que tenga sea extranjero: ante el registro el titular es la comercializadora.`;
    },
    cli: () => "(business-rules.md §5.8)",
  },
  informative_account_changed_country: (d, v) => {
    const n = v.count(d.accounts);
    return `${n === 1 ? "1 cuenta ha cambiado" : `${n} cuentas han cambiado`} de país (${v.many(d.accounts)}): cuenta el país que tenía a 31 de diciembre, tomado del día en que se registró cada cambio.`;
  },
  informative_crypto_custody_unknown: () =>
    "Se cuenta todo lo que hay en cuentas extranjeras; si alguna es de autocustodia, no entraría. Tus datos no distinguen las dos cosas.",
  informative_iic_net_asset_value: (d, v) =>
    `Los fondos, ETF y monetarios (${v.many(d.assets)}) se declaran por su valor liquidativo a 31 de diciembre (artículo 42 ter.2 del reglamento de gestión tributaria), no por su cotización: anota como valoración de ese día el liquidativo que publica la gestora.`,
  informative_criteria_not_numbered: {
    say: () =>
      "El método del saldo medio del trimestre y la clasificación de ETF, ETC y ETP se apoyan en criterios todavía sin numerar.",
    cli: () => "(Fichas F3 y F4.)",
  },
};
