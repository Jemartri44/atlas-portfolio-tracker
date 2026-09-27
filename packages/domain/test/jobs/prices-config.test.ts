// Feature 016, E2 (§8.2 M5, §8.1 P14 and §8.2 m3; mutants 13 and 17): the
// download of the cloud is configured by variables of the function, never by
// a `prices/config.json` of the bucket; the simulated source of `dev` stops
// the function in `prod`.

import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/errors.js";
import { cloudPriceConfigText, parseJobsConfig } from "../../src/jobs/config.js";
import { DEFAULT_PRICE_CONFIG, parsePriceConfig } from "../../src/quotes/config.js";

const PRICES_ENV = {
  ATLAS_ENV: "prod",
  ATLAS_DATA_BUCKET: "atlas-prod-data-x1",
  ATLAS_JOBS: "prices_update",
  ATLAS_JOB_MAX_RUN_SECONDS: "900",
  ATLAS_PRICE_SOURCES: "eodhd,alpha_vantage",
  ATLAS_PRICES_EODHD_DAILY_CALLS: "18",
  ATLAS_PRICES_ALPHA_VANTAGE_DAILY_CALLS: "23",
  ATLAS_PRICES_FAILURE_THRESHOLD: "3",
};

const reasonOf = (env: Record<string, string | undefined>): unknown => {
  try {
    parseJobsConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).details;
  }
  return "accepted";
};

describe("the configuration of the prices function (M5, P14)", () => {
  it("reads the order, the budgets and the threshold of the variables", () => {
    expect(parseJobsConfig(PRICES_ENV).prices).toEqual({
      sources: ["eodhd", "alpha_vantage"],
      dailyCalls: { eodhd: 18, alpha_vantage: 23 },
      failureThreshold: 3,
    });
    expect(
      parseJobsConfig({ ...PRICES_ENV, ATLAS_PRICE_SOURCES: "alpha_vantage" }).prices?.sources,
    ).toEqual(["alpha_vantage"]);
  });

  it("takes the simulated source in dev, and refuses it in prod (mutant 17)", () => {
    expect(
      parseJobsConfig({ ...PRICES_ENV, ATLAS_ENV: "dev", ATLAS_PRICE_SOURCES: "simulated" }).prices
        ?.sources,
    ).toBe("simulated");
    expect(reasonOf({ ...PRICES_ENV, ATLAS_PRICE_SOURCES: "simulated" })).toEqual({
      variable: "ATLAS_PRICE_SOURCES",
      reason: "simulated_in_prod",
    });
  });

  it("refuses what it does not understand, and budgets above the plans", () => {
    const cases: [Record<string, string | undefined>, unknown][] = [
      [
        { ...PRICES_ENV, ATLAS_PRICE_SOURCES: "eodhd,simulated" },
        { variable: "ATLAS_PRICE_SOURCES", reason: "unknown_source" },
      ],
      [
        { ...PRICES_ENV, ATLAS_PRICE_SOURCES: "yahoo" },
        { variable: "ATLAS_PRICE_SOURCES", reason: "unknown_source" },
      ],
      [
        { ...PRICES_ENV, ATLAS_PRICE_SOURCES: "eodhd,eodhd" },
        { variable: "ATLAS_PRICE_SOURCES", reason: "repeated_source" },
      ],
      [
        { ...PRICES_ENV, ATLAS_PRICE_SOURCES: undefined },
        { variable: "ATLAS_PRICE_SOURCES", reason: "missing" },
      ],
      [
        { ...PRICES_ENV, ATLAS_PRICES_EODHD_DAILY_CALLS: "21" },
        { variable: "ATLAS_PRICES_EODHD_DAILY_CALLS", reason: "above_ceiling" },
      ],
      [
        { ...PRICES_ENV, ATLAS_PRICES_ALPHA_VANTAGE_DAILY_CALLS: "26" },
        { variable: "ATLAS_PRICES_ALPHA_VANTAGE_DAILY_CALLS", reason: "above_ceiling" },
      ],
      [
        { ...PRICES_ENV, ATLAS_PRICES_EODHD_DAILY_CALLS: "-1" },
        { variable: "ATLAS_PRICES_EODHD_DAILY_CALLS", reason: "not_a_whole_number" },
      ],
      [
        { ...PRICES_ENV, ATLAS_PRICES_EODHD_DAILY_CALLS: "01" },
        { variable: "ATLAS_PRICES_EODHD_DAILY_CALLS", reason: "not_a_whole_number" },
      ],
      [
        { ...PRICES_ENV, ATLAS_PRICES_FAILURE_THRESHOLD: "0" },
        { variable: "ATLAS_PRICES_FAILURE_THRESHOLD", reason: "not_a_whole_number" },
      ],
      [
        { ...PRICES_ENV, ATLAS_PRICES_FAILURE_THRESHOLD: "31" },
        { variable: "ATLAS_PRICES_FAILURE_THRESHOLD", reason: "above_ceiling" },
      ],
      [
        { ...PRICES_ENV, ATLAS_JOBS: "ecb_update" },
        { variable: "ATLAS_PRICE_SOURCES", reason: "other_family" },
      ],
    ];
    for (const [env, details] of cases) {
      expect(reasonOf(env)).toEqual(details);
    }
    expect(
      reasonOf({
        ...PRICES_ENV,
        ATLAS_PRICES_EODHD_DAILY_CALLS: "0",
        ATLAS_PRICES_ALPHA_VANTAGE_DAILY_CALLS: "25",
      }),
    ).toBe("accepted");
  });

  it("gives parsePriceConfig the order, budgets and threshold, and the defaults by type", () => {
    const config = parsePriceConfig(
      cloudPriceConfigText(parseJobsConfig(PRICES_ENV).prices as never),
    );
    expect(config).toEqual({
      ...DEFAULT_PRICE_CONFIG,
      source_order: ["eodhd", "alpha_vantage"],
      daily_calls: { eodhd: 18, alpha_vantage: 23 },
      failure_threshold: 3,
    });
    const simulated = parsePriceConfig(
      cloudPriceConfigText({
        sources: "simulated",
        dailyCalls: { eodhd: 5, alpha_vantage: 7 },
        failureThreshold: 2,
      }),
    );
    expect(simulated).toMatchObject({
      source_order: ["eodhd"],
      daily_calls: { eodhd: 5, alpha_vantage: 0 },
      failure_threshold: 2,
    });
  });
});
