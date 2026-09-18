// From what the user typed to the draft the domain validates, and back.
//
// Two rules that matter more than they look:
//   1. An empty optional field is **left out** of the draft, never sent as "".
//      `docs/data-schema.md` §2: an absent field is absent, and the loader
//      rejects a field the type does not define.
//   2. What the user types is normalised only in the obvious way (a decimal
//      comma becomes a point, spaces go). No rounding, no completion, no
//      guessing: the domain decides whether the value is acceptable.

import { type Draft, isCivilDate, lastWorkingDay, type SupportedEvent } from "@atlas/domain";
import type { EventFormSpec, FieldSpec } from "./specs.js";

export type FormValues = Record<string, string>;

/** Initial values of a form: the declared defaults, and nothing else. */
export const initialValues = (spec: EventFormSpec, today?: string): FormValues => {
  const values: FormValues = {};
  for (const field of spec.fields) {
    values[field.name] =
      field.initial ?? (field.kind === "date" && today !== undefined ? today : "");
  }
  return values;
};

/** Whether a field is shown right now, given what is filled in. */
export const isVisible = (field: FieldSpec, values: FormValues): boolean => {
  const condition = field.visibleWhen;
  if (condition === undefined) {
    return true;
  }
  const current = values[condition.field] ?? "";
  if (condition.equals !== undefined) {
    return current === condition.equals;
  }
  if (condition.notEquals !== undefined) {
    return current !== condition.notEquals;
  }
  return true;
};

/** A decimal as the user types it: comma or point, without spaces. */
export const normaliseDecimal = (raw: string): string =>
  raw.trim().replaceAll(" ", "").replace(",", ".");

const fieldValue = (field: FieldSpec, raw: string): string | boolean | number | undefined => {
  const text = raw.trim();
  if (field.kind === "switch") {
    return text === "true";
  }
  if (text === "") {
    return undefined;
  }
  if (field.kind === "decimal") {
    return normaliseDecimal(text);
  }
  if (field.kind === "integer") {
    return Number.parseInt(text, 10);
  }
  return text;
};

/**
 * What a hidden but still required field is worth: its `initial` if it has one
 * (the euro rate is "1"), or the last working day on or before the date of the
 * field it is filled from (`hiddenFrom`).
 *
 * It exists because of a real defect: `fx_rate_date` has no `initial`, so a
 * purchase in euros produced a draft **without** it and the domain rejected it
 * with `fx_rate_date is required`. Every operation in euros — buy, sell,
 * dividend, interest — was unrecordable from the web, and a test froze the
 * behaviour as if it were correct by checking that the field was absent
 * without checking that the draft was valid.
 */
const hiddenValue = (field: FieldSpec, values: FormValues): string => {
  if (field.hiddenFrom === undefined) {
    return field.initial ?? "";
  }
  const source = (values[field.hiddenFrom] ?? "").trim();
  return isCivilDate(source) ? lastWorkingDay(source) : "";
};

/**
 * The draft for the use case: the type, plus every visible field that has a
 * value. Hidden fields keep a value when they are required by the schema (the
 * euro exchange rate is "1" and its date comes from the operation's own date),
 * and are dropped when they are not.
 */
export const toDraft = (spec: EventFormSpec, values: FormValues): Draft<SupportedEvent> => {
  const draft: Record<string, unknown> = { type: spec.type };
  for (const field of spec.fields) {
    const raw = values[field.name] ?? "";
    const visible = isVisible(field, values);
    if (!visible && field.required !== true) {
      continue;
    }
    const value = fieldValue(field, visible ? raw : hiddenValue(field, values));
    if (value !== undefined) {
      draft[field.name] = value;
    }
  }
  return draft as unknown as Draft<SupportedEvent>;
};

/** Values of an existing event, to correct it: the draft it came from, as text. */
export const valuesOfEvent = (spec: EventFormSpec, event: Record<string, unknown>): FormValues => {
  const values = initialValues(spec);
  for (const field of spec.fields) {
    const current = event[field.name];
    if (current === undefined) {
      values[field.name] = field.kind === "switch" ? "false" : "";
      continue;
    }
    values[field.name] = typeof current === "boolean" ? String(current) : String(current);
  }
  return values;
};

/** Which fields the form requires and the user has left empty, for the local check. */
export const missingRequired = (spec: EventFormSpec, values: FormValues): string[] =>
  spec.fields
    .filter(
      (field) =>
        field.required === true &&
        field.kind !== "switch" &&
        isVisible(field, values) &&
        (values[field.name] ?? "").trim() === "",
    )
    .map((field) => field.name);
