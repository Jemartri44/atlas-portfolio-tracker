// From what the user typed to `CorporateActionParams`, which is what the domain
// composes the effects from.
//
// A pure function, so it is tested without painting anything — and so the one
// piece of judgement it contains is visible: **filling the price of the
// leftovers is what asks for a forced sale**. Leaving it empty means the issuer
// settled nothing, and the domain then produces no sale at all.
//
// Numbers are read like every other number of the application
// (`format/input.ts`): `1.200,50` is twelve hundred, `1.5` is refused.

import type { CorporateActionParams } from "@atlas/domain";
import { parseDecimalInput } from "../../../format/input.js";
import type { CorporateForm } from "../../../view-models/forms/corporate.js";
import type { FormValues } from "../../../view-models/forms/index.js";
import { normaliseDecimal } from "../../../view-models/forms/index.js";

/** The accounts a fee line may name: by their name, which is what the user knows. */
export interface NamedAccount {
  account_id: string;
  name: string;
}

const text = (values: FormValues, name: string): string | undefined => {
  const raw = (values[name] ?? "").trim();
  return raw === "" ? undefined : raw;
};

const decimal = (values: FormValues, name: string): string | undefined => {
  const raw = text(values, name);
  return raw === undefined ? undefined : normaliseDecimal(raw);
};

/** A ratio as the domain takes it: a fraction as written, a decimal read the Spanish way. */
const ratioOf = (values: FormValues): string | undefined => {
  const raw = text(values, "ratio");
  return raw === undefined || raw.includes("/") ? raw : normaliseDecimal(raw);
};

/** The account a fee line names, by its name or its identifier, ignoring case. */
const accountNamed = (accounts: readonly NamedAccount[], typed: string): string | undefined => {
  const wanted = typed.trim().toLowerCase();
  return accounts.find(
    (account) =>
      account.name.toLowerCase() === wanted || account.account_id.toLowerCase() === wanted,
  )?.account_id;
};

const lines = (raw: string): string[] =>
  raw
    .split(/[\n;]/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

/**
 * What is wrong with the fee lines, or nothing. A fee that cannot be read is
 * **refused**, never skipped: a skipped fee overstates the gain of the forced
 * sale, and the user would pay tax on money they never received.
 */
export const feeLinesError = (
  values: FormValues,
  accounts: readonly NamedAccount[],
): string | undefined => {
  const raw = text(values, "cash_fees");
  if (raw === undefined || text(values, "cash_unit_price") === undefined) {
    return undefined;
  }
  for (const line of lines(raw)) {
    const [account = "", amount = "", extra] = line.split("=");
    if (extra !== undefined || account.trim() === "" || amount.trim() === "") {
      return `No se entiende «${line}»: escribe una cuenta y su comisión, así: «Cubo especulativo = 1,50».`;
    }
    if (accountNamed(accounts, account) === undefined) {
      return `No hay ninguna cuenta llamada «${account.trim()}».`;
    }
    const parsed = parseDecimalInput(amount);
    if (!parsed.ok) {
      return `La comisión de «${account.trim()}»: ${parsed.message}`;
    }
  }
  return undefined;
};

/** The per-account fees, **one pair per line**: `cuenta = importe`. */
const feesOf = (
  values: FormValues,
  accounts: readonly NamedAccount[],
): Record<string, string> | undefined => {
  const raw = text(values, "cash_fees");
  if (raw === undefined) {
    return undefined;
  }
  const fees: Record<string, string> = {};
  for (const line of lines(raw)) {
    const [account = "", amount = ""] = line.split("=");
    const id = accountNamed(accounts, account);
    if (id !== undefined && amount.trim() !== "") {
      fees[id] = normaliseDecimal(amount);
    }
  }
  return Object.keys(fees).length === 0 ? undefined : fees;
};

export const toCorporateParams = (
  form: CorporateForm,
  values: FormValues,
  /** Required: without the accounts a fee line cannot be resolved, and a lost fee overstates the gain. */
  accounts: readonly NamedAccount[],
): CorporateActionParams => {
  const price = decimal(values, "cash_unit_price");
  const fees = feesOf(values, accounts);
  const ratio = ratioOf(values);
  return {
    kind: form.kind,
    asset_id: values.asset_id ?? "",
    effective_date: values.effective_date ?? "",
    source_document: (values.source_document ?? "").trim(),
    ...(text(values, "notes") === undefined ? {} : { notes: text(values, "notes") as string }),
    ...(text(values, "to_asset_id") === undefined
      ? {}
      : { to_asset_id: text(values, "to_asset_id") as string }),
    ...(ratio === undefined ? {} : { ratio }),
    ...(decimal(values, "cost_share") === undefined
      ? {}
      : { cost_share: decimal(values, "cost_share") as string }),
    ...(fees === undefined ? {} : { fees }),
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
