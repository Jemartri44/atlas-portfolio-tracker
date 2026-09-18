// From what the user typed to `CorporateActionParams`, which is what the domain
// composes the effects from.
//
// A pure function, so it is tested without painting anything — and so the one
// piece of judgement it contains is visible: **filling the price of the
// leftovers is what asks for a forced sale**. Leaving it empty means the issuer
// settled nothing, and the domain then produces no sale at all.

import type { CorporateActionParams } from "@atlas/domain";
import type { CorporateForm } from "../../../view-models/forms/corporate.js";
import type { FormValues } from "../../../view-models/forms/index.js";
import { normaliseDecimal } from "../../../view-models/forms/index.js";

const text = (values: FormValues, name: string): string | undefined => {
  const raw = (values[name] ?? "").trim();
  return raw === "" ? undefined : raw;
};

const decimal = (values: FormValues, name: string): string | undefined => {
  const raw = text(values, name);
  return raw === undefined ? undefined : normaliseDecimal(raw);
};

export const toCorporateParams = (
  form: CorporateForm,
  values: FormValues,
): CorporateActionParams => {
  const price = decimal(values, "cash_unit_price");
  return {
    kind: form.kind,
    asset_id: values.asset_id ?? "",
    effective_date: values.effective_date ?? "",
    source_document: (values.source_document ?? "").trim(),
    ...(text(values, "notes") === undefined ? {} : { notes: text(values, "notes") as string }),
    ...(text(values, "to_asset_id") === undefined
      ? {}
      : { to_asset_id: text(values, "to_asset_id") as string }),
    ...(text(values, "ratio") === undefined ? {} : { ratio: text(values, "ratio") as string }),
    ...(decimal(values, "cost_share") === undefined
      ? {}
      : { cost_share: decimal(values, "cost_share") as string }),
    ...(price === undefined
      ? {}
      : {
          cash: {
            unit_price: price,
            currency: values.cash_currency ?? "EUR",
            fx_rate: decimal(values, "cash_fx_rate") ?? "1",
            fx_rate_date: values.cash_fx_rate_date ?? values.effective_date ?? "",
          },
        }),
  };
};
