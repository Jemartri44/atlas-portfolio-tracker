// Feature 015, E1: the primitives of the API (R08, R10, R11).

import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import {
  base64url,
  fromBase64url,
  pkceChallenge,
  SessionKeyInvalid,
  Signer,
  verifyRs256,
} from "@atlas/adapters/access";
import { describe, expect, it } from "vitest";

const KEY = base64url(Buffer.alloc(32, 7));
const OTHER_KEY = base64url(Buffer.alloc(32, 8));

describe("Signer: one subkey per purpose (B3)", () => {
  const signer = Signer.fromSessionKey(KEY);

  it("opens what it signed with the same purpose, and nothing of another purpose", () => {
    const signed = signer.sign("session", { typ: "atlas.session", a: 1 });
    expect(JSON.parse(signer.open("session", signed) as string)).toEqual({
      typ: "atlas.session",
      a: 1,
    });
    expect(signer.open("login", signed)).toBeUndefined();
    expect(signer.open("console_code", signed)).toBeUndefined();
    expect(signer.open("session", signer.sign("login", { a: 1 }))).toBeUndefined();
  });

  it("refuses a MAC made with the session key itself, not derived (R08)", () => {
    const payload = base64url(Buffer.from('{"typ":"atlas.session"}'));
    const raw = base64url(createHmac("sha256", Buffer.alloc(32, 7)).update(payload).digest());
    expect(signer.open("session", `${payload}.${raw}`)).toBeUndefined();
  });

  it("refuses another key, a changed payload, a changed MAC and a malformed text", () => {
    const signed = signer.sign("session", { a: 1 });
    expect(Signer.fromSessionKey(OTHER_KEY).open("session", signed)).toBeUndefined();
    const [payload, mac] = signed.split(".") as [string, string];
    expect(signer.open("session", `${base64url(Buffer.from('{"a":2}'))}.${mac}`)).toBeUndefined();
    expect(
      signer.open("session", `${payload}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`),
    ).toBeUndefined();
    expect(signer.open("session", `${payload}.${mac}.x`)).toBeUndefined();
    expect(signer.open("session", "nothing")).toBeUndefined();
    // A payload that is not canonical base64url is refused even with a valid MAC over it.
    const odd = "eyJhIjoxfQx";
    const oddMac = signer.sign("session", {}).split(".")[1] as string;
    expect(signer.open("session", `${odd}.${oddMac}`)).toBeUndefined();
  });

  it("refuses to be built from a key that is not 32 bytes of base64url", () => {
    for (const key of [
      base64url(Buffer.alloc(31)),
      base64url(Buffer.alloc(33)),
      "not base64!",
      `${KEY}=`,
    ]) {
      expect(() => Signer.fromSessionKey(key)).toThrow(SessionKeyInvalid);
    }
  });
});

describe("the helpers", () => {
  it("computes PKCE S256 as RFC 7636, appendix B", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("decodes base64url strictly", () => {
    expect(fromBase64url("YQ")?.toString()).toBe("a");
    expect(fromBase64url("YQ==")).toBeUndefined();
    expect(fromBase64url("Y+")).toBeUndefined();
  });
});

describe("verifyRs256 (R11)", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  const input = "aGVhZGVy.cGF5bG9hZA";
  const signature = base64url(sign("RSA-SHA256", Buffer.from(input), privateKey));

  it("accepts the signature of the key and nothing else", () => {
    expect(verifyRs256(jwk, input, signature)).toBe(true);
    expect(verifyRs256(jwk, `${input}x`, signature)).toBe(false);
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({
      format: "jwk",
    });
    expect(verifyRs256(other, input, signature)).toBe(false);
  });

  it("never lets a symmetric key or an HMAC with the public key pass as RS256", () => {
    const hmac = base64url(createHmac("sha256", JSON.stringify(jwk)).update(input).digest());
    expect(verifyRs256(jwk, input, hmac)).toBe(false);
    expect(verifyRs256({ kty: "oct", k: base64url(Buffer.alloc(32)) }, input, hmac)).toBe(false);
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
    expect(
      verifyRs256(
        ec.publicKey.export({ format: "jwk" }),
        input,
        base64url(sign("sha256", Buffer.from(input), ec.privateKey)),
      ),
    ).toBe(false);
    expect(verifyRs256({ kty: "RSA" }, input, signature)).toBe(false);
    expect(verifyRs256(jwk, input, "not+base64")).toBe(false);
  });
});
