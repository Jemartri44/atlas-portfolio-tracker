// What "Registrar" and "Guardar como borrador" ask, in one place: the form is
// long enough already (decision (g) of prompt 007).
//
// Writing records the event, or corrects the original, and — when the form
// came from a draft — removes the draft **after** the record is written: a
// cut in between leaves it in both places, and recording the draft again is
// caught by the duplicate fingerprint (feature 012, block 5; ADR-0012).

import type { WebHistory } from "../../ecb/history.js";
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
  const result =
    target.correcting === undefined
      ? await recordDraft(draft, { confirmDuplicate })
      : await correct(target.correcting.id, draft, reason, { confirmDuplicate });
  if (!result.ok) {
    return result;
  }
  if (target.fromDraft !== undefined) {
    await (await import("../../ledger/draft-store.js")).discardDraft(target.fromDraft.id);
  }
  // To the movement written, with what was done and, for a past tax year, the
  // warning: the reload that follows the write cannot take them away.
  const priorYear = "priorYear" in result.value && result.value.priorYear;
  const done = target.correcting === undefined ? "registrado" : "corregido";
  return { ok: true, value: doneUrl(result.value.event.id, done, priorYear) };
};

/** Keeps the operation as a draft; the address of the list, to go to. Refusals are thrown. */
export const draftStep = async (draft: Draft, web: WebHistory | undefined): Promise<string> => {
  const { saveDraft } = await import("../../ledger/drafts.js");
  const saved = await saveDraft(draft as unknown as Record<string, unknown>, web);
  return `/registrar/borradores?guardado=${saved.id}`;
};
