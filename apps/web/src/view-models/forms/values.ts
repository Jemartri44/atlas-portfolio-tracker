// From what the user typed to the draft the domain validates, and back.
//
// Two rules that matter more than they look:
//   1. An empty optional field is **left out** of the draft, never sent as "".
//      `docs/data-schema.md` §2: an absent field is absent, and the loader
//      rejects a field the type does not define.
//   2. What the user types is read the way a Spanish keyboard writes it
//      (`format/input.ts`: comma decimal, dots for thousands, anything
//      ambiguous refused with a sentence). No rounding, no completion, no
//      guessing: the domain decides whether the value is acceptable.

import { type Draft, isCivilDate, lastWorkingDay, type SupportedEvent } from "@atlas/domain";
import { decimalForInput, parseDecimalInput, parseIntegerInput } from "../../format/input.js";
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

/**
 * A decimal as the user types it, as the ledger stores it. What cannot be read
 * comes back as typed, so the domain still refuses it — but a form never gets
 * that far: `inputErrors` stops it first, next to the field.
 */
export const normaliseDecimal = (raw: string): string => {
  const parsed = parseDecimalInput(raw);
  return parsed.ok ? parsed.value : raw.trim();
};

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
    const parsed = parseIntegerInput(text);
    return parsed.ok ? Number.parseInt(parsed.value, 10) : text;
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

/**
 * Values of an existing event, to correct it: the draft it came from, as text
 * **the way the user types it** — `1.0672` becomes `1,0672`, or the rule that
 * refuses an ambiguous point would refuse the event's own values.
 */
export const valuesOfEvent = (spec: EventFormSpec, event: Record<string, unknown>): FormValues => {
  const values = initialValues(spec);
  for (const field of spec.fields) {
    const current = event[field.name];
    if (current === undefined) {
      values[field.name] = field.kind === "switch" ? "false" : "";
      continue;
    }
    values[field.name] =
      field.kind === "decimal" && typeof current === "string"
        ? decimalForInput(current)
        : String(current);
  }
  return values;
};

/**
 * What the form can tell before asking the domain: a number it cannot read,
 * said in Spanish **on the field**. Keyed by field name; empty when all is
 * readable. Hidden fields are not the user's to fix, so they are not checked.
 */
export const inputErrors = (
  fields: readonly FieldSpec[],
  values: FormValues,
): Record<string, string> => {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const raw = (values[field.name] ?? "").trim();
    if (raw === "" || !isVisible(field, values)) {
      continue;
    }
    const parsed =
      field.kind === "decimal"
        ? parseDecimalInput(raw)
        : field.kind === "integer"
          ? parseIntegerInput(raw)
          : undefined;
    if (parsed !== undefined && !parsed.ok) {
      errors[field.name] = parsed.message;
    }
  }
  return errors;
};

/**
 * Why "Ver el efecto" is disabled, in one sentence for the bar the button
 * lives in: the labels of what is missing, or nothing when nothing is.
 */
export const missingSentence = (fields: readonly FieldSpec[], missing: readonly string[]) =>
  missing.length === 0
    ? undefined
    : `Para ver el efecto ${missing.length === 1 ? "falta" : "faltan"}: ${missing
        .map((name) => fields.find((field) => field.name === name)?.label ?? name)
        .join(", ")}.`;

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
