// The ID token of Google, the allow list and the configuration of the Lambda.

import { describe, expect, it } from "vitest";
import { isAllowed, parseAllowList, subjectAllowed } from "../../src/access/allow-list.js";
import { API_CONFIG_CEILINGS, parseApiConfig } from "../../src/access/config.js";
import { checkIdTokenClaims, checkIdTokenHeader, splitJwt } from "../../src/access/id-token.js";

const NOW = 1_790_000_000;
const ISSUERS = ["https://issuer.example", "issuer.example"];
const EXPECT = { audience: "client-dev", issuers: ISSUERS, nonce: "n".repeat(43), nowSeconds: NOW };
const CLAIMS = {
  aud: "client-dev",
  iss: "https://issuer.example",
  exp: NOW + 3600,
  iat: NOW,
  nonce: "n".repeat(43),
  email_verified: true,
  sub: "1234567890",
  email: "someone@example.test",
};

describe("the header of an ID token (R11)", () => {
  it("wants RS256 with a kid, and nothing that asks for more", () => {
    expect(checkIdTokenHeader({ alg: "RS256", kid: "k1", typ: "JWT" })).toEqual({ kid: "k1" });
    expect(checkIdTokenHeader({ alg: "RS256", kid: "k1" })).toEqual({ kid: "k1" });
    for (const header of [
      { alg: "none", kid: "k1" },
      { alg: "HS256", kid: "k1" },
      { alg: "rs256", kid: "k1" },
      { alg: "RS256" },
      { alg: "RS256", kid: "" },
      { alg: "RS256", kid: 7 },
      { alg: "RS256", kid: "k1", crit: ["x"] },
      { alg: "RS256", kid: "k1", typ: "at+jwt" },
      "RS256",
    ]) {
      expect(checkIdTokenHeader(header)).toBe("id_token_invalid");
    }
  });

  it("splits a compact token into its three parts and the signing input", () => {
    expect(splitJwt("aa.bb.cc")).toEqual({
      header: "aa",
      payload: "bb",
      signature: "cc",
      signingInput: "aa.bb",
    });
    for (const token of ["aa.bb", "aa.bb.cc.dd", "aa..cc", "a=a.bb.cc"]) {
      expect(splitJwt(token)).toBeUndefined();
    }
  });
});

describe("the claims of an ID token, in the order of ADR-0027 (R12 to R17)", () => {
  it("gives the pair when everything holds", () => {
    expect(checkIdTokenClaims(CLAIMS, EXPECT)).toEqual({
      sub: "1234567890",
      email: "someone@example.test",
    });
    expect(checkIdTokenClaims({ ...CLAIMS, iss: "issuer.example" }, EXPECT)).toEqual({
      sub: "1234567890",
      email: "someone@example.test",
    });
  });

  it("refuses each failure with its own code, the first one first", () => {
    expect(checkIdTokenClaims("x", EXPECT)).toBe("id_token_invalid");
    expect(checkIdTokenClaims({ ...CLAIMS, aud: "client-prod" }, EXPECT)).toBe("id_token_audience");
    expect(checkIdTokenClaims({ ...CLAIMS, aud: ["client-dev"] }, EXPECT)).toBe(
      "id_token_audience",
    );
    expect(checkIdTokenClaims({ ...CLAIMS, iss: "https://issuer.example.evil" }, EXPECT)).toBe(
      "id_token_issuer",
    );
    expect(checkIdTokenClaims({ ...CLAIMS, iss: 1 }, EXPECT)).toBe("id_token_issuer");
    expect(checkIdTokenClaims({ ...CLAIMS, exp: "later" }, EXPECT)).toBe("id_token_invalid");
    expect(checkIdTokenClaims({ ...CLAIMS, exp: Number.NaN }, EXPECT)).toBe("id_token_invalid");
    expect(checkIdTokenClaims({ ...CLAIMS, exp: NOW }, EXPECT)).toBe("id_token_expired");
    expect(checkIdTokenClaims({ ...CLAIMS, nonce: "m".repeat(43) }, EXPECT)).toBe("id_token_nonce");
    expect(checkIdTokenClaims({ ...CLAIMS, email_verified: false }, EXPECT)).toBe(
      "email_not_verified",
    );
    expect(checkIdTokenClaims({ ...CLAIMS, email_verified: "true" }, EXPECT)).toBe(
      "email_not_verified",
    );
    expect(checkIdTokenClaims({ ...CLAIMS, email_verified: undefined }, EXPECT)).toBe(
      "email_not_verified",
    );
    expect(checkIdTokenClaims({ ...CLAIMS, sub: "" }, EXPECT)).toBe("id_token_invalid");
    expect(checkIdTokenClaims({ ...CLAIMS, email: "" }, EXPECT)).toBe("id_token_invalid");
    expect(checkIdTokenClaims({ ...CLAIMS, email: 3 }, EXPECT)).toBe("id_token_invalid");
    // The audience is checked before the issuer: both wrong, the audience is named.
    expect(checkIdTokenClaims({ ...CLAIMS, aud: "x", iss: "y" }, EXPECT)).toBe("id_token_audience");
  });
});

