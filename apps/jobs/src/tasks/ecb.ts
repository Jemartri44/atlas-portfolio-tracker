// The daily task of the ECB (feature 016, E2; ADR-0029; `docs/specification.md`
// §9.5): the official history downloaded as the console does it — the ZIP
// first, the API if it fails — and made the history in force in
// `reference/ecb/` **only if it keeps every published rate with the same
// value** (`updateEcbHistory`, the use case of the 012, not rewritten). It
// composes and decides nothing, and **it sends nothing** (§8.2 B2): a rejected
// update, a TARGET calendar in disagreement or a history damaged beyond
// undoing are findings in its record, and the mail function sends them.
//
// **A damaged history does not stop the cloud** (review of PR #106, B1 (b)):
// it is rebuilt whole from the official ZIP of the ECB, the source of truth,
// which anyone can download again; with the API only, it stays damaged and
// the next run tries again.

import { S3EcbHistoryStore } from "@atlas/adapters/aws-daily";
import { firstRateDateOf, rebuildEcbHistory, updateEcbHistory } from "@atlas/domain/ecb";
import { ecbFindings } from "@atlas/domain/jobs";
import type { TaskResult, TaskRunner } from "../run.js";

export const ecbUpdate: TaskRunner = async (context): Promise<TaskResult> => {
  const { deps } = context;
  const source = deps.sources?.ecb;
  if (source === undefined) {
    throw new RangeError("the ECB task without its source");
  }
  const store = new S3EcbHistoryStore(deps.objects);
  const recovered = await store.recover();
  const ledger = await context.ledger();
  const options = {
    firstRateDate: ledger.ok ? firstRateDateOf(ledger.events) : undefined,
    today: context.today,
  };
  if (recovered === "damaged") {
    const rebuilt = await rebuildEcbHistory({ source: source(), store }, options);
    return {
      state: "done",
      outcome:
        rebuilt.kind === "rebuilt"
          ? {
              code: "ecb_history_rebuilt",
              counts: { days: rebuilt.days, calendar: rebuilt.calendar.length },
            }
          : { code: "ecb_history_damaged" },
      findings: ecbFindings(rebuilt),
    };
  }
  const result = await updateEcbHistory({ source: source(), store }, options);
  return {
    state: "done",
    outcome: {
      code: result.kind === "accepted" ? "ecb_updated" : "ecb_update_rejected",
      counts: {
        undone: recovered === "undone" ? 1 : 0,
        ...(result.kind === "accepted"
          ? { new_days: result.newDays, calendar: result.calendar.length }
          : { conflicts: result.total }),
      },
    },
    findings: ecbFindings(result),
  };
};
