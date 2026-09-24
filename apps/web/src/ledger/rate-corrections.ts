// The correction of the ECB rates that a change of `fiscal_date_rule` left
// behind (feature 012, block 6; ADR-0029, point 10; criterion 25): proposed by
// the domain, shown whole with the filed returns it reaches, and written **in
// one write** after the user's yes. Loaded lazily with «Verificación».

import { todayInMadrid } from "@atlas/domain";
import {
  type PreparedRateCorrections,
  prepareRateCorrections,
  writeRateCorrections,
} from "@atlas/domain/ecb";
import { type ClosedYearImpact, closedYearImpact } from "@atlas/domain/fiscal";
import { loadWebHistory } from "../ecb/history.js";
import { requireDeps } from "./state.js";
import { runWrite, type WriteResult } from "./write.js";

/** The reason written into every reversal of the chain. */
export const CORRECTION_REASON =
  "Tipo del BCE de la fecha fiscal vigente, tras cambiar la regla de la fecha fiscal (criterio 25)";

export interface ProposedCorrections {
  prepared: PreparedRateCorrections;
  /** The filed returns the chain reaches, with the figures it moves (ADR-0020). */
  closed: readonly ClosedYearImpact[];
  /** Whether there was a history: without one only the euro can be corrected. */
  history: boolean;
}

export const proposeCorrections = async (): Promise<ProposedCorrections> => {
  const deps = requireDeps();
  const web = await loadWebHistory();
  const prepared = await prepareRateCorrections(
    deps,
    web.history,
    web.staleDays,
    CORRECTION_REASON,
  );
  const closed =
    prepared.chain.length === 0
      ? []
      : closedYearImpact(
          { events: prepared.events },
          { events: [...prepared.events, ...prepared.chain] },
          todayInMadrid(deps.clock),
        );
  return { prepared, closed, history: web.history !== undefined };
};

/** Writes the whole chain, or nothing. */
export const writeCorrections = (
  prepared: PreparedRateCorrections,
): Promise<WriteResult<{ etag: string }>> =>
  runWrite(() => writeRateCorrections(requireDeps(), prepared));
