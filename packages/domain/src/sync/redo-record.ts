// Redoing what the sync held back, with the rule of `correctEvent` (feature
// 015, E3, block 5, point 4; §7 P6, option (a); decision D-Q1): a redo is
// refused only for what **it** leaves invalid, never for an event that was
// already invalid — a held pair may leave the local ledger so, and the user
// must always be able to get out. **The exception is bound to the sealed
// plan, not to a flag** (§7.1 bis, N1): this function takes the `RedoPlan`
// and the event, and records only an event that carries **exactly** the id
// sealed for it and the type of its draft. A flag on the ordinary form of
// recording could not tell «from the redo» from «from recording»; an
// architecture test watches who imports this function.
//
// Only plans of a line (`record`) and of a lone reversal (`reverse`): a
// correction goes by `correctEvent` with its sealed ids (`sealedIds`), which
// already has this rule. Outside the redo, `recordEvent` does not change.

import { DuplicateFingerprintError, ValidationError } from "../errors.js";
import { projectLedger } from "../projections/project-ledger.js";
import type { SupportedEvent } from "../schema/events.js";
import type { UseCaseDeps } from "../usecases/deps.js";
import { checkIsinUnique, duplicatesOf } from "../usecases/record-event.js";
import { checkCandidate, findTarget } from "../usecases/rectify.js";
import type { RedoPlan } from "./resolve.js";

export interface RedoRecordOptions {
  /** The explicit yes to a repeated fingerprint (ADR-0012), as when recording. */
  readonly confirmDuplicate?: boolean;
}

export const recordRedo = async (
  deps: UseCaseDeps,
  plan: RedoPlan,
  event: SupportedEvent,
  options: RedoRecordOptions = {},
): Promise<{ readonly event: SupportedEvent; readonly etag: string }> => {
  if (plan.kind === "correct") {
    throw new ValidationError(
      "redo_plan_not_recordable",
      "a correction is redone by correctEvent with its sealed ids",
      { kind: plan.kind },
    );
  }
  if (event.id !== plan.id) {
    throw new ValidationError(
      "redo_id_mismatch",
      "the event does not carry the id sealed for the redo",
      {
        expected: plan.id,
        id: event.id,
      },
    );
  }
  if (event.type !== plan.draft.type) {
    throw new ValidationError("redo_type_mismatch", "the event is not of the type of the redo", {
      expected: plan.draft.type,
      type: event.type,
    });
  }
  const { events, etag } = await deps.store.load();
  if (plan.kind === "reverse") {
    findTarget(events, plan.target_id);
  }
  const candidate = [...events, event];
  // The rule of `correctEvent`: only what this event breaks refuses it.
  const state = checkCandidate(
    events,
    candidate,
    [event.id],
    plan.kind === "reverse" ? plan.target_id : event.id,
  );
  checkIsinUnique(state, event, () => projectLedger(events, { collectErrors: true }));
  const duplicates = duplicatesOf(state.fingerprints, event);
  if (duplicates.length > 0 && options.confirmDuplicate !== true) {
    throw new DuplicateFingerprintError((event as { fingerprint: string }).fingerprint, duplicates);
  }
  const appended = await deps.store.append([event], etag);
  return { event, etag: appended.etag };
};
