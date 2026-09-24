// The ECB rate of a form (feature 012, block 3): what the history proposes
// for the rate fields the user has not touched, and which typed rates need an
// explicit confirmation. The rules are the domain's (`@atlas/domain/ecb`);
// this only turns them into form values and sentences. Loaded with the forms,
// never at boot.

import type { CivilDate, LedgerState } from "@atlas/domain";
import {
  type EcbHistory,
  proposeRates,
  rateConfirmations,
  unpublishedRates,
} from "@atlas/domain/ecb";
import { decimalForInput } from "../../format/input.js";
import type { EventFormSpec } from "./specs.js";
import { type FormValues, toDraft } from "./values.js";

export type RateHint =
  | {
      kind: "proposed";
      currency: string;
      rate: string;
      date: CivilDate;
      reference: CivilDate;
      basis: "fiscal" | "business";
    }
  | { kind: "waiting"; currency: string; reference: CivilDate; latest: CivilDate }
  | { kind: "none" };

/**
 * The values with the proposal of the history in `fx_rate` and `fx_rate_date`,
 * when the currency is not the euro and the user has not typed either. With
 * nothing to propose, the "1" a foreign currency would otherwise keep from the
 * euro's default is taken away: no rate is made up.
 */
export const proposedValues = (
  spec: EventFormSpec,
  values: FormValues,
  state: LedgerState,
  history: EcbHistory | undefined,
  staleDays: number,
): { values: FormValues; hint: RateHint } => {
  const hasRate = spec.fields.some((field) => field.name === "fx_rate");
  const currency = values.currency ?? "";
  if (!hasRate || currency === "" || currency === "EUR") {
    return { values, hint: { kind: "none" } };
  }
  const blank = { ...values, fx_rate: "", fx_rate_date: "" };
  const draft = toDraft(spec, blank, state) as unknown as Record<string, unknown>;
  const { draft: proposed, proposed: list } = proposeRates(history, state, draft, staleDays);
  const official = list[0];
  if (official !== undefined && official.resolution.kind === "resolved") {
    return {
      values: {
        ...values,
        fx_rate: decimalForInput(String(proposed.fx_rate)),
        fx_rate_date: String(proposed.fx_rate_date),
      },
      hint: {
        kind: "proposed",
        currency,
        rate: official.resolution.rate,
        date: official.resolution.date,
        reference: official.point.reference,
        basis: official.point.basis,
      },
    };
  }
  const waiting = unpublishedRates(history, state, draft, staleDays)[0];
  return {
    values: blank,
    hint:
      waiting !== undefined && waiting.resolution.kind === "not_yet_published"
        ? {
            kind: "waiting",
            currency,
            reference: waiting.point.reference,
            latest: waiting.resolution.latest,
          }
        : { kind: "none" },
  };
};

export interface RateToConfirm {
  currency: string;
  typed: string;
  typedDate?: CivilDate;
  official: string;
  officialDate: CivilDate;
  reference: CivilDate;
  basis: "fiscal" | "business";
}

/** The typed rates that are not the official one of a conclusive history: each asks for a yes. */
export const ratesToConfirm = (
  spec: EventFormSpec,
  values: FormValues,
  state: LedgerState,
  history: EcbHistory | undefined,
  staleDays: number,
): RateToConfirm[] =>
  rateConfirmations(history, state, toDraft(spec, values, state) as never, staleDays).map(
    ({ point, official }) => ({
      currency: point.currency,
      typed: point.rate as string,
      ...(point.rate_date === undefined ? {} : { typedDate: point.rate_date }),
      official: official.rate,
      officialDate: official.date,
      reference: point.reference,
      basis: point.basis,
    }),
  );
