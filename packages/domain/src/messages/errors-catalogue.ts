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
};
