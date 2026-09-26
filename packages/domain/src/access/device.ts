// The record of each device, `sync/devices/<device_id>.json` in the bucket
// (`docs/api.md` §5.3 and §5.4; decisions B1, N8, R2-B2 and Q3 of the prompt
// of feature 015). **The API creates it when it assigns the id** and every
// request checks it: it has to exist, be of the type of the credential and be
// active. A missing object is **never** alive — deciding "not forgotten" by
// absence is the recognition by resemblance B1 and R2-B2 closed.

import { ValidationError } from "../errors.js";
import { isRecord } from "../guards.js";
import { isId22, isInstant } from "./ids.js";

export const DEVICE_FORMAT = 1;

export type DeviceType = "web" | "console";
export type DeviceState = "active" | "forgotten";

export interface DeviceObject {
  readonly device_format: 1;
  readonly device_id: string;
  readonly type: DeviceType;
  readonly state: DeviceState;
  readonly created_at: string;
  readonly pending: number;
  readonly held: number;
  readonly last_sync_at?: string;
  readonly published_at?: string;
  /** Only a console: the name of its first exchange, which the reissue confirms. */
  readonly device_name?: string;
  /** Only when forgotten. */
  readonly forgotten_at?: string;
}

/** Why a credential's device does not let it in (Q3; the fourth, `unreadable`, confirmed in Q9). */
export type DeviceRefusalReason = "missing" | "wrong_type" | "forgotten" | "unreadable";

/**
 * The key of a device's object, **built only from a valid id**: 22 characters
 * of a closed alphabet, so no `/` or `..` can take it out of `sync/devices/`.
 */
export const deviceKey = (deviceId: string): string => {
  if (!isId22(deviceId)) {
    throw new ValidationError("device_id_invalid", "a device id is 22 characters of base64url");
  }
  return `sync/devices/${deviceId}.json`;
};

const KEYS = new Set([
  "device_format",
  "device_id",
  "type",
  "state",
  "created_at",
  "pending",
  "held",
  "last_sync_at",
  "published_at",
  "device_name",
  "forgotten_at",
]);

const isCount = (value: unknown): boolean =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const optionalInstant = (value: unknown): boolean => value === undefined || isInstant(value);

/**
 * Reads an object **strictly**, and only as the device it was asked for: an
 * object whose `device_id` is not the one in its key is unreadable, never
 * another device's record (identity, not resemblance).
 */
export const parseDeviceObject = (text: string, deviceId: string): DeviceObject | "unreadable" => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "unreadable";
  }
  if (!isRecord(value) || Object.keys(value).some((key) => !KEYS.has(key))) {
    return "unreadable";
  }
  const forgotten = value.state === "forgotten";
  const valid =
    value.device_format === DEVICE_FORMAT &&
    value.device_id === deviceId &&
    (value.type === "web" || value.type === "console") &&
    (value.state === "active" || forgotten) &&
    isInstant(value.created_at) &&
    isCount(value.pending) &&
    isCount(value.held) &&
    optionalInstant(value.last_sync_at) &&
    optionalInstant(value.published_at) &&
    (forgotten ? isInstant(value.forgotten_at) : value.forgotten_at === undefined) &&
    (value.device_name === undefined ||
      (value.type === "console" && typeof value.device_name === "string"));
  return valid ? (value as unknown as DeviceObject) : "unreadable";
};

export const serializeDeviceObject = (device: DeviceObject): string =>
  `${JSON.stringify(device)}\n`;

/** A device the API has just assigned: active, with an empty queue published. */
export const newDevice = (fields: {
  deviceId: string;
  type: DeviceType;
  createdAt: string;
  deviceName?: string;
}): DeviceObject => ({
  device_format: 1,
  device_id: fields.deviceId,
  type: fields.type,
  state: "active",
  created_at: fields.createdAt,
  pending: 0,
  held: 0,
  ...(fields.deviceName === undefined ? {} : { device_name: fields.deviceName }),
});

/**
 * Whether the device of a credential lets it in: **it exists, it is of the
 * credential's type** (the cookie → `web`, the token → `console`) **and it is
 * active**. Anything else is `device_forgotten`, with its reason.
 */
export const deviceRefusal = (
  read: DeviceObject | "unreadable" | undefined,
  expected: DeviceType,
): DeviceRefusalReason | undefined => {
  if (read === undefined) {
    return "missing";
  }
  if (read === "unreadable") {
    return "unreadable";
  }
  if (read.type !== expected) {
    return "wrong_type";
  }
  return read.state === "active" ? undefined : "forgotten";
};

/**
 * The id the web presented at sign-in (§7 P1): kept **only** if the API
 * issued it for a web device that is not forgotten; otherwise a new one is
 * assigned. In IndexedDB it is not a credential; here it is only a wish.
 */
export const keepsPresentedWebDevice = (read: DeviceObject | "unreadable" | undefined): boolean =>
  deviceRefusal(read, "web") === undefined;
