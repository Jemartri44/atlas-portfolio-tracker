// The ECB history kept next to the ledger, read the way every command wants it.

import { dirname } from "node:path";
import { FileEcbHistoryStore, readLocalConfig } from "@atlas/adapters";
import { type EcbHistory, readEcbHistory } from "@atlas/domain/ecb";
import type { Context } from "./context.js";

/** The history in a folder, or `undefined` — with the reason when there is one but it cannot be used. */
export const historyIn = async (
  folder: string,
): Promise<{ history?: EcbHistory; problem?: string }> => {
  try {
    const active = await new FileEcbHistoryStore(folder).active();
    return active === undefined ? {} : { history: readEcbHistory(active.text, active.meta.source) };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error) };
  }
};

/** The history next to the ledger of the command. */
export const historyOf = (ctx: Context) => historyIn(dirname(ctx.ledgerPath));

/** The history and the days after which a currency the ECB stopped publishing is stale. */
export const ecbOf = async (
  ctx: Context,
): Promise<{ history?: EcbHistory; problem?: string; staleDays: number }> => {
  const { ecb_stale_currency_days } = await readLocalConfig(dirname(ctx.ledgerPath));
  return { ...(await historyOf(ctx)), staleDays: ecb_stale_currency_days };
};
