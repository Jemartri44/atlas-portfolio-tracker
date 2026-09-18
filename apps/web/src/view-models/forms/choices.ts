// What a select of a form offers, with the values it has now — and what it
// stops offering when another field changes. Pure, like the rest of the
// view-models: the form component only paints what this returns.

import type { CivilDate, LedgerState } from "@atlas/domain";
import type { Option } from "../../components/Field.jsx";
import { valueLabel } from "../../format/labels.js";
import { optionsFor } from "../options.js";
import type { FieldSpec } from "./specs.js";

/** The options a select field offers with these values: literal ones or a list of the ledger. */
export const selectOptions = (
  field: FieldSpec,
  state: LedgerState,
  values: Record<string, string>,
  date: CivilDate,
): Option[] =>
  field.values !== undefined
    ? field.values.map((entry) => ({ value: entry, label: valueLabel(entry) }))
    : optionsFor(field.options ?? "accounts", { state, date, values }, field);

/**
 * Empties a choice the list no longer offers. Choosing a bucket account after a
 * core fund used to leave the fund selected underneath a list that no longer
 * showed it: the form looked empty and would have sent the fund.
 */
export const withoutStale = (
  fields: readonly FieldSpec[],
  state: LedgerState,
  values: Record<string, string>,
  date: CivilDate,
): Record<string, string> => {
  const next = { ...values };
  for (const field of fields) {
    const chosen = next[field.name] ?? "";
    if (field.bookFrom === undefined || chosen === "") {
      continue;
    }
    if (!selectOptions(field, state, next, date).some((option) => option.value === chosen)) {
      next[field.name] = "";
    }
  }
  return next;
};
