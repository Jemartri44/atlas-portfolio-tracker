// Feature 015, E2: the device token of the console as a rule (plan §4.2,
// T01 to T12): its format before any name is built, the record read as the
// token it was asked for, the order of the check, the expiry under the
// ceiling and the row of the list.

import { describe, expect, it } from "vitest";
import type { AllowEntry } from "../../src/access/allow-list.js";
import {
  checkToken,
  DEVICE_TOKEN,
  formatDeviceToken,
  newTokenRecord,
  parseDeviceToken,
  parseTokenRecord,
  revokedRecord,
  serializeTokenRecord,
  type TokenRecord,
  tokenIdOfParameterName,
  tokenListItem,
  tokenParameterName,
  tokenParameterPath,
  tokenStatus,
} from "../../src/access/token.js";
import { ValidationError } from "../../src/errors.js";

const TID = "TTTTTTTTTTTTTTTTTTTTTT";
const DID = "DDDDDDDDDDDDDDDDDDDDDD";
const SECRET = "S".repeat(43);
const HASH = "a".repeat(64);
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1, 10, 0, 0);
const PAIR: AllowEntry = { sub: "108234567890123456789", email: "user@example.test" };
const PREFIX = "/atlas/dev/";

const record = (overrides: Partial<TokenRecord> = {}): TokenRecord => ({
  ...newTokenRecord({
    tokenId: TID,
    secretSha256: HASH,
    sub: PAIR.sub,
    email: PAIR.email,
    deviceId: DID,
    deviceName: "portátil de casa",
    issuedAtMs: T0,
    lifetimeDays: 90,
  }),
  ...overrides,
});

describe("the format of the token (docs/api.md §2.1; B1)", () => {
  it("is atlasdt1.<22>.<43> exactly, and anything else is no token at all", () => {
    expect(parseDeviceToken(`atlasdt1.${TID}.${SECRET}`)).toEqual({ tokenId: TID, secret: SECRET });
    for (const bad of [
      undefined,
      "",
      `atlasdt2.${TID}.${SECRET}`,
      `atlasdt1.${TID}:1.${SECRET}`,
      `atlasdt1.${TID}/x.${SECRET}`,
      `atlasdt1.${TID}.${SECRET}x`,
      `atlasdt1.${TID.slice(1)}.${SECRET}`,
      ` atlasdt1.${TID}.${SECRET}`,
    ]) {
      expect(parseDeviceToken(bad)).toBeUndefined();
    }
    expect(DEVICE_TOKEN.test(formatDeviceToken(TID, SECRET))).toBe(true);
    expect(() => formatDeviceToken(`${TID}:1`, SECRET)).toThrow(ValidationError);
  });

  it("builds the name of a parameter only from a valid token id", () => {
    expect(tokenParameterPath(PREFIX)).toBe("/atlas/dev/device-tokens/");
    expect(tokenParameterName(PREFIX, TID)).toBe(`/atlas/dev/device-tokens/${TID}`);
    for (const bad of [`${TID}:1`, `${TID}:current`, "../auth/session-key", "", TID.slice(1)]) {
      expect(() => tokenParameterName(PREFIX, bad)).toThrow(ValidationError);
    }
    expect(tokenIdOfParameterName(PREFIX, `/atlas/dev/device-tokens/${TID}`)).toBe(TID);
    expect(tokenIdOfParameterName(PREFIX, "/atlas/prod/device-tokens/x")).toBeUndefined();
  });
});

describe("the record of a token (data-model §2)", () => {
  it("round-trips, one line, and is read only as the token it was asked for", () => {
    const text = serializeTokenRecord(record());
    expect(text.includes("\n")).toBe(false);
    expect(parseTokenRecord(text, TID)).toEqual(record());
    // Its own token_id is not the one asked for: another token's record (B1).
    expect(parseTokenRecord(text, "OOOOOOOOOOOOOOOOOOOOOO")).toBe("unreadable");
    // Asked for with a malformed id that happens to be inside: still unreadable.
    const odd = serializeTokenRecord({ ...record(), token_id: "x:1" });
    expect(parseTokenRecord(odd, "x:1")).toBe("unreadable");
  });

  it("is unreadable with anything out of its shape", () => {
    const base = JSON.parse(serializeTokenRecord(record())) as Record<string, unknown>;
    const cases: Record<string, unknown>[] = [
      { ...base, extra: 1 },
      { ...base, token_record_format: 2 },
      { ...base, secret_sha256: "A".repeat(64) },
      { ...base, secret_sha256: 7 },
      { ...base, sub: "" },
      { ...base, email: "" },
      { ...base, email: 3 },
      { ...base, device_id: "short" },
      { ...base, device_name: 4 },
      { ...base, issued_at: "yesterday" },
      { ...base, expires_at: "2026-12-30" },
      { ...base, revoked_at: "now" },
    ];
    for (const value of cases) {
      expect(parseTokenRecord(JSON.stringify(value), TID)).toBe("unreadable");
    }
    expect(parseTokenRecord("{", TID)).toBe("unreadable");
    expect(parseTokenRecord("[]", TID)).toBe("unreadable");
    expect(
      parseTokenRecord(JSON.stringify({ ...base, revoked_at: "2026-10-02T00:00:00Z" }), TID),
    ).not.toBe("unreadable");
  });

  it("expires at the configured lifetime, never beyond the ceiling of 120 days (ADR-0033, point 7)", () => {
    expect(record().issued_at).toBe("2026-10-01T10:00:00Z");
    expect(record().expires_at).toBe("2026-12-30T10:00:00Z");
    const long = newTokenRecord({
      tokenId: TID,
      secretSha256: HASH,
      sub: PAIR.sub,
      email: PAIR.email,
      deviceId: DID,
      deviceName: "x",
      issuedAtMs: T0,
      lifetimeDays: 500,
    });
    expect(Date.parse(long.expires_at) - T0).toBe(120 * DAY);
  });

  it("is revoked once: revoking again keeps the first instant", () => {
    const revoked = revokedRecord(record(), T0 + DAY);
    expect(revoked.revoked_at).toBe("2026-10-02T10:00:00Z");
    expect(revokedRecord(revoked, T0 + 2 * DAY)).toBe(revoked);
  });
});

