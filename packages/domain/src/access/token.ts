// The device token of the console (ADR-0033; `docs/api.md` §2.1, §2.2 and
// §4): its format, the record SSM keeps of it, the order in which a request
// that brings one is checked, its expiry and the row the web lists. Pure: the
// SHA-256 of the secret and its comparison in constant time are the
// adapter's, and so is every read.

import { ValidationError } from "../errors.js";
import { isRecord } from "../guards.js";
import type { AllowEntry } from "./allow-list.js";
import { isAllowed } from "./allow-list.js";
import { type ApiRefusal, refusal } from "./codes.js";
import { TOKEN_CEILING_DAYS } from "./config.js";
import { isId22, isInstant } from "./ids.js";
import { isSubject } from "./signed.js";

const DAY_MS = 86_400_000;

/**
 * `atlasdt1.<token_id>.<secret>`: 22 and 43 characters of a closed alphabet
 * (`docs/api.md` §2.1). **Checked before any name of a parameter is built**:
 * a `token_id` never carries a `:` nor a `/`, so `GetParameter` can never be
 * asked for `nombre:versión` — the older, unrevoked version (B1).
 */
export const DEVICE_TOKEN = /^atlasdt1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

export interface DeviceTokenParts {
  readonly tokenId: string;
  readonly secret: string;
}

export const parseDeviceToken = (text: string | undefined): DeviceTokenParts | undefined => {
  const match = text === undefined ? null : DEVICE_TOKEN.exec(text);
  return match === null ? undefined : { tokenId: match[1] as string, secret: match[2] as string };
};

export const formatDeviceToken = (tokenId: string, secret: string): string => {
  const token = `atlasdt1.${tokenId}.${secret}`;
  if (!DEVICE_TOKEN.test(token)) {
    throw new ValidationError("device_token_malformed", "a token is atlasdt1.<22>.<43>");
  }
  return token;
};

/** The folder of the records in SSM: `/atlas/<env>/device-tokens/`. */
export const tokenParameterPath = (ssmPrefix: string): string => `${ssmPrefix}device-tokens/`;

/** The name of a record, **built only from a valid `token_id`** (B1). */
export const tokenParameterName = (ssmPrefix: string, tokenId: string): string => {
  if (!isId22(tokenId)) {
    throw new ValidationError("token_id_invalid", "a token id is 22 characters of base64url");
  }
  return `${tokenParameterPath(ssmPrefix)}${tokenId}`;
};

/** The `token_id` a name of the folder names, as it is: the list reports it even if unreadable. */
export const tokenIdOfParameterName = (ssmPrefix: string, name: string): string | undefined =>
  name.startsWith(tokenParameterPath(ssmPrefix))
    ? name.slice(tokenParameterPath(ssmPrefix).length)
    : undefined;

export interface TokenRecord {
  readonly token_record_format: 1;
  readonly token_id: string;
  /** The SHA-256 of the secret, 64 lower-case hex: the secret itself is never kept. */
  readonly secret_sha256: string;
  readonly sub: string;
  readonly email: string;
  readonly device_id: string;
  readonly device_name: string;
  readonly issued_at: string;
  readonly expires_at: string;
  /** Only once revoked. */
  readonly revoked_at?: string;
}

const RECORD_KEYS = new Set([
  "token_record_format",
  "token_id",
  "secret_sha256",
  "sub",
  "email",
  "device_id",
  "device_name",
  "issued_at",
  "expires_at",
  "revoked_at",
]);

/**
 * Reads a record **strictly, and only as the token it was asked for**: a
 * record whose own `token_id` is not the one requested is unreadable, never
 * that token (B1: identity, not the name of the parameter).
 */
export const parseTokenRecord = (text: string, tokenId: string): TokenRecord | "unreadable" => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "unreadable";
  }
  if (!isRecord(value) || Object.keys(value).some((key) => !RECORD_KEYS.has(key))) {
    return "unreadable";
  }
  const valid =
    value.token_record_format === 1 &&
    value.token_id === tokenId &&
    isId22(value.token_id) &&
    typeof value.secret_sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(value.secret_sha256) &&
    isSubject(value.sub) &&
    typeof value.email === "string" &&
    value.email.length > 0 &&
    isId22(value.device_id) &&
    typeof value.device_name === "string" &&
    isInstant(value.issued_at) &&
    isInstant(value.expires_at) &&
    (value.revoked_at === undefined || isInstant(value.revoked_at));
  return valid ? (value as unknown as TokenRecord) : "unreadable";
};

/** One line of JSON: the only writer of the format, for the API and for the administration (§7 P4). */
export const serializeTokenRecord = (record: TokenRecord): string => JSON.stringify(record);

