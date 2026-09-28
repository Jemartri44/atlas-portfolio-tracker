// What an HTTP client of the sync accepts as an answer of the API (feature
// 015, E3; `docs/api.md` §5 and §7), read **strictly**. The rule of §7: only a
// `rejected.code` of the closed list holds a line; an error of the closed list
// stops the sync and leaves everything pending; anything without the shape —
// the WAF, CloudFront, a hash of the body AWS refused — is
// `transport_rejected`, and never holds a line (V4).

import { isRecord } from "../guards.js";
import {
  type AppendResult,
  LINE_REJECTION_CODES,
  type LineRejection,
} from "../ports/remote-ledger.js";
import { parseErrorAnswer } from "../remote/answers.js";

const SHA = /^[0-9a-f]{64}$/;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const onlyKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));

const readRejection = (value: unknown): LineRejection | undefined => {
  if (
    !isRecord(value) ||
    !onlyKeys(value, ["index", "id", "code", "details"]) ||
    !isCount(value.index) ||
    (value.id !== undefined && typeof value.id !== "string") ||
    !(LINE_REJECTION_CODES as readonly unknown[]).includes(value.code) ||
    !isRecord(value.details)
  ) {
    return undefined;
  }
  return value as unknown as LineRejection;
};

/** The `200` of `POST /api/ledger/lines`, or nothing if it has not that shape. */
export const parseAppendAnswer = (value: unknown): AppendResult | undefined => {
  if (
    !isRecord(value) ||
    !onlyKeys(value, ["etag", "lines", "accepted", "rejected"]) ||
    typeof value.etag !== "string" ||
    !SHA.test(value.etag) ||
    !isCount(value.lines) ||
    !isCount(value.accepted)
  ) {
    return undefined;
  }
  if (value.rejected === undefined) {
    return { etag: value.etag, lines: value.lines, accepted: value.accepted };
  }
  const rejected = readRejection(value.rejected);
  return rejected === undefined
    ? undefined
    : { etag: value.etag, lines: value.lines, accepted: value.accepted, rejected };
};

/** The `200` of `PUT /api/ledger`. */
export const parseInitAnswer = (value: unknown): { etag: string; lines: number } | undefined =>
  isRecord(value) &&
  onlyKeys(value, ["etag", "lines"]) &&
  typeof value.etag === "string" &&
  SHA.test(value.etag) &&
  isCount(value.lines)
    ? { etag: value.etag, lines: value.lines }
    : undefined;

/** The `200` of `PUT /api/sync/devices/self`. */
export const parsePublishAnswer = (
  value: unknown,
): { device_id: string; published_at: string } | undefined =>
  isRecord(value) &&
  onlyKeys(value, ["device_id", "published_at"]) &&
  typeof value.device_id === "string" &&
  typeof value.published_at === "string"
    ? { device_id: value.device_id, published_at: value.published_at }
    : undefined;

/** The SHA-256 an `ETag` quotes, strong or weak (CloudFront weakens it when it compresses). */
export const etagOfHeader = (header: string | null): string | undefined => {
  const quoted = /^(?:W\/)?"([0-9a-f]{64})"$/.exec(header ?? "");
  return quoted?.[1];
};

// What the reference data and the sync share (`remote/answers.ts`): kept at
// this door for the sync, which always read them here.
export { parseErrorAnswer };