describe("the status of a token", () => {
  it("is active until expires_at, then expired; revoked wins", () => {
    expect(tokenStatus(record(), T0)).toBe("active");
    expect(tokenStatus(record(), T0 + 90 * DAY - 1)).toBe("active");
    expect(tokenStatus(record(), T0 + 90 * DAY)).toBe("expired");
    expect(tokenStatus(revokedRecord(record(), T0), T0 + 1)).toBe("revoked");
  });

  it("is expired at issue plus 120 days whatever expires_at says (mutant 16)", () => {
    const stretched = record({ expires_at: "2027-06-01T10:00:00Z" });
    expect(tokenStatus(stretched, T0 + 120 * DAY - 1)).toBe("active");
    expect(tokenStatus(stretched, T0 + 120 * DAY)).toBe("expired");
  });
});

describe("the check of a token, in the order of docs/api.md §2.2", () => {
  const facts = { secretMatches: true, nowMs: T0 + DAY, allowList: [PAIR] };

  it("lets in an active token of the list, and nothing that fails a step", () => {
    expect(checkToken(record(), facts)).toEqual({ ok: record() });
    expect(checkToken(undefined, facts)).toMatchObject({
      code: "device_token_invalid",
      details: { reason: "missing" },
    });
    expect(checkToken("unreadable", facts)).toMatchObject({
      code: "device_token_invalid",
      details: { reason: "unreadable" },
    });
    expect(checkToken(record(), { ...facts, secretMatches: false })).toMatchObject({
      code: "device_token_invalid",
      details: { reason: "secret" },
    });
    expect(checkToken(revokedRecord(record(), T0), facts)).toMatchObject({
      code: "device_token_revoked",
      status: 401,
    });
    expect(checkToken(record(), { ...facts, nowMs: T0 + 91 * DAY })).toMatchObject({
      code: "device_token_expired",
      status: 401,
    });
    expect(checkToken(record(), { ...facts, allowList: [] })).toMatchObject({
      code: "not_allowed",
      status: 403,
    });
    // The pair goes together: the sub with another e-mail is not in the list.
    expect(
      checkToken(record(), { ...facts, allowList: [{ sub: PAIR.sub, email: "other@x.test" }] }),
    ).toMatchObject({ code: "not_allowed" });
  });

  it("checks in order: a wrong secret is invalid before revoked, revoked before expired", () => {
    const old = revokedRecord(record(), T0);
    expect(checkToken(old, { ...facts, secretMatches: false })).toMatchObject({
      code: "device_token_invalid",
    });
    expect(checkToken(old, { ...facts, nowMs: T0 + 200 * DAY })).toMatchObject({
      code: "device_token_revoked",
    });
    expect(checkToken(record(), { ...facts, nowMs: T0 + 200 * DAY, allowList: [] })).toMatchObject({
      code: "device_token_expired",
    });
  });

  it("accepts an expired token only when asked (the renewal of §4.3), never a revoked one", () => {
    const later = { ...facts, nowMs: T0 + 100 * DAY, acceptExpired: true };
    expect(checkToken(record(), later)).toEqual({ ok: record() });
    expect(checkToken(revokedRecord(record(), T0), later)).toMatchObject({
      code: "device_token_revoked",
    });
  });
});

describe("a row of the list of tokens (docs/api.md §4.5)", () => {
  it("says the status, the last sync from the device and whether it is recent, without e-mail or sub", () => {
    const row = tokenListItem(record(), "2026-10-03T08:00:00Z", T0 + DAY, 7);
    expect(row).toEqual({
      token_id: TID,
      device_id: DID,
      device_name: "portátil de casa",
      issued_at: "2026-10-01T10:00:00Z",
      expires_at: "2026-12-30T10:00:00Z",
      status: "active",
      last_sync_at: "2026-10-03T08:00:00Z",
      recent: true,
    });
    expect(JSON.stringify(row)).not.toContain(PAIR.email);
    expect(JSON.stringify(row)).not.toContain(PAIR.sub);
    expect(JSON.stringify(row)).not.toContain(HASH);
  });

  it("is recent strictly inside the window, and shows when it was revoked", () => {
    expect(tokenListItem(record(), undefined, T0 + 7 * DAY - 1, 7).recent).toBe(true);
    expect(tokenListItem(record(), undefined, T0 + 7 * DAY, 7).recent).toBe(false);
    expect(tokenListItem(record(), undefined, T0 - 1, 7).recent).toBe(false);
    const revoked = tokenListItem(revokedRecord(record(), T0 + DAY), undefined, T0 + 2 * DAY, 7);
    expect(revoked).toMatchObject({ status: "revoked", revoked_at: "2026-10-02T10:00:00Z" });
    expect("last_sync_at" in revoked).toBe(false);
  });
});
