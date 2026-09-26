// The cryptographic primitives of the API (feature 015), with `node:crypto`
// and nothing else: HKDF subkeys per purpose, HMAC-SHA256 signatures compared
// in constant time, PKCE S256 and RS256 over a JWK. **The rules** — which
// purpose, which `typ`, in which order — are the domain's (`@atlas/domain/access`);
// this file only computes. Node only: the web never reaches it.

import {
  createHash,
  createHmac,
  createPublicKey,
  hkdfSync,
  type JsonWebKey,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { SIGNING, type SigningPurpose, splitSigned } from "@atlas/domain/access";

export const base64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");

/** Decodes base64url **strictly**: the text has to be the canonical encoding of what it decodes to. */
export const fromBase64url = (text: string): Buffer | undefined => {
  const bytes = Buffer.from(text, "base64url");
  return base64url(bytes) === text ? bytes : undefined;
};

/** PKCE S256 (RFC 7636, §4.2): base64url of the SHA-256 of the ASCII verifier. */
export const pkceChallenge = (verifier: string): string =>
  base64url(createHash("sha256").update(verifier, "ascii").digest());

export class SessionKeyInvalid extends Error {
  constructor() {
    super("the session key is not 32 bytes of base64url");
    this.name = "SessionKeyInvalid";
  }
}

/**
 * Signs and opens the payloads of the API. Each purpose has its own subkey,
 * derived with HKDF-SHA256 from the session key with an empty salt (RFC 5869,
 * §3.1: the input key is already uniformly random) and the `info` of its
 * purpose; opening with one purpose's subkey never accepts another's MAC.
 */
export class Signer {
  private constructor(private readonly keys: ReadonlyMap<SigningPurpose, Buffer>) {}

  static fromSessionKey(sessionKey: string): Signer {
    const root = fromBase64url(sessionKey);
    if (root === undefined || root.length !== 32) {
      throw new SessionKeyInvalid();
    }
    const keys = new Map<SigningPurpose, Buffer>();
    for (const purpose of Object.keys(SIGNING) as SigningPurpose[]) {
      keys.set(
        purpose,
        Buffer.from(hkdfSync("sha256", root, Buffer.alloc(0), SIGNING[purpose].info, 32)),
      );
    }
    return new Signer(keys);
  }

  private mac(purpose: SigningPurpose, payload: string): Buffer {
    return createHmac("sha256", this.keys.get(purpose) as Buffer)
      .update(payload, "ascii")
      .digest();
  }

  sign(purpose: SigningPurpose, payload: object): string {
    const encoded = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
    return `${encoded}.${base64url(this.mac(purpose, encoded))}`;
  }

  /** The JSON text of a payload whose MAC is this purpose's, or nothing. */
  open(purpose: SigningPurpose, signed: string): string | undefined {
    const parts = splitSigned(signed);
    if (parts === undefined) {
      return undefined;
    }
    const given = fromBase64url(parts.mac);
    const expected = this.mac(purpose, parts.payload);
    if (
      given === undefined ||
      given.length !== expected.length ||
      !timingSafeEqual(given, expected)
    ) {
      return undefined;
    }
    const payload = fromBase64url(parts.payload);
    return payload === undefined ? undefined : payload.toString("utf8");
  }
}

/** RS256 over a JWK of Google (RFC 7518, §3.3). Any failure to read the key is a failed check. */
export const verifyRs256 = (key: JsonWebKey, signingInput: string, signature: string): boolean => {
  try {
    const publicKey = createPublicKey({ key, format: "jwk" });
    const bytes = fromBase64url(signature);
    return (
      publicKey.asymmetricKeyType === "rsa" &&
      bytes !== undefined &&
      verify("RSA-SHA256", Buffer.from(signingInput, "ascii"), publicKey, bytes)
    );
  } catch {
    return false;
  }
};
