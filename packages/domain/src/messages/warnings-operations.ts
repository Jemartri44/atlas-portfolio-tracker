// Warnings about operations, the wash-sale window and swaps.

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
  transferable_not_fund: (d, v) =>
    `${v.one(d.asset_id)} es de tipo ${v.word(d.asset_type)} y está marcado como traspasable, pero el diferimiento solo existe entre fondos: esa marca no tiene efecto.`,
  sell_without_thesis: (d, v) =>
    `La venta de ${v.one(d.asset_id)} en ${v.one(d.account_id)} no está enlazada a ninguna tesis.`,
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

  // --- Swap ---
  swap_fiscal_dates_differ: {
    say: (d, v) =>
      `En la permuta, ${v.one(d.from_asset_id)} tiene fecha fiscal ${v.date(d.fiscal_date_out)} y ${v.one(d.to_asset_id)} la tiene ${v.date(d.fiscal_date_in)}: la transmisión y la adquisición caen en días distintos porque sus tipos de activo usan reglas distintas.`,
    cli: () => "(ADR-0013)",
  },
};