const instant = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * A new record: `expires_at` is the issue plus the configured lifetime, and
 * **never beyond the ceiling fixed in the code** (ADR-0033, point 7).
 */
export const newTokenRecord = (fields: {
  tokenId: string;
  secretSha256: string;
  sub: string;
  email: string;
  deviceId: string;
  deviceName: string;
  issuedAtMs: number;
  lifetimeDays: number;
}): TokenRecord => ({
  token_record_format: 1,
  token_id: fields.tokenId,
  secret_sha256: fields.secretSha256,
  sub: fields.sub,
  email: fields.email,
  device_id: fields.deviceId,
  device_name: fields.deviceName,
  issued_at: instant(fields.issuedAtMs),
  expires_at: instant(
    fields.issuedAtMs + Math.min(fields.lifetimeDays, TOKEN_CEILING_DAYS) * DAY_MS,
  ),
});

/** Revoked at an instant; one already revoked keeps its instant and is **not written again**. */
export const revokedRecord = (record: TokenRecord, atMs: number): TokenRecord =>
  record.revoked_at === undefined ? { ...record, revoked_at: instant(atMs) } : record;

export type TokenStatus = "active" | "expired" | "revoked";

/**
 * Expired **before `expires_at` and before the issue plus the ceiling**: a
 * record written with a longer `expires_at` — by hand, or by a version that
 * allowed it — is still bound by the ceiling (ADR-0033, point 7).
 */
export const tokenStatus = (record: TokenRecord, nowMs: number): TokenStatus => {
  if (record.revoked_at !== undefined) {
    return "revoked";
  }
  const end = Math.min(
    Date.parse(record.expires_at),
    Date.parse(record.issued_at) + TOKEN_CEILING_DAYS * DAY_MS,
  );
  return nowMs < end ? "active" : "expired";
};

/**
 * The check of a token (`docs/api.md` §2.2), **in this order, rejecting at the
 * first failure**: the record (read without cache and without selector, and
 * its own `token_id` the one asked for — `parseTokenRecord`); the secret,
 * compared in constant time by the adapter (`secretMatches`); not revoked; not
 * expired — unless `acceptExpired`, which only the renewal of §4.3 passes —;
 * and the pair still in the allow list. The device comes after, with
 * `deviceRefusal(…, "console")`.
 */
export const checkToken = (
  read: TokenRecord | "unreadable" | undefined,
  facts: {
    readonly secretMatches: boolean;
    readonly nowMs: number;
    readonly allowList: readonly AllowEntry[];
    readonly acceptExpired?: boolean;
  },
): { readonly ok: TokenRecord } | ApiRefusal => {
  if (read === undefined || read === "unreadable") {
    return refusal("device_token_invalid", {
      reason: read === undefined ? "missing" : "unreadable",
    });
  }
  if (!facts.secretMatches) {
    return refusal("device_token_invalid", { reason: "secret" });
  }
  const status = tokenStatus(read, facts.nowMs);
  if (status === "revoked") {
    return refusal("device_token_revoked");
  }
  if (status === "expired" && facts.acceptExpired !== true) {
    return refusal("device_token_expired");
  }
  if (!isAllowed(facts.allowList, { sub: read.sub, email: read.email })) {
    return refusal("not_allowed");
  }
  return { ok: read };
};

export interface TokenListItem {
  readonly token_id: string;
  readonly device_id: string;
  readonly device_name: string;
  readonly issued_at: string;
  readonly expires_at: string;
  readonly status: TokenStatus;
  readonly revoked_at?: string;
  /** From the object of the device (`sync/devices/<id>.json`), never kept in the record. */
  readonly last_sync_at?: string;
  /** Issued within the last `recentDays`: the web marks it (ADR-0033, point 8). */
  readonly recent: boolean;
}

/** A row of `GET /api/devices/tokens`: no e-mail, no `sub`, no hash. */
export const tokenListItem = (
  record: TokenRecord,
  lastSyncAt: string | undefined,
  nowMs: number,
  recentDays: number,
): TokenListItem => {
  const issued = Date.parse(record.issued_at);
  return {
    token_id: record.token_id,
    device_id: record.device_id,
    device_name: record.device_name,
    issued_at: record.issued_at,
    expires_at: record.expires_at,
    status: tokenStatus(record, nowMs),
    ...(record.revoked_at === undefined ? {} : { revoked_at: record.revoked_at }),
    ...(lastSyncAt === undefined ? {} : { last_sync_at: lastSyncAt }),
    recent: issued <= nowMs && nowMs - issued < recentDays * DAY_MS,
  };
};
