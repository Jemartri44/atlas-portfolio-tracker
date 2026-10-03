// The keys of the price sources in the cloud (feature 016, E2; ADR-0031,
// «Claves de API»; ADR-0034, row 21): two `SecureString` of SSM that the
// secrets script creates — `/atlas/<env>/prices/eodhd-key` and
// `/atlas/<env>/prices/alpha-vantage-key` — read on **every run**, never kept
// in a variable of the function, never logged, never in a message: an error
// says the name of the source, never the value. A parameter that is not there
// is a source without a key (the case of `dev`, ADR-0034, row 2); one that is
// empty or has spaces is `price_key_invalid`. **Only the prices function
// reaches this module** (`tests/jobs-access.test.ts`, §8.2 B2).

import type { ParameterStore } from "./parameter-store.js";

export interface PriceKeys {
  readonly eodhd?: string;
  readonly alpha_vantage?: string;
}

export const priceKeyParameters = (ssmPrefix: string) => ({
  eodhd: `${ssmPrefix}prices/eodhd-key`,
  alpha_vantage: `${ssmPrefix}prices/alpha-vantage-key`,
});

/** A key that is there and cannot be one. Carries the source, never the value. */
export class PriceKeyInvalid extends Error {
  override readonly name = "PriceKeyInvalid";
  readonly code = "price_key_invalid";
  constructor(readonly source: "eodhd" | "alpha_vantage") {
    super(`the key of ${source} is not one`);
  }
}

export const readPriceKeys = async (
  parameters: ParameterStore,
  ssmPrefix: string,
): Promise<PriceKeys> => {
  const names = priceKeyParameters(ssmPrefix);
  const keys: { eodhd?: string; alpha_vantage?: string } = {};
  for (const source of ["eodhd", "alpha_vantage"] as const) {
    const value = await parameters.get(names[source]);
    if (value === undefined) {
      continue;
    }
    if (!/^[\x21-\x7e]{1,256}$/.test(value)) {
      throw new PriceKeyInvalid(source);
    }
    keys[source] = value;
  }
  return keys;
};
