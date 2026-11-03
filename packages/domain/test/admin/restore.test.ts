// The pure rules of the administration of the remote.

import { describe, expect, it } from "vitest";
import { compareForRestore, parseAdminConfig } from "../../src/admin/restore.js";
import { SAMPLES } from "../samples.js";

describe("compareForRestore", () => {
  const [a, b, c] = [SAMPLES.account_created, SAMPLES.asset_created, SAMPLES.cash_deposit];

  it("says the same events, a prefix and its lost tail, or the difference both ways", () => {
    expect(compareForRestore([a, b], [a, b])).toEqual({ kind: "same" });
    expect(compareForRestore([a], [a, b, c])).toEqual({ kind: "prefix", lost: [b.id, c.id] });
    expect(compareForRestore([a, c], [a, b])).toEqual({
      kind: "differs",
      onlyCandidate: [c.id],
      onlyRemote: [b.id],
    });
    // Longer than the remote: never a prefix.
    expect(compareForRestore([a, b, c], [a, b])).toMatchObject({
      kind: "differs",
      onlyCandidate: [c.id],
    });
  });
});

describe("parseAdminConfig (data-model §9)", () => {
  const good = {
    admin_format: 1,
    environments: {
      prod: { region: "eu-west-1", data_bucket: "atlas-prod-data-x1", ssm_prefix: "/atlas/prod/" },
    },
  };

  it("reads the environments, strictly", () => {
    expect(parseAdminConfig(JSON.stringify(good))).toEqual({ environments: good.environments });
  });

  it.each([
    ["not JSON", "{"],
    ["not an object", "[]"],
    ["another format", JSON.stringify({ ...good, admin_format: 2 })],
    ["an unknown key", JSON.stringify({ ...good, credentials: {} })],
    ["environments that are not an object", JSON.stringify({ ...good, environments: [] })],
    ["a bad name", JSON.stringify({ ...good, environments: { Prod: good.environments.prod } })],
    [
      "an environment that is not an object",
      JSON.stringify({ ...good, environments: { prod: 1 } }),
    ],
    [
      "a key more in an environment",
      JSON.stringify({
        ...good,
        environments: { prod: { ...good.environments.prod, profile: "x" } },
      }),
    ],
    [
      "a bad region",
      JSON.stringify({
        ...good,
        environments: { prod: { ...good.environments.prod, region: "europe" } },
      }),
    ],
    [
      "a bad bucket",
      JSON.stringify({
        ...good,
        environments: { prod: { ...good.environments.prod, data_bucket: "A" } },
      }),
    ],
    [
      "a prefix of another environment",
      JSON.stringify({
        ...good,
        environments: { prod: { ...good.environments.prod, ssm_prefix: "/atlas/dev/" } },
      }),
    ],
    [
      "a region that is not text",
      JSON.stringify({ ...good, environments: { prod: { ...good.environments.prod, region: 1 } } }),
    ],
    [
      "a bucket that is not text",
      JSON.stringify({
        ...good,
        environments: { prod: { ...good.environments.prod, data_bucket: 1 } },
      }),
    ],
    [
      "a prefix that is not text",
      JSON.stringify({
        ...good,
        environments: { prod: { ...good.environments.prod, ssm_prefix: 1 } },
      }),
    ],
    ["null", "null"],
  ])("is unreadable with %s", (_what, text) => {
    expect(parseAdminConfig(text)).toBe("unreadable");
  });
});
