// Warnings about operations, the wash-sale window and swaps.

import { PARTNER_FINE } from "../projections/exchange-notices.js";
import { neutralityDenied } from "./errors-corporate.js";
import type { Entry, Voice } from "./voice.js";
import { windowText, year } from "./words.js";

/** Where the console points for how much a window defers. */
const taxHint = (how: string, v: Voice, taxYear: unknown): string =>
  `${how}, lo dice \`atlas tax ${v.text(taxYear)}\` (business-rules.md §5.4).`;

export const WARNINGS_OPERATIONS: Record<string, Entry> = {
  // --- Operations ---
  currency_mismatch: (d, v) =>
    `El evento está en ${v.text(d.currency)} y el activo ${v.one(d.asset_id)} está en ${v.text(d.asset_currency)}.`,
  fx_rate_date_after_fiscal_date: {
    say: (d, v) =>
      `La fecha del tipo de cambio (${v.date(d.fx_rate_date)}) es posterior a la fecha fiscal (${v.date(d.fiscal_date)}).`,
    cli: () => "(campo fx_rate_date)",
  },
  same_asset_two_accounts: (d, v) =>
    `${v.one(d.asset_id)} está ahora en ${v.num(v.count(d.accounts))} cuentas; el FIFO sigue siendo global, entre todas ellas.`,
  transfer_not_between_funds: {
    say: (d, v) =>
      `Un traspaso con ${v.one(d.from_asset_id)} y ${v.one(d.to_asset_id)} no puede diferir impuestos: ${v.one(d.asset_id)} no es un fondo. Hacienda lo trata como una venta y una compra; regístralo así para que la renta lo cuente.`,
    cli: () => "(transfer_not_between_funds)",
  },
  transfer_not_resident: {
    say: () =>
      "Un traspaso se registró con la residencia fiscal fuera de España: sin residencia en España no hay diferimiento. Regístralo como una venta y una compra.",
    cli: (d, v) => `(tax_residence ${v.text(d.tax_residence)}; transfer_not_resident)`,
  },
  neutrality_denied_keeps_cost: neutralityDenied,
  exchange_acquirer_outside_eu: {
    say: (d, v) =>
      `${v.one(d.asset_id)} es de un emisor de fuera de España y de la UE (${v.text(d.country)}). Si la operación es un canje de valores, queda fuera del régimen de neutralidad y es una permuta sujeta: regístrala como permuta. Si es una fusión, el requisito mira a dónde reside el socio.`,
    cli: () => "(art. 80.1.b LIS; en la fusión, art. 81.1 LIS)",
  },
  exchange_partner_communication: {
    say: (d, v) =>
      `Ni ${v.one(d.from_asset_id)} ni ${v.one(d.to_asset_id)} son de una entidad española: si aplicas la neutralidad, tienes que comunicarlo tú a Hacienda en el plazo de tu declaración. No hacerlo es una multa fija de ${PARTNER_FINE} por operación.`,
    cli: () => "(art. 89.1 LIS y art. 48.2 RIS)",
  },
  exchange_domicile_unknown: {
    say: (d, v) =>
      `Atlas no sabe dónde está el emisor de ${v.many(d.assets)}, y de eso dependen el régimen de neutralidad y una comunicación a Hacienda que, si te toca a ti y no la presentas, tiene multa. Compruébalo e indica el ISIN o el país del emisor.`,
    cli: () => "(arts. 80.1.b y 89.1 LIS)",
  },
  exchange_cash_cap: {
    say: () =>
      "El dinero del canje no puede pasar del 10 % del valor nominal de los valores entregados a cambio; si lo pasa, la operación no entra en el régimen. Atlas no guarda el nominal: compruébalo en el folleto.",
    cli: () => "(art. 76 LIS)",
  },
  convert_fund_to_listed_fund: {
    say: (d, v) =>
      `${v.one(d.from_asset_id)} pasa a ${v.one(d.to_asset_id)}, un ETF, conservando fecha y coste. El diferimiento entre fondos excluye los fondos cotizados: compruébalo antes de darlo por bueno.`,
    cli: () => "(art. 94.1.a LIRPF)",
  },
  transferable_not_fund: (d, v) =>
    `${v.one(d.asset_id)} es de tipo ${v.word(d.asset_type)} y está marcado como traspasable, pero el diferimiento solo existe entre fondos: esa marca no tiene efecto.`,
  thesis_size_exceeded: (d, v) =>
    `La tesis ${v.thesis(d.thesis_id)} lleva ${v.money(d.invested_eur)} invertidos, por encima de los ${v.money(d.planned_size_eur)} previstos.`,
  thesis_closed_with_position: (d, v) =>
    `La tesis ${v.thesis(d.thesis_id)} está cerrada, pero ${v.one(d.account_id)} sigue teniendo ${v.titles(d.position)} de ${v.one(d.asset_id)}.`,

  // --- Wash-sale window ---
  wash_sale_window_repurchase: {
    say: (d, v) =>
      `Compra del ${v.date(d.buy_date)} de ${v.titles(d.buy_quantity)} de ${v.one(d.asset_id)} dentro de la ventana de su venta con pérdida del ${v.date(d.sale_date)} (${v.money(d.loss_eur)}; ${windowText(v, d.window)}, hasta el ${v.date(d.window_end)}): puede hacer que esa pérdida no sea computable en ${year(v, d.tax_year)}.`,
    cli: (d, v) => taxHint("Cuánto difiere", v, d.tax_year),
  },
  wash_sale_window_prior_buy: {
    say: (d, v) =>
      `Venta con pérdida de ${v.one(d.asset_id)} del ${v.date(d.sale_date)} (${v.money(d.loss_eur)}) cuando en cartera hay todavía ${v.titles(d.held_quantity)} de una compra del ${v.date(d.buy_date)}, dentro de la ventana abierta el ${v.date(d.window_start)} (${windowText(v, d.window)}): la pérdida puede no ser computable en ${year(v, d.tax_year)}.`,
    cli: (d, v) => taxHint("Cuánto", v, d.tax_year),
  },

  // --- Payments of the income tax return ---
  tax_instalment_repeated: (d, v) =>
    `Ya constaba un ${d.instalment === "second" ? "segundo" : "primer"} plazo de la Renta de ${year(v, d.tax_year)}: comprueba que no lo hayas registrado dos veces.`,
  tax_second_without_first: (d, v) =>
    `Este segundo plazo de la Renta de ${year(v, d.tax_year)} no tiene un primero registrado antes: el fraccionamiento es un 60 % al presentarla y un 40 % después.`,

  // --- Swap ---
  swap_fiscal_dates_differ: {
    say: (d, v) =>
      `En la permuta, ${v.one(d.from_asset_id)} tiene fecha fiscal ${v.date(d.fiscal_date_out)} y ${v.one(d.to_asset_id)} la tiene ${v.date(d.fiscal_date_in)}: la transmisión y la adquisición caen en días distintos porque sus tipos de activo usan reglas distintas.`,
    cli: () => "(ADR-0013)",
  },
};
