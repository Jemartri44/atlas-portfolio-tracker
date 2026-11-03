// The integrity findings, in Spanish.
//
// The verification screen used to print a Spanish title and then the domain's
// **English** message underneath. A check whose whole purpose is to be read when
// something has gone wrong is useless in a language the reader may not have,
// and that is exactly the moment it has to be clear.
//
// Each code gets three things: what it means, what to do about it, and how bad
// it is. The domain's own message keeps the evidence — which asset, which line,
// which identifier — and stays available folded away, like the code of an
// `AppError`: the explanation is Spanish, the evidence is raw.

import type { IntegrityFinding } from "@atlas/domain";
import { FINDINGS } from "@atlas/domain/messages";
import type { Prose } from "../privacy.js";
import { webVoice } from "./voice.js";

export interface FindingText {
  /** What it means, in one line. */
  what: string;
  /** What to do about it. */
  todo: string;
}

/**
 * Spanish text of a finding: from the shared catalogue. The texts
 * carry no figures, so the mask is on by default.
 */
export const describeFinding = (
  finding: IntegrityFinding,
  prose: Prose = { privacy: true },
): FindingText => {
  const entry = FINDINGS[finding.code];
  if (entry === undefined) {
    return {
      what: "La verificación ha encontrado algo que esta versión todavía no sabe explicar.",
      todo: "Este hallazgo no tiene explicación escrita todavía: el detalle técnico de abajo es lo que hay.",
    };
  }
  const voice = webVoice(prose);
  const details = finding.details ?? {};
  return {
    what: entry.what(details, voice, finding.message),
    todo: entry.todo(details, voice, finding.message),
  };
};
