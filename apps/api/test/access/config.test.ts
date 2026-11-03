// The configuration of the Lambda, read from its environment.

import { describe, expect, it } from "vitest";
import { API_CONFIG_CEILINGS, parseApiConfig } from "../../src/access/config.js";

describe("the configuration of the Lambda (R30)", () => {
  const ENV = {
    ATLAS_ENV: "dev",
    ATLAS_ORIGIN: "https://atlas.example",
    ATLAS_DATA_BUCKET: "atlas-dev-data-x1",
    ATLAS_SESSION_TTL_SECONDS: "28800",
    ATLAS_LOGIN_TTL_SECONDS: "600",
    ATLAS_CLOCK_TOLERANCE_SECONDS: "600",
    ATLAS_ACTIVE_JOB_FAMILIES: "ecb,prices,mail,backup,integrity",
    ATLAS_ALLOW_LIST_CACHE_SECONDS: "120",
    ATLAS_SECRETS_CACHE_SECONDS: "300",
    PATH: "/usr/bin",
  };
  const fails = (
    env: Record<string, string | undefined>,
    variable: string,
    reason: string,
  ): void => {
    expect(() => parseApiConfig(env)).toThrow(
      expect.objectContaining({ code: "api_config_invalid", details: { variable, reason } }),
    );
  };

  it("reads the whole of it, with the prefix of SSM of the environment", () => {
    expect(parseApiConfig(ENV)).toEqual({
      env: "dev",
      ssmPrefix: "/atlas/dev/",
      origin: "https://atlas.example",
      dataBucket: "atlas-dev-data-x1",
      sessionTtlSeconds: 28_800,
      loginTtlSeconds: 600,
      clockToleranceSeconds: 600,
      allowListCacheSeconds: 120,
      secretsCacheSeconds: 300,
      activeJobFamilies: ["ecb", "prices", "mail", "backup", "integrity"],
    });
    expect(
      parseApiConfig({
        ...ENV,
        ATLAS_ENV: "prod",
        ATLAS_DATA_BUCKET: "atlas-prod-data-x1",
        ATLAS_ORIGIN: "https://a.example:8443",
      }).ssmPrefix,
    ).toBe("/atlas/prod/");
  });

  it("reads the active families of tasks, `none` when the environment sleeps, and nothing else", () => {
    expect(parseApiConfig({ ...ENV, ATLAS_ACTIVE_JOB_FAMILIES: "none" }).activeJobFamilies).toEqual(
      [],
    );
    expect(parseApiConfig({ ...ENV, ATLAS_ACTIVE_JOB_FAMILIES: "ecb" }).activeJobFamilies).toEqual([
      "ecb",
    ]);
    fails({ ...ENV, ATLAS_ACTIVE_JOB_FAMILIES: "" }, "ATLAS_ACTIVE_JOB_FAMILIES", "missing");
    fails(
      { ...ENV, ATLAS_ACTIVE_JOB_FAMILIES: "ecb,everything" },
      "ATLAS_ACTIVE_JOB_FAMILIES",
      "not_job_families",
    );
  });

  it("refuses to start with a secret or any unknown ATLAS_ variable", () => {
    fails({ ...ENV, ATLAS_SESSION_KEY: "x" }, "ATLAS_SESSION_KEY", "unknown");
    fails({ ...ENV, ATLAS_GOOGLE_CLIENT_SECRET: "x" }, "ATLAS_GOOGLE_CLIENT_SECRET", "unknown");
  });

  it("refuses what is missing or not understood", () => {
    fails({ ...ENV, ATLAS_ENV: undefined }, "ATLAS_ENV", "missing");
    fails({ ...ENV, ATLAS_ENV: "" }, "ATLAS_ENV", "missing");
    fails({ ...ENV, ATLAS_ENV: "staging" }, "ATLAS_ENV", "not_dev_or_prod");
    fails({ ...ENV, ATLAS_ORIGIN: "http://atlas.example" }, "ATLAS_ORIGIN", "not_an_https_origin");
    fails(
      { ...ENV, ATLAS_ORIGIN: "https://atlas.example/" },
      "ATLAS_ORIGIN",
      "not_an_https_origin",
    );
    fails({ ...ENV, ATLAS_DATA_BUCKET: "Bad_Bucket" }, "ATLAS_DATA_BUCKET", "not_a_bucket_name");
    // The bucket of another environment: dev's function never starts against prod's data.
    fails(
      { ...ENV, ATLAS_DATA_BUCKET: "atlas-prod-data-x1" },
      "ATLAS_DATA_BUCKET",
      "not_of_the_environment",
    );
    fails(
      { ...ENV, ATLAS_LOGIN_TTL_SECONDS: "0" },
      "ATLAS_LOGIN_TTL_SECONDS",
      "not_a_positive_integer",
    );
    fails(
      { ...ENV, ATLAS_LOGIN_TTL_SECONDS: "1e3" },
      "ATLAS_LOGIN_TTL_SECONDS",
      "not_a_positive_integer",
    );
  });

  it("never admits a duration, a cache or the clock tolerance above its ceiling (S4)", () => {
    const ceilings: [string, number][] = [
      ["ATLAS_SESSION_TTL_SECONDS", 86_400],
      ["ATLAS_LOGIN_TTL_SECONDS", 1_800],
      ["ATLAS_ALLOW_LIST_CACHE_SECONDS", 3_600],
      ["ATLAS_SECRETS_CACHE_SECONDS", 3_600],
      ["ATLAS_CLOCK_TOLERANCE_SECONDS", 3_600],
    ];
    expect(API_CONFIG_CEILINGS).toEqual(Object.fromEntries(ceilings));
    for (const [variable, ceiling] of ceilings) {
      expect(() => parseApiConfig({ ...ENV, [variable]: String(ceiling) })).not.toThrow();
      fails({ ...ENV, [variable]: String(ceiling + 1) }, variable, "above_ceiling");
      fails({ ...ENV, [variable]: "999999999" }, variable, "above_ceiling");
    }
  });
});
