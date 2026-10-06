// What "Registrar" asks, in one place: the form is long enough already
// (decision (g) of prompt 007).
//
// Writing records the event, or corrects the original: both go to the cloud
// with their ids fixed beforehand (`ledger/write.ts`).

import { correct, recordDraft, type WriteResult } from "../../ledger/write.js";
import type { toDraft } from "../../view-models/forms/index.js";
import { doneUrl } from "../movimientos/Rectified.jsx";

type Draft = ReturnType<typeof toDraft>;

/** Writes; on success, the address of the movement written, to go to. */
export const writeStep = async (
  draft: Draft,
  target: { correcting?: { id: string } | undefined },
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
  // To the movement written, with what was done and, for a past tax year, the
  // warning: the reload that follows the write cannot take them away.
  const priorYear = "priorYear" in result.value && result.value.priorYear;
  const done = target.correcting === undefined ? "registrado" : "corregido";
  return { ok: true, value: doneUrl(result.value.event.id, done, priorYear) };
};
