// Before/after tables of a candidate event: positions and open lots of the
// affected assets, plus the gains the event would book.

import type { FiscalLot } from "@atlas/domain";
import type { CandidatePreview, Snapshot } from "../commands/shared.js";
import { table } from "./table.js";

const positionRows = (before: Snapshot, after: Snapshot): string[][] => {
  const keys = new Map<string, [string, string]>();
  for (const p of [...before.positions, ...after.positions]) {
    keys.set(`${p.account_id}|${p.asset_id}`, [p.account_id, p.asset_id]);
  }
  const find = (snapshot: Snapshot, account: string, asset: string): string =>
    snapshot.positions
      .find((p) => p.account_id === account && p.asset_id === asset)
      ?.quantity.toString() ?? "0";
  return [...keys.values()].map(([account, asset]) => [
    account,
    asset,
    find(before, account, asset),
    find(after, account, asset),
  ]);
};

const lotCell = (lot: FiscalLot | undefined, field: "quantity" | "cost_eur"): string => {
  if (lot === undefined) {
    return "—";
  }
  if (lot.closed) {
    return "cerrado";
  }
  return field === "quantity" ? lot.quantity.toString() : lot.cost_eur.amount.toString();
};

const lotRows = (before: Snapshot, after: Snapshot): string[][] => {
  const ids = new Map<string, FiscalLot>();
  for (const lot of [...before.lots, ...after.lots]) {
    ids.set(lot.id, lot);
  }
  return [...ids.entries()]
    .filter(([id]) => {
      const was = before.lots.find((lot) => lot.id === id);
      const is = after.lots.find((lot) => lot.id === id);
      return !(was?.closed === true && is?.closed === true);
    })
    .map(([id, sample]) => {
      const was = before.lots.find((lot) => lot.id === id);
      const is = after.lots.find((lot) => lot.id === id);
      return [
        id,
        sample.asset_id,
        sample.acquisition_date,
        lotCell(was, "quantity"),
        lotCell(is, "quantity"),
        lotCell(was, "cost_eur"),
        lotCell(is, "cost_eur"),
      ];
    });
};

export const renderPreview = (preview: CandidatePreview): string => {
  const sections = [
    "Posiciones (antes → después):",
    table(["cuenta", "activo", "antes", "después"], positionRows(preview.before, preview.after)),
    "Lotes abiertos (antes → después):",
    table(
      [
        "lote",
        "activo",
        "adquisición",
        "cantidad antes",
        "cantidad después",
        "coste EUR antes",
        "coste EUR después",
      ],
      lotRows(preview.before, preview.after),
    ),
  ];
  if (preview.gains.length > 0) {
    sections.push(
      "Ganancias generadas:",
      table(
        ["cuenta", "cantidad", "transmisión EUR", "coste EUR", "ganancia EUR"],
        preview.gains.map((g) => [
          g.account_id,
          g.quantity.toString(),
          g.proceeds_eur.amount.toString(),
          g.cost_eur.amount.toString(),
          g.gain_eur_rounded.amount.toString(),
        ]),
      ),
    );
  }
  return sections.join("\n");
};

/** JSON-friendly version of the preview for --json. */
export const previewData = (preview: CandidatePreview): Record<string, unknown> => {
  const snapshot = (s: Snapshot) => ({
    positions: s.positions.map((p) => ({ ...p, quantity: p.quantity.toString() })),
    lots: s.lots.map((lot) => ({
      id: lot.id,
      asset_id: lot.asset_id,
      acquisition_date: lot.acquisition_date,
      quantity: lot.quantity.toString(),
      cost_eur: lot.cost_eur.amount.toString(),
      closed: lot.closed,
    })),
  });
  return {
    event: preview.candidate,
    before: snapshot(preview.before),
    after: snapshot(preview.after),
    gains: preview.gains.map((g) => ({
      account_id: g.account_id,
      quantity: g.quantity.toString(),
      proceeds_eur: g.proceeds_eur.amount.toString(),
      cost_eur: g.cost_eur.amount.toString(),
      gain_eur: g.gain_eur_rounded.amount.toString(),
    })),
    warnings: preview.warnings,
  };
};
