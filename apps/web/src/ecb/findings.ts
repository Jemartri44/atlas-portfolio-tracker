// The findings of the ECB check on the ledger's rates, by event, for the notes
// of the tax report (ADR-0029, point 8). Loaded lazily with the fiscal screen;
// with no history in this device there are none, and the report still notes a
// rate dated after its fiscal date, which the projection sees on its own.

import type { LedgerEvent, LedgerState } from "@atlas/domain";
import { today } from "../ledger/state.js";

export const rateFindingsOf = async (
  state: LedgerState,
  events: readonly LedgerEvent[],
): Promise<{ event_id: string; code: string }[]> => {
  const [{ loadWebHistory }, { checkLedgerRates }] = await Promise.all([
    import("./history.js"),
    import("@atlas/domain/ecb"),
  ]);
  const web = await loadWebHistory();
  const check = checkLedgerRates(web.history, state, events, web.staleDays, today());
  return check.kind === "unchecked"
    ? []
    : check.findings.flatMap((finding) =>
        finding.event_ids.map((event_id) => ({ event_id, code: finding.code })),
      );
};
