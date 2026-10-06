// The rules of the administration of the remote (feature 015, E5; ADR-0026,
// Part A; ADR-0032; ADR-0033, point 8): what
// forgetting a device writes, how a candidate to restore compares with the
// remote, and the local configuration of the administration (`admin.json`).
// Pure: the console's orders apply them with the role of administration,
// never through the API (architecture test).

import type { LedgerEvent } from "../schema/events.js";
import type { Refusal } from "../sync/permission.js";
import type { DeviceObject } from "./device.js";

/** What the administration reads of each object under `sync/devices/`. */
export type AdminDeviceRead =
  | DeviceObject
  | { readonly device_id: string; readonly unreadable: true };

/**
 * Forgetting a device (§7 P9, amended in §7.1 bis, B1): refused for an object
 * that is missing or cannot be read; nothing to do for one already forgotten;
 * refused with lines published pending or held back, unless forced — and
 * then what is left out of sight is said first.
 */
export const forgetRefusal = (
  read: DeviceObject | "unreadable" | undefined,
  force: boolean,
): Refusal | "already_forgotten" | undefined => {
  if (read === undefined) {
    return { code: "forget_device_missing", details: {} };
  }
  if (read === "unreadable") {
    return { code: "forget_device_unreadable", details: {} };
  }
  if (read.state === "forgotten") {
    return "already_forgotten";
  }
  if (!force && (read.pending > 0 || read.held > 0)) {
    return { code: "forget_refused_queue", details: { pending: read.pending, held: read.held } };
  }
  return undefined;
};

/** The object of a device, forgotten: the same object, its state and the instant. */
export const forgottenDevice = (device: DeviceObject, at: string): DeviceObject => ({
  ...device,
  state: "forgotten",
  forgotten_at: at,
});

/**
 * How a candidate to restore compares with the remote, **by identifier**
 * (ADR-0032, step 3): a prefix of the remote loses its tail, said as such;
 * anything else, event by event, both ways.
 */
export type RestoreComparison =
  | { readonly kind: "same" }
  | { readonly kind: "prefix"; readonly lost: readonly string[] }
  | {
      readonly kind: "differs";
      readonly onlyCandidate: readonly string[];
      readonly onlyRemote: readonly string[];
    };

export const compareForRestore = (
  candidate: readonly LedgerEvent[],
  remote: readonly LedgerEvent[],
): RestoreComparison => {
  const inCandidate = new Set(candidate.map((event) => event.id));
  const inRemote = new Set(remote.map((event) => event.id));
  const prefix =
    candidate.length <= remote.length &&
    candidate.every((event, index) => remote[index]?.id === event.id);
  if (prefix) {
    const lost = remote.slice(candidate.length).map((event) => event.id);
    return lost.length === 0 ? { kind: "same" } : { kind: "prefix", lost };
  }
  return {
    kind: "differs",
    onlyCandidate: candidate.filter((event) => !inRemote.has(event.id)).map((event) => event.id),
    onlyRemote: remote.filter((event) => !inCandidate.has(event.id)).map((event) => event.id),
  };
};

/** One environment of the administration (`data-model.md` §9): where its data live. */
export interface AdminEnvironment {
  readonly region: string;
  readonly data_bucket: string;
  readonly ssm_prefix: string;
}

const ENV_NAME = /^[a-z][a-z0-9-]{0,15}$/;
const REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

const exactKeys = (value: object, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => key in value);

/**
 * `~/.config/atlas/admin.json`, read **strictly** (`data-model.md` §9): the
 * user writes it and the application never does. No credential goes here;
 * they come from the standard chain of the SDK. Anything else is unreadable.
 */
export const parseAdminConfig = (
  text: string,
): { readonly environments: Readonly<Record<string, AdminEnvironment>> } | "unreadable" => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "unreadable";
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !exactKeys(parsed, ["admin_format", "environments"]) ||
    (parsed as { admin_format: unknown }).admin_format !== 1
  ) {
    return "unreadable";
  }
  const environments = (parsed as { environments: unknown }).environments;
  if (typeof environments !== "object" || environments === null || Array.isArray(environments)) {
    return "unreadable";
  }
  const read: Record<string, AdminEnvironment> = {};
  for (const [name, value] of Object.entries(environments)) {
    if (
      !ENV_NAME.test(name) ||
      typeof value !== "object" ||
      value === null ||
      !exactKeys(value, ["region", "data_bucket", "ssm_prefix"])
    ) {
      return "unreadable";
    }
    const { region, data_bucket, ssm_prefix } = value as Record<string, unknown>;
    if (
      typeof region !== "string" ||
      !REGION.test(region) ||
      typeof data_bucket !== "string" ||
      !BUCKET.test(data_bucket) ||
      typeof ssm_prefix !== "string" ||
      ssm_prefix !== `/atlas/${name}/`
    ) {
      return "unreadable";
    }
    read[name] = { region, data_bucket, ssm_prefix };
  }
  return { environments: read };
};
