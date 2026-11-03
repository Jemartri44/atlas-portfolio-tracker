// Errors of the corporate actions: composing them from parameters and the rules of each kind.

import type { Entry } from "./voice.js";

export const ERRORS_CORPORATE: Record<string, Entry> = {
  missing_source_document: {
    say: (d, v) =>
      `Un evento corporativo de tipo ${v.word(d.kind)} necesita su fuente documental: la dirección o el PDF de la nota del emisor. No es opcional.`,
    cli: () => "(data-schema.md §6.5)",
  },
  missing_effect_parameter: (d, v) =>
    `Falta ${v.field(d.parameter)}: un evento corporativo de tipo ${v.word(d.kind)} no se puede componer sin ese dato.`,
  no_wizard_for_kind: {
    say: (d, v) =>
      `Un evento corporativo de tipo ${v.word(d.kind)} no tiene formulario: sus efectos se indican uno a uno.`,
    web: () => "De momento eso solo se hace desde la CLI.",
    cli: (d, v) => `A mano: atlas ca raw --kind ${v.text(d.kind)} --effects-json …`,
  },
  fee_account_not_selling: (d, v) =>
    `La cuenta ${v.one(d.account_id)} no participa en la venta forzosa, así que no puede llevar comisión. Venden: ${v.many(d.selling)}.`,
  effects_not_allowed_for_kind: {
    say: (d, v) =>
      `Un evento corporativo de tipo ${v.word(d.kind)} no admite esa combinación de efectos: revisa el tipo elegido.`,
    cli: (d, v) => `Efectos: ${v.text(d.effects)}; admitidas: ${v.text(d.allowed)}.`,
  },
  cost_adjustment_requires_neutrality: {
    say: (d, v) =>
      `El dinero de un evento de tipo ${v.word(d.kind)} solo rebaja el coste de lo recibido si la operación se acoge al régimen de neutralidad. Sin régimen, el canje es una permuta sujeta y el dinero es parte de lo transmitido.`,
    cli: () => "Indícalo con --neutrality-regime.",
  },
  capital_return_needs_stock: {
    say: (d, v) =>
      `La devolución de prima o de aportaciones solo se registra sobre acciones, y ${v.one(d.asset_id)} no lo es (es de tipo ${v.word(d.asset_type)}): en un fondo, un ETF o una SICAV la ley la trata de otra forma (artículo 94 de la ley del IRPF) y Atlas no la modela.`,
    cli: () => "Es el artículo 94.1.",
  },
  capital_return_needs_eu_listed: {
    say: (d, v) =>
      `La devolución de prima o de aportaciones solo rebaja el coste en acciones de un mercado regulado de la UE (artículo 25 de la ley del IRPF), y ${v.one(d.asset_id)} ${
        d.reason === "not_eu"
          ? "cotiza fuera de la UE: allí la ley la grava como rendimiento con el tope de la diferencia de fondos propios, y Atlas no lo modela."
          : d.reason === "admission_unknown"
            ? "se compró en una bolsa (Xetra, Fráncfort, Euronext o BME) donde también cotizan valores no admitidos en su mercado regulado, y su ISIN o su divisa no dejan claro que el valor sea de la UE. Lo que cuenta es dónde está admitido el valor, no dónde lo compraste: si es de una sociedad de la UE, anota su ISIN y vuelve a registrarla; si es de fuera, la ley grava la devolución como rendimiento y Atlas no lo modela."
            : d.reason === "market_missing"
              ? "no tiene mercado anotado. Anota el mercado del activo (código MIC, por ejemplo XMAD) y vuelve a registrarla."
              : "tiene un mercado que Atlas no conoce. Anota el mercado del activo (código MIC, por ejemplo XMAD) y vuelve a registrarla."
      }`,
    cli: (d, v) =>
      d.reason === "not_eu"
        ? ""
        : d.reason === "admission_unknown"
          ? `\`atlas asset update ${v.one(d.asset_id)} --isin <ISIN>\`.`
          : `\`atlas asset update ${v.one(d.asset_id)} --market <MIC>\`.`,
    web: (d) => (d.reason === "not_eu" ? "" : "Se anota en Catálogo."),
  },
  cost_adjustment_exceeds_cost: (d, v) =>
    `El dinero del evento supera el coste de los títulos de ${v.one(d.asset_id)} (exceso: ${v.money(d.excess_eur)}): la ley solo dice que el valor disminuye; revisa el importe o consulta cómo declararlo.`,
  liquidation_must_cover_all_accounts: (d, v) =>
    `Una liquidación vende todo en exactamente las cuentas con posición de ${v.one(d.asset_id)} (faltan: ${v.many(d.missing)}; sobran: ${v.many(d.extra)}; parciales: ${v.many(d.partial)}).`,
  no_open_lots: (d, v) =>
    `El activo ${v.one(d.asset_id)} no tiene lotes abiertos en la fecha de efecto: no hay nada que transformar.`,
  same_asset: (d, v) => `El activo de destino no puede ser el propio ${v.one(d.asset_id)}.`,
  duplicate_account_in_effect: {
    say: (d, v) => `La cuenta ${v.one(d.account_id)} aparece dos veces en el mismo efecto.`,
    cli: () => "(per_account)",
  },
  invalid_ratio: {
    say: (d, v) =>
      `Proporción no válida: ${v.num(d.value)}. Escribe un número positivo o una fracción de títulos nuevos entre antiguos.`,
    web: () => "Por ejemplo 1,5 o 4/3.",
    cli: () => "Por ejemplo 1.5, 0.25 o 4/3.",
  },
};
