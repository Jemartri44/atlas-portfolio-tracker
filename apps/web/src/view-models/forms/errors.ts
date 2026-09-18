// A refusal of the domain, put **on the field** it is about.
//
// The domain answers a bad draft with a code and the field it tripped on
// (`invalid_field`, `field: "amount"`). The form used to paint that answer at
// the top of the page, 667 px above the button the user had just pressed, as
// "El dominio rechaza este evento — El campo amount de buy no es válido": the
// wrong place, the wrong words and an identifier of the schema. Here the field
// is found among the ones the form shows and the sentence is written for a
// person; what cannot be tied to a field goes next to the button instead.

import { DomainError } from "@atlas/domain";
import { fieldLabel } from "../../format/labels.js";
import type { FieldSpec } from "./specs.js";
import { type FormValues, isVisible } from "./values.js";

export interface FieldError {
  /** Name of the field of the form, exactly as in the spec. */
  field: string;
  message: string;
}

type Details = Record<string, unknown>;

/** The last segment of a path the domain qualified: `effects[0].ratio` → `ratio`. */
const bare = (name: unknown): string | undefined =>
  typeof name === "string" ? name.replace(/^.*[.\]]/, "") : undefined;

/** Fields the refusal may be about, most specific first. */
const candidatesOf = (error: DomainError): string[] => {
  const d = error.details as Details;
  const named = [bare(d.field), ...(Array.isArray(d.fields) ? d.fields.map(bare) : [])];
  const byCode: Record<string, string[]> = {
    missing_basis: ["unit_price", "amount"],
    invalid_amount: ["amount", "amount_eur", "gross"],
    invalid_quantity: ["quantity", "quantity_out", "quantity_in"],
  };
  // `value_date` before `trade_date`: the domain names both dates, not a field.
  const dates = d.value_date !== undefined && d.trade_date !== undefined ? ["value_date"] : [];
  return [...named, ...(byCode[error.code] ?? []), ...dates].filter(
    (name): name is string => name !== undefined,
  );
};

/** A number the domain refused: said by what is wrong with it, not by the rule's name. */
const numberProblem = (value: unknown): string => {
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
    return value.startsWith("-")
      ? "No puede ser negativo."
      : /^0+(\.0+)?$/.test(value)
        ? "Tiene que ser mayor que cero."
        : "Este valor no se admite aquí.";
  }
  return "No es un número válido.";
};

const messageOf = (error: DomainError, spec: FieldSpec, fields: readonly FieldSpec[]): string => {
  const d = error.details as Details;
  switch (error.code) {
    case "missing_field":
      return "Falta este dato.";
    case "missing_basis":
      return "Indica el precio unitario o el importe liquidado: uno de los dos es la base de la operación.";
    case "fx_rate_date_weekend":
      return "Cae en fin de semana y el BCE no publica: usa el último día hábil anterior.";
    case "eur_fx_rate_not_one":
      return "Con el euro, el tipo es exactamente 1.";
    default:
      break;
  }
  if (Array.isArray(d.fields)) {
    const names = d.fields.map(
      (name) => `«${fields.find((f) => f.name === name)?.label ?? fieldLabel(String(name))}»`,
    );
    return `Indica uno de los dos, ${names.join(" o ")}, y solo uno.`;
  }
  if (d.value_date !== undefined && d.trade_date !== undefined) {
    return "La fecha valor no puede ser anterior a la de contratación.";
  }
  if (spec.kind === "decimal" || spec.kind === "integer") {
    return numberProblem(d.value);
  }
  return spec.kind === "date" ? "No es una fecha válida." : "Este valor no se admite aquí.";
};

/** The errors that still apply after an edit: a message was about the old value. */
export const errorsAfterEdit = (
  errors: Readonly<Record<string, string>>,
  before: FormValues,
  after: FormValues,
): Record<string, string> =>
  Object.fromEntries(Object.entries(errors).filter(([name]) => before[name] === after[name]));

/**
 * The field a refusal is about, among the ones **visible** now, with the
 * sentence to put under it; `undefined` when it is not about one field — an
 * insufficient position, a closed order — and belongs next to the button.
 */
export const fieldErrorOf = (
  error: unknown,
  fields: readonly FieldSpec[],
  values: FormValues,
): FieldError | undefined => {
  if (!(error instanceof DomainError)) {
    return undefined;
  }
  const visible = fields.filter((field) => isVisible(field, values));
  for (const name of candidatesOf(error)) {
    const spec = visible.find((field) => field.name === name);
    if (spec !== undefined) {
      return { field: spec.name, message: messageOf(error, spec, fields) };
    }
  }
  return undefined;
};
