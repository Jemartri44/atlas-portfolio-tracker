// The fiscal criteria, said in Spanish and without the vocabulary of the code.
//
// The engine labels every figure with the criteria it depends on, by an
// identifier of the catalogue: `2:listed`, `24:etc_gain`, `2:fund_1y`. That
// identifier is exact and it is useless to the person reading the screen, so
// **it never appears in the interface**: what appears is
// "ventana de dos meses para cotizados".
//
// The map is typed against the catalogue, so a criterion added to the domain
// stops the build here until somebody writes its name — which is the point.
// `test/criteria.test.ts` checks the other half: that no name smuggles the
// identifier back in.

import type {
  Certainty,
  CriterionId,
  CriterionStake,
  Measure,
  RiskDirection,
} from "@atlas/domain/fiscal";

/** What the criterion says, in one line a person can read. */
export const CRITERION_NAMES: Record<CriterionId, string> = {
  "1": "La fecha que cuenta a efectos fiscales, según el tipo de activo",
  "2:listed": "Ventana de dos meses para valores cotizados",
  "2:listed_1y": "Ventana de un año para valores cotizados, la lectura prudente",
  "2:crypto":
    "Ventana de un año posterior a la venta para criptomonedas, la lectura literal del art. 33.5.e)",
  "2:crypto_2m":
    "Ventana de dos meses posterior a la venta para criptomonedas, la lectura menos prudente",
  "2:fund_2m": "Ventana de dos meses para fondos de inversión",
  "2:fund_1y": "Ventana de un año para fondos de inversión, la lectura prudente",
  "2:other": "Ventana a medida, que ninguna lectura conocida de la norma sostiene",
  "2:movable_capital":
    "Dos meses fijos del capital mobiliario (art. 25.2.b LIRPF), sin variante de un año",
  "2b": "Un traspaso que entra cuenta como compra a efectos de la recompra",
  "3": "Las comisiones suman al coste y restan de lo transmitido",
  "4": "La ganancia de lo comprado en otra divisa se calcula primero en esa divisa",
  "4:mixed_currency":
    "Lo comprado en una divisa y vendido en otra se calcula con el tipo de cada día",
  "4:currency_fifo": "La divisa se gasta en el orden en que entró, sumando todas las cuentas",
  "4:currency_wash_sale": "La regla de recompra no se aplica a la divisa",
  "4:auto_conversion": "Lo que convirtió el bróker se valora con los euros que liquidó",
  "5": "Se usa el tipo del Banco Central Europeo del último día publicado",
  "6": "Cada operación se redondea al céntimo una sola vez, hacia arriba en el empate",
  "7": "Reparto del coste en una escisión y régimen de neutralidad",
  "8": "Una bifurcación o un reparto gratuito entran a coste cero",
  "9": "Pérdida por la liquidación de la sociedad",
  "10": "Las pérdidas compensan hasta el 25 % y se arrastran cuatro años",
  "11": "Qué obliga a presentar la declaración de bienes en el extranjero",
  "12": "Retención en los reembolsos de fondos",
  "13": "Canje con dinero de por medio y régimen de neutralidad",
  "14": "La ventana de recompra se cuenta de fecha a fecha",
  "15": "La pérdida aplazada viaja con lo que se compró después",
  "16": "Deducción por lo pagado a Hacienda de otro país",
  "17": "La comisión de una permuta resta de lo que se entrega",
  "18": "Solo aplaza la pérdida la recompra que sigue en cartera",
  "18:single_purchase": "Una sola compra en los dos meses anteriores no cuenta como recompra",
  "18:single_purchase_etc":
    "Una sola compra en los dos meses anteriores no cuenta como recompra (por analogía, ETC o ETP)",
  "19": "Cada participación recomprada aplaza una pérdida una sola vez",
  "20": "La regla de la recompra mira la venta entera, no cada lote",
  "21": "Solo una venta definitiva, sin recompra en su ventana, libera la pérdida diferida",
  "22": "En qué orden se compensan las pérdidas de distintos años",
  "23": "Los gastos de administración y depósito restan de los rendimientos",
  "24:etc": "Un ETC tributa como rendimiento del capital mobiliario",
  "24:etc_gain": "Un ETC tributa como ganancia patrimonial",
  "24:etp": "Un ETP tributa como rendimiento del capital mobiliario",
  "24:etp_gain": "Un ETP tributa como ganancia patrimonial",
  "25": "El tipo del BCE es el de la fecha fiscal vigente; si no, se corrige",
};

/** How firm the reading of the law is. */
export const CERTAINTY_LABELS: Record<Certainty, string> = {
  high: "criterio firme",
  medium: "certeza media",
  low: "certeza baja",
  disputed: "en disputa",
};

/** The tone of the tag: only a disputed criterion is a warning. */
export const certaintyTone = (certainty: Certainty): "neutral" | "caution" =>
  certainty === "disputed" ? "caution" : "neutral";

/**
 * What happens **if the criterion is wrong**, in words and from the point of
 * view of the person who pays. It is the half of the risk that matters and the
 * one that survives the privacy mask: the direction is not an amount.
 */
export const DIRECTION_SENTENCES: Record<RiskDirection | "none", string> = {
  conservative: "Si esta lectura está mal, has pagado de más.",
  aggressive: "Si esta lectura está mal, has declarado de menos.",
  both: "Según cómo caiga el ejercicio, puede salir de más o de menos.",
  neutral: "Aunque esté mal, no cambia lo que pagas: solo el orden de lo que caduca.",
  none: "La otra lectura no mueve ninguna cifra de este ejercicio.",
};

/** What the money beside a criterion means. */
export const MEASURE_LABELS: Record<Measure, string> = {
  difference: "diferencia sobre la base",
  exposure: "importe expuesto",
  not_quantifiable: "no se puede medir desde tus datos",
};

/**
 * Why a criterion cannot be measured, when the engine says why.
 *
 * **Closed against the union of the domain**, like `PARTIAL_TEXTS` and
 * `MODEL_NAMES`: it was a `Record<string, string>`, so a reason
 * added to the engine broke nothing here and the screen painted a hole where
 * the explanation goes. The console's map was already typed against the union
 * and stopped the build; this one did not, which is the asymmetry. Now the
 * build stops here too until somebody writes the words.
 */
export const MEASURE_REASONS: Record<NonNullable<CriterionStake["reason"]>, string> = {
  invalid_under_alternative:
    "con la otra lectura hay movimientos que dejan de ser válidos, así que no hay una cifra que comparar",
  unsupported_under_alternative:
    "con la otra lectura el cálculo tendría que empezar antes del primer ejercicio que la aplicación sabe calcular",
  regime_not_recorded:
    "el canje no dice si se acogió al régimen de neutralidad, y sin eso no hay valor que comparar",
  no_carrier_left: "no queda nada de ese activo en cartera sobre lo que aplazar la pérdida",
};
