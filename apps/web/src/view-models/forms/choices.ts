// What a select of a form offers, with the values it has now — and what it
// stops offering when another field changes. Pure, like the rest of the
// view-models: the form component only paints what this returns.

import type { CivilDate, LedgerState } from "@atlas/domain";
import type { Option } from "../../components/Field.jsx";
import { valueLabel } from "../../format/labels.js";
import { bookOf, optionsFor } from "../options.js";
import type { FieldSpec } from "./specs.js";

/**
 * The options a select field offers with these values: literal ones or a list
 * of the ledger. An asset the form **already holds** stays on its list even when
 * the list would leave it out — a correction of the sale of a fund given up
 * since then must still show that fund — as long as it is of the right book.
 */
export const selectOptions = (
  field: FieldSpec,
  state: LedgerState,
  values: Record<string, string>,
  date: CivilDate,
): Option[] => {
  if (field.values !== undefined) {
    return field.values.map((entry) => ({ value: entry, label: valueLabel(entry) }));
  }
  const options = optionsFor(field.options ?? "accounts", { state, date, values }, field);
  const chosen = state.assets.get(values[field.name] ?? "");
  const book = field.bookFrom === undefined ? undefined : bookOf(state, values[field.bookFrom]);
  if (
    field.options !== "assets" ||
    chosen === undefined ||
    options.some((option) => option.value === chosen.asset_id) ||
    (book !== undefined && chosen.book !== book)
  ) {
    return options;
  }
  return [
    ...options,
    {
      value: chosen.asset_id,
      label: chosen.name,
      hint: `${valueLabel(chosen.asset_type)} · dado de baja`,
    },
  ];
};

/**
 * Empties a choice the list no longer offers **after the field it depends on
 * changed**. Choosing a bucket account after a core fund used to leave the fund
 * selected underneath a list that no longer showed it: the form looked empty
 * and would have sent the fund. Only the fields that read the one just changed
 * are looked at, so typing an amount never empties anything.
 */
export const withoutStale = (
  fields: readonly FieldSpec[],
  state: LedgerState,
  values: Record<string, string>,
  date: CivilDate,
  changed: string,
): Record<string, string> => {
  const next = { ...values };
  for (const field of fields) {
    const chosen = next[field.name] ?? "";
    if (chosen === "" || (field.bookFrom !== changed && field.heldFrom !== changed)) {
      continue;
    }
    const offered = optionsFor(field.options ?? "accounts", { state, date, values: next }, field);
    if (!offered.some((option) => option.value === chosen)) {
      next[field.name] = "";
    }
  }
  return next;
};
