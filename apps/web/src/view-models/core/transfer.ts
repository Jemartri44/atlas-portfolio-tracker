// The transfer simulator, as a before/after table.
//
// `simulateTransfer` does the work and says the thing that matters: a transfer
// between funds is **not** a taxable event, it keeps the acquisition date and
// the cost of the original lots (`docs/business-rules.md` §5.2). That sentence
// is repeated on the screen every single time, because it is the mistake this
// project exists to avoid (trap 1 of `CLAUDE.md`).

import type { Money, Quantity, TransferSimulation, Warning } from "@atlas/domain";
import { displayName, type NameIndex, NO_NAMES } from "../../format/names.js";

export interface TransferRowView {
  assetId: string;
  name: string;
  weightBeforePct?: string;
  weightAfterPct?: string;
  deviationBeforePp?: string;
  deviationAfterPp?: string;
  /** Origin or destination of the move: the two rows that change. */
  role?: "from" | "to";
}

export interface TransferView {
  date: string;
  fromName: string;
  toName: string;
  /** `Quantity`, never a string: see the note in `core/weights.ts`. */
  quantity: Quantity;
  moved: Money;
  rows: TransferRowView[];
  warningsBefore: readonly Warning[];
  warningsAfter: readonly Warning[];
}

export const transferView = (
  simulation: TransferSimulation,
  names: NameIndex = NO_NAMES,
): TransferView => {
  const after = new Map(simulation.after.rows.map((row) => [row.asset_id, row]));
  return {
    date: simulation.date,
    fromName: displayName(names, simulation.from_asset_id),
    toName: displayName(names, simulation.to_asset_id),
    quantity: simulation.quantity,
    moved: simulation.moved_eur,
    rows: simulation.before.rows.map((row) => {
      const next = after.get(row.asset_id);
      return {
        assetId: row.asset_id,
        name: displayName(names, row.asset_id),
        ...(row.weight_pct === undefined ? {} : { weightBeforePct: row.weight_pct.toString() }),
        ...(next?.weight_pct === undefined ? {} : { weightAfterPct: next.weight_pct.toString() }),
        ...(row.deviation_pp === undefined
          ? {}
          : { deviationBeforePp: row.deviation_pp.toString() }),
        ...(next?.deviation_pp === undefined
          ? {}
          : { deviationAfterPp: next.deviation_pp.toString() }),
        ...(row.asset_id === simulation.from_asset_id
          ? { role: "from" as const }
          : row.asset_id === simulation.to_asset_id
            ? { role: "to" as const }
            : {}),
      };
    }),
    warningsBefore: simulation.before.warnings,
    warningsAfter: simulation.after.warnings,
  };
};
