// What the console keeps to sign in and to sync (ADR-0033, points 3 and 6;
// `data-model.md` §7 and §8): `~/.config/atlas/credentials.json`, **a map by
// `device_id`** — a token per device and per folder —, and the folder's
// `sync/remote.json`, which says which remote the folder syncs with and which
// entry is its own. Read strictly; which entry an order may use is decided
// here, by identity and never by resemblance (B2).

import { isRecord } from "../guards.js";
import { isId22, isInstant } from "./ids.js";
import { DEVICE_TOKEN, parseDeviceToken } from "./token.js";

/** `https://` and a host (and a port), no path: what `ATLAS_ORIGIN` is on the other side. */
export const isHttpsOrigin = (value: unknown): value is string =>
  typeof value === "string" && /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(value);

export interface CredentialEntry {
  readonly origin: string;
  readonly device_id: string;
  readonly token: string;
  readonly token_id: string;
  readonly device_name: string;
  readonly issued_at: string;
  readonly expires_at: string;
  /** The real path of the folder the sign-in was made from: a hint, never a decision alone. */
  readonly folder_hint: string;
}

export interface CredentialsFile {
  readonly credentials_format: 1;
  readonly entries: Readonly<Record<string, CredentialEntry>>;
}

export const EMPTY_CREDENTIALS: CredentialsFile = { credentials_format: 1, entries: {} };

const ENTRY_KEYS = [
  "origin",
  "device_id",
  "token",
  "token_id",
  "device_name",
  "issued_at",
  "expires_at",
  "folder_hint",
];

const isEntry = (key: string, value: unknown): value is CredentialEntry =>
  isRecord(value) &&
  Object.keys(value).length === ENTRY_KEYS.length &&
  ENTRY_KEYS.every((name) => name in value) &&
  isHttpsOrigin(value.origin) &&
  value.device_id === key &&
  isId22(value.device_id) &&
  typeof value.token === "string" &&
  DEVICE_TOKEN.test(value.token) &&
  parseDeviceToken(value.token)?.tokenId === value.token_id &&
  typeof value.device_name === "string" &&
  isInstant(value.issued_at) &&
  isInstant(value.expires_at) &&
  typeof value.folder_hint === "string" &&
  value.folder_hint.startsWith("/");

/**
 * Whether a value is an entry as `credentials.json` keeps it: what the console
 * checks on the answer of an exchange **before** writing anything (review of
 * PR #95, N5), so a broken or hostile answer never makes the file unreadable.
 */
export const isCredentialEntry = (value: unknown): value is CredentialEntry =>
  isRecord(value) && typeof value.device_id === "string" && isEntry(value.device_id, value);

/** Strict: an unknown key, a type that is not its own or a format that is not 1 is unreadable. */
export const parseCredentials = (text: string): CredentialsFile | "unreadable" => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "unreadable";
  }
  if (
    !isRecord(value) ||
    value.credentials_format !== 1 ||
    !isRecord(value.entries) ||
    Object.keys(value).length !== 2
  ) {
    return "unreadable";
  }
  const entries = Object.entries(value.entries);
  return entries.every(([key, entry]) => isEntry(key, entry))
    ? (value as unknown as CredentialsFile)
    : "unreadable";
};

export const serializeCredentials = (file: CredentialsFile): string =>
  `${JSON.stringify(file, null, 2)}\n`;

/** The entry of its `device_id` added or replaced; every other one untouched (mutant 29 bis). */
export const withEntry = (file: CredentialsFile, entry: CredentialEntry): CredentialsFile => ({
  credentials_format: 1,
  entries: { ...file.entries, [entry.device_id]: entry },
});

export const withoutEntry = (file: CredentialsFile, deviceId: string): CredentialsFile => ({
  credentials_format: 1,
  entries: Object.fromEntries(Object.entries(file.entries).filter(([key]) => key !== deviceId)),
});

export interface RemoteJson {
  readonly format: 1;
  readonly origin: string;
  readonly device_id: string;
}

/**
 * `sync/remote.json`: one line, ended by `\n`, **exactly** `format`, `origin`
 * and `device_id` (data-model §8). Anything else is unreadable.
 */
export const parseRemoteJson = (text: string): RemoteJson | "unreadable" => {
  if (!text.endsWith("\n") || text.slice(0, -1).includes("\n")) {
    return "unreadable";
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "unreadable";
  }
  return isRecord(value) &&
    Object.keys(value).length === 3 &&
    value.format === 1 &&
    isHttpsOrigin(value.origin) &&
    isId22(value.device_id)
    ? (value as unknown as RemoteJson)
    : "unreadable";
};

export const serializeRemoteJson = (remote: RemoteJson): string =>
  `${JSON.stringify({ format: 1, origin: remote.origin, device_id: remote.device_id })}\n`;

/**
 * The entry a folder that has `sync/remote.json` uses to sync and to renew:
 * **only the one its `device_id` names, for its origin**, and none other —
 * never another entry of the same origin, which belongs to another folder (B2).
 */
export const entryForRemote = (
  file: CredentialsFile,
  remote: RemoteJson,
): CredentialEntry | undefined => {
  const entry = file.entries[remote.device_id];
  return entry !== undefined && entry.origin === remote.origin ? entry : undefined;
};

/**
 * The entry a folder **without** `sync/remote.json` may use to start (to
 * initialise or to join, E3): one of that origin whose hint is **exactly**
 * this folder, even if it is the only entry of the origin (B2). None: sign in
 * from this folder. Several: `--device`, which has to be one of them.
 */
export const entryForStart = (
  file: CredentialsFile,
  origin: string,
  folder: string,
  chosen: string | undefined,
):
  | { readonly entry: CredentialEntry }
  | { readonly refused: "credentials_no_entry_for_folder" }
  | { readonly refused: "credentials_several_for_folder"; readonly devices: readonly string[] } => {
  const here = Object.values(file.entries).filter(
    (entry) => entry.origin === origin && entry.folder_hint === folder,
  );
  const picked = chosen === undefined ? here : here.filter((entry) => entry.device_id === chosen);
  if (picked.length === 0) {
    return { refused: "credentials_no_entry_for_folder" };
  }
  if (picked.length > 1) {
    return {
      refused: "credentials_several_for_folder",
      devices: picked.map((entry) => entry.device_id).sort(),
    };
  }
  return { entry: picked[0] as CredentialEntry };
};

/**
 * Whether two folders are one inside the other (ADR-0033, point 3): the
 * folder of the credentials and the folder of the ledger never nest, so no
 * copy, export or sync of the ledger can carry a token. Both absolute, real
 * and `/`-separated.
 */
export const foldersNested = (a: string, b: string): boolean => {
  const trim = (path: string): string => (path.length > 1 ? path.replace(/\/+$/, "") : path);
  const x = trim(a);
  const y = trim(b);
  return (
    x === y || x.startsWith(`${y === "/" ? "" : y}/`) || y.startsWith(`${x === "/" ? "" : x}/`)
  );
};

/**
 * The warning of an expiry close by: `expired` once `expires_at` has passed,
 * and otherwise the **whole** days left when they are `warnDays` or fewer —
 * `0` is «less than a day», never «expired» (review of PR #95, N1). Nothing
 * when it is further away.
 */
export const expiryWarning = (
  entry: CredentialEntry,
  nowMs: number,
  warnDays: number,
): number | "expired" | undefined => {
  const leftMs = Date.parse(entry.expires_at) - nowMs;
  if (leftMs <= 0) {
    return "expired";
  }
  const days = Math.floor(leftMs / 86_400_000);
  return days <= warnDays ? days : undefined;
};
