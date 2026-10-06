// What "Registrar" and "Guardar como borrador" ask, in one place: the form is
// long enough already (decision (g) of prompt 007).
//
// Writing records the event, or corrects the original, or — when the form came
// from a draft — confirms the draft (`ledger/drafts.ts`): all go to the cloud
// with their ids fixed beforehand (`ledger/write.ts`).

import type { PendingDraft } from "@atlas/domain/ecb";
import type { WebHistory } from "../../ecb/history.js";
import type { SaveResult } from "../../ledger/drafts.js";
import { correct, recordDraft, type WriteResult } from "../../ledger/write.js";
import type { toDraft } from "../../view-models/forms/index.js";
import { doneUrl } from "../movimientos/Rectified.jsx";

type Draft = ReturnType<typeof toDraft>;

/** Writes; on success, the address of the movement written, to go to. */
export const writeStep = async (
  draft: Draft,
  target: { correcting?: { id: string } | undefined; fromDraft?: { id: string } | undefined },
  reason: string,
  confirmDuplicate: boolean,
): Promise<WriteResult<string>> => {
  if (target.fromDraft !== undefined) {
    // A draft: the id stamped before writing, the event written with it, and
    // the draft closed after (`ledger/drafts.ts`). A draft closed elsewhere
    // meanwhile is refused there: never recorded as a new operation.
    const { confirmDraft } = await import("../../ledger/drafts.js");
    return confirmDraft(
      target.fromDraft.id,
      draft as unknown as Record<string, unknown>,
      confirmDuplicate,
    );
  }
  const result =
    target.correcting === undefined
      ? await recordDraft(draft, { confirmDuplicate })
      : await correct(target.correcting.id, draft, reason, { confirmDuplicate });
  if (!result.ok) {
    return result;
  }
  // To the movement written, with what was done and, for a past tax year, the
  // warning: the reload that follows the write cannot take them away.
  const priorYear = "priorYear" in result.value && result.value.priorYear;
  const done = target.correcting === undefined ? "registrado" : "corregido";
  return { ok: true, value: doneUrl(result.value.event.id, done, priorYear) };
};

/** Keeps the operation as a draft in the cloud. Refusals of the operation are thrown. */
export const draftStep = async (
  draft: Draft,
  web: WebHistory | undefined,
  again?: PendingDraft,
): Promise<SaveResult> => {
  const { saveDraft } = await import("../../ledger/drafts.js");
  return saveDraft(draft as unknown as Record<string, unknown>, web, again);
};
