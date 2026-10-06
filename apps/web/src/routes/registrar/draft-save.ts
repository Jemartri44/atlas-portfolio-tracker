// "Guardar como borrador" from a form (feature 012, block 5; in the cloud since
// feature 027): the check is the domain's, the draft goes to the cloud, and the
// three ways it can end are said — saved, refused (a refusal of the operation, in
// its field or by the button), or not known because the answer was lost.
//
// A lost answer is retried with the **same** draft: its id is fixed before
// sending and kept here while the form does not change, so a retry is never a
// second draft.

import type { LedgerState } from "@atlas/domain";
import type { PendingDraft } from "@atlas/domain/ecb";
import { useNavigate } from "@solidjs/router";
import type { Accessor } from "solid-js";
import type { WebHistory } from "../../ecb/history.js";
import type { EventFormSpec, FormValues } from "../../view-models/forms/index.js";
import { toDraft } from "../../view-models/forms/index.js";
import type { FormProblems } from "./form-problems.js";
import { draftStep } from "./write-step.js";

export const createDraftSaver = (
  spec: EventFormSpec,
  state: LedgerState,
  currentValues: Accessor<FormValues>,
  web: Accessor<WebHistory | undefined>,
  problems: FormProblems,
  setSignedOut: (signedOut: boolean) => void,
): (() => Promise<void>) => {
  const navigate = useNavigate();
  const { readable, place, setProblem, setFailure } = problems;
  // The draft of a save whose answer was lost, with the form it was sent from.
  let unsettled: { form: string; draft: PendingDraft } | undefined;

  return async () => {
    setProblem(undefined);
    setFailure(undefined);
    setSignedOut(false);
    const values = currentValues();
    if (!readable(values)) {
      return;
    }
    const form = JSON.stringify(values);
    try {
      const saved = await draftStep(
        toDraft(spec, values, state),
        web(),
        unsettled?.form === form ? unsettled.draft : undefined,
      );
      if (saved.ok) {
        unsettled = undefined;
        navigate(`/registrar/borradores?guardado=${saved.value.id}`);
      } else if (saved.failure.kind === "signed_out") {
        setSignedOut(true);
      } else if (saved.failure.kind === "unknown") {
        unsettled = { form, draft: saved.failure.draft };
        setProblem(
          "No sabemos si se ha guardado el borrador: la conexión falló justo al enviarlo. Pulsa «Guardar como borrador» otra vez: se envía el mismo y no se duplica.",
        );
      } else {
        setFailure(saved.failure.error);
      }
    } catch (refusal) {
      place(refusal, values);
    }
  };
};