describe("the allow list: the pair, together and exact (R17)", () => {
  const text = JSON.stringify({
    allow_list_format: 1,
    entries: [
      { sub: "111", email: "a@example.test" },
      { sub: "222", email: "b@example.test" },
    ],
  });

  it("admits the pair of one entry, never a sub with another entry's e-mail", () => {
    const list = parseAllowList(text);
    expect(isAllowed(list, { sub: "111", email: "a@example.test" })).toBe(true);
    expect(isAllowed(list, { sub: "111", email: "b@example.test" })).toBe(false);
    expect(isAllowed(list, { sub: "222", email: "a@example.test" })).toBe(false);
    expect(isAllowed(list, { sub: "111", email: "A@example.test" })).toBe(false);
    expect(isAllowed([], { sub: "111", email: "a@example.test" })).toBe(false);
  });

  it("asks again, on every request with the cookie, that the sub still has an entry", () => {
    const list = parseAllowList(text);
    expect(subjectAllowed(list, "111")).toBe(true);
    expect(subjectAllowed(list, "333")).toBe(false);
    expect(subjectAllowed([], "111")).toBe(false);
  });

  it("refuses to read anything but its exact form", () => {
    for (const bad of [
      "{",
      "[]",
      JSON.stringify({ allow_list_format: 2, entries: [] }),
      JSON.stringify({ allow_list_format: 1, entries: {} }),
      JSON.stringify({ allow_list_format: 1, entries: [], extra: 1 }),
      JSON.stringify({ allow_list_format: 1, entries: [{ sub: "1" }] }),
      JSON.stringify({ allow_list_format: 1, entries: [{ sub: "1", email: "" }] }),
      JSON.stringify({ allow_list_format: 1, entries: [{ sub: "1", email: "e", x: 1 }] }),
      JSON.stringify({ allow_list_format: 1, entries: ["x"] }),
      JSON.stringify({ allow_list_format: 1, entries: [{ sub: "", email: "e" }] }),
    ]) {
      expect(() => parseAllowList(bad)).toThrow(
        expect.objectContaining({ code: "allow_list_unreadable" }),
      );
    }
    expect(parseAllowList(JSON.stringify({ allow_list_format: 1, entries: [] }))).toEqual([]);
  });
});

describe("the configuration of the Lambda (R30)", () => {
  const ENV = {
    ATLAS_ENV: "dev",
    ATLAS_ORIGIN: "https://atlas.example",
    ATLAS_DATA_BUCKET: "atlas-dev-data-x1",
    ATLAS_SESSION_TTL_SECONDS: "28800",
    ATLAS_LOGIN_TTL_SECONDS: "600",
    ATLAS_CLOCK_TOLERANCE_SECONDS: "600",
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
