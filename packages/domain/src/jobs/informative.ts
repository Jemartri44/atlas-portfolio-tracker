// The thresholds of the Modelo 720 and the Modelo 721 (feature 016, E4;
// `docs/specification.md` §9.5; mutant 31). Decided **with the function the
// models use** (`fiscalAttention`, which reads the informative returns of
// `informative/`), and so **from manual valuations only**: no automatic
// close reaches it, by structure (the 013's guardians, and this file's in
// `tests/jobs-access.test.ts`). It takes the ledger and the day, and nothing
// else — there is no argument through which a price could come in.
//
// What there is to do for the year that just ended is what the summary of the
// web already raises: a model that obliges and is not filed, one that cannot
// be decided yet, or one close enough to the threshold that the user asked to
// be told (`model_720_alert_threshold_eur`, `model_721_alert_threshold_eur`).
// The mail says it **neutrally** (questions §13): which model to look at,
// never a figure nor whether a threshold is passed.

import { type CivilDate, yearOf } from "../dates/civil-date.js";
import { fiscalAttention } from "../informative/attention.js";
import type { LedgerEvent } from "../schema/events.js";
import type { InformativeModel } from "../settings/settings.js";

export interface InformativeFacts {
  readonly year: number;
  /** The ledger has invalid events: the models are not computed at all. */
  readonly invalid: boolean;
  /** The models with something to do for `year`, each once, in order. */
  readonly models: readonly InformativeModel[];
}

export const informativeFacts = (input: {
  readonly events: readonly LedgerEvent[];
  readonly today: CivilDate;
}): InformativeFacts => {
  const year = yearOf(input.today) - 1;
  const attention = fiscalAttention(input.events, input.today);
  const models = new Set(
    attention.todo.filter((todo) => todo.year === year).map((todo) => todo.model),
  );
  return {
    year,
    invalid: attention.invalid_events > 0,
    models: (["720", "721"] as const).filter((model) => models.has(model)),
  };
};
