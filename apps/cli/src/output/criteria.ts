// The Spanish name of each fiscal criterion, for the console.
//
// In `output/` and not inside a command because more than one prints them:
// `atlas tax` puts the label beside every criterion it names, and `atlas
// m720` used to print the bare identifiers —`6, 25`— which say nothing to
// anybody reading a return. Same figure, same wording, one table.
//
// The web keeps its own (`format/criteria.ts`): the type `Record<CriterionId,
// string>` guarantees that neither of them forgets a criterion, and nothing
// guarantees that the two say the same thing — written down in the handover.

import type { CriterionId } from "@atlas/domain/fiscal";

/** Short Spanish name of each criterion of `docs/fiscal-questions.md`. */
export const CRITERION_LABELS: Record<CriterionId, string> = {
  "1": "fecha fiscal por tipo de activo",
  "2:listed": "ventana de dos meses (cotizados)",
  "2:listed_1y": "ventana de un año (cotizados, la lectura prudente)",
  "2:crypto": "ventana de un año (cripto)",
  "2:crypto_2m": "ventana de dos meses (cripto, la lectura menos prudente)",
  "2:fund_2m": "ventana de dos meses (fondos)",
  "2:fund_1y": "ventana de un año (fondos, la lectura prudente)",
  "2:other": "ventana configurada que ninguna lectura del documento sostiene",
  "2b": "un traspaso entrante es una adquisición",
  "3": "comisiones en la base (art. 35)",
  "4": "ganancia en divisa y diferencias de cambio",
  "5": "tipo del BCE del último día publicado",
  "6": "redondeo half-up una vez por operación",
  "7": "reparto del coste en una escisión y régimen de neutralidad",
  "8": "fork o airdrop a coste cero",
  "9": "pérdida por liquidación de la sociedad",
  "10": "compensación hasta el 25 % y arrastre a cuatro años",
  "11": "Modelo 720",
  "12": "retención en reembolsos de fondos",
  "13": "canje con compensación en efectivo y régimen de neutralidad",
  "14": "ventana contada de fecha a fecha",
  "15": "el diferimiento viaja con los lotes descendientes",
  "16": "deducción por doble imposición",
  "17": "la comisión de una permuta resta de lo transmitido",
  "18": "solo cuenta la recompra que sigue en el patrimonio",
  "19": "cada unidad recomprada difiere una sola vez",
  "20": "la regla mira la operación, no el lote",
  "21": "lo liberado vuelve a pasar por la regla",
  "22": "orden de la compensación entre ejercicios",
  "23": "gastos de administración y depósito (art. 26.1.a)",
  "24:etc": "ETC como rendimiento del capital mobiliario (la consulta V0267-25)",
  "24:etc_gain": "ETC como ganancia patrimonial (lo contrario de la consulta V0267-25)",
  "24:etp": "ETP como rendimiento del capital mobiliario",
  "24:etp_gain": "ETP como ganancia patrimonial",
  "25": "el tipo del BCE es el de la fecha fiscal vigente; otro se corrige, no se recalcula",
};
