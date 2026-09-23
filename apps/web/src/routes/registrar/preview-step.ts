// What "Ver el efecto" asks the domain, in one place.
//
// Two questions, not one, and both before the confirmation: **what this write
// does** (the preview of the candidate, or of the pair a correction writes)
// and **which filed returns it reaches** (FR-018). The second one used to live
// inside the form; it is here because it is the same pair of calls whether the
// form is recording or correcting, and because a form is long enough already.

import type { EventPreview } from "@atlas/domain";
import type { ClosedYearImpact } from "@atlas/domain/fiscal";
import {
  closedYearsOfCorrection,
  closedYearsOfDraft,
  previewCorrectionDraft,
  previewDraft,
} from "../../ledger/write.js";
import type { toDraft } from "../../view-models/forms/index.js";

export interface PreviewStep {
  preview: EventPreview;
  closedYears: readonly ClosedYearImpact[];
}

/**
 * A correction is previewed **as it will be written**: the original reversed
 * and the corrected event in its place, never the two added together.
 */
export const previewStep = async (
  draft: ReturnType<typeof toDraft>,
  correcting: { id: string } | undefined,
  reason: string,
): Promise<PreviewStep> => ({
  preview:
    correcting === undefined
      ? await previewDraft(draft)
      : await previewCorrectionDraft(correcting.id, draft, reason),
  closedYears:
    correcting === undefined
      ? await closedYearsOfDraft(draft)
      : await closedYearsOfCorrection(correcting.id, draft, reason),
});
