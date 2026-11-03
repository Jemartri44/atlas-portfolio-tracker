// The ID token of Google and the allow list.

import { describe, expect, it } from "vitest";
import { isAllowed, parseAllowList, subjectAllowed } from "../src/allow-list.js";
import { checkIdTokenClaims, checkIdTokenHeader, splitJwt } from "../src/id-token.js";

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
      '{"allow_list_format":1,"entries":[{"sub":"111","email":"a@example.test","email":"b@example.test"}]}',
      '{"allow_list_format":1,"allow_list_format":1,"entries":[]}',
    ]) {
      expect(() => parseAllowList(bad)).toThrow(
        expect.objectContaining({ code: "allow_list_unreadable" }),
      );
    }
    expect(parseAllowList(JSON.stringify({ allow_list_format: 1, entries: [] }))).toEqual([]);
  });
});
