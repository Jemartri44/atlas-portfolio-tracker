// Errors of the catalogue of accounts and assets, and of the theses of the bucket.

import type { Entry } from "./voice.js";

export const CATALOGUE_ERRORS: Record<string, Entry> = {
  unknown_account: (d, v) => `La cuenta ${v.one(d.account_id)} no existe.`,
  unknown_asset: (d, v) => `El activo ${v.one(d.asset_id)} no existe.`,
  duplicate_account: (d, v) => `La cuenta ${v.one(d.account_id)} ya existe.`,
  duplicate_asset: (d, v) => `El activo ${v.one(d.asset_id)} ya existe.`,
  asset_book_change: {
    say: (d, v) =>
      `El activo ${v.one(d.asset_id)} no puede pasar de la cartera principal al cubo ni al revés: da de alta un activo nuevo.`,
    cli: () => "(ADR-0009)",
  },
  duplicate_isin: {
    say: (d, v) =>
      `El ISIN ${v.text(d.isin)} ya es de ${v.one(d.existing_asset_id)}: un mismo valor no puede ser dos activos, porque la regla de recompra y el FIFO los tratarían como distintos. Registra las operaciones en ${v.one(d.existing_asset_id)}.`,
    cli: () => "(ADR-0009)",
  },
  asset_type_change: (d, v) =>
    `El activo ${v.one(d.asset_id)} no puede cambiar de tipo (${v.word(d.from)} → ${v.word(d.to)}): alteraría la fecha fiscal de todas sus operaciones. Da de alta un activo nuevo.`,
  asset_currency_change: (d, v) =>
    `El activo ${v.one(d.asset_id)} no puede cambiar de divisa (${v.text(d.from)} → ${v.text(d.to)}): alteraría la base de coste de todas sus operaciones. Da de alta un activo nuevo.`,
  account_book_change: (d, v) =>
    `La cuenta ${v.one(d.account_id)} tiene operaciones registradas: ya no puede pasar de la cartera principal al cubo ni al revés.`,
  book_mismatch: () =>
    "La cuenta y el activo pertenecen a carteras distintas: la cartera principal y el cubo no se mezclan.",
  unknown_thesis: (d, v) => `La tesis ${v.thesis(d.thesis_id)} no existe.`,
  thesis_mismatch: (d, v) =>
    `La tesis ${v.thesis(d.thesis_id)} es de ${v.one(d.asset_id)} en ${v.one(d.account_id)}, no de esta operación.`,
  thesis_not_open: (d, v) =>
    `La tesis ${v.thesis(d.thesis_id)} no está abierta en ese momento: se abre antes de comprar y no se cierra antes.`,
  thesis_not_allowed: {
    say: (d, v) =>
      `Solo las cuentas del cubo llevan tesis; ${v.one(d.account_id)} es de la cartera principal.`,
    cli: () => "(opción --thesis)",
  },
  duplicate_thesis: (d, v) =>
    `Ya hay una tesis con el identificador «${v.text(d.thesis_id)}»: elige otro.`,
  thesis_already_open: (d, v) =>
    `Ya hay una tesis abierta (${v.thesis(d.thesis_id)}) sobre ${v.one(d.asset_id)} en ${v.one(d.account_id)}: ciérrala antes.`,
  thesis_already_closed: (d, v) => `La tesis ${v.thesis(d.thesis_id)} ya está cerrada.`,
  not_bucket: (d, v) =>
    `Una tesis exige cuenta y activo del cubo (${v.one(d.account_id)}, ${v.one(d.asset_id)}).`,
};
