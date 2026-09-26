// The routes of the sync and of the reference data (feature 015, E3;
// `docs/api.md` §5 and §6). They decide nothing: what a line is worth is the
// domain's `acceptAppend` and `acceptInit`, what a device may publish is
// `publishedDevice`, what a name of the reference data may be is
// `referenceKey`. The remote ledger is reached only through
// `AppendOnlyLedger`: read and append, never rewrite, never delete.

import type { AppendOnlyLedger, DeviceStore, ListedObject, ObjectStore } from "@atlas/adapters/aws";
import { ConflictError, CURRENT_LEDGER_SCHEMA, sha256Hex } from "@atlas/domain";
import {
  type ApiConfig,
  type ApiRefusal,
  type DeviceType,
  deviceRefusal,
  ifNoneMatchHits,
  publishedDevice,
  type ReferenceKind,
  referenceContentType,
  referenceIndex,
  referenceKey,
  refusal,
  refusalOfRemote,
  requestedEtag,
  versionOf,
} from "@atlas/domain/access";
import {
  acceptAppend,
  acceptInit,
  EMPTY_ETAG,
  linesOfText,
  parseAppendBody,
  parseInitBody,
  parsePublishBody,
  RemoteError,
  type RemoteRules,
} from "@atlas/domain/sync";
import { fail, type Outcome } from "./outcome.js";
import { bytes, json, notModified } from "./respond.js";

/** The device a checked credential speaks for: the cookie's or the token's, never the body's. */
export interface SyncCredential {
  readonly deviceId: string;
  readonly type: DeviceType;
  readonly tokenId?: string;
}

export interface SyncContext {
  readonly config: ApiConfig;
  readonly ledger: AppendOnlyLedger;
  readonly objects: ObjectStore;
  readonly devices: DeviceStore;
  readonly now: () => Date;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** A rule of the domain that said no, with its own code; anything else goes on up. */
const judged = <T>(run: () => T): T | ApiRefusal => {
  try {
    return run();
  } catch (error) {
    if (error instanceof RemoteError) {
      return refusalOfRemote(error);
    }
    throw error;
  }
};

const isRefusal = (value: unknown): value is ApiRefusal =>
  typeof value === "object" && value !== null && "status" in value && "code" in value;

export const syncRoutes = (context: SyncContext) => {
  const { ledger, devices, objects, config } = context;

  const rules = (): RemoteRules => ({
    schema: CURRENT_LEDGER_SCHEMA,
    now: context.now(),
    clockToleranceMs: config.clockToleranceSeconds * 1000,
  });

  /** The remote as it is: its bytes, their etag and its lines. */
  const remote = async () => {
    const body = await ledger.read();
    return { body, etag: sha256Hex(body), lines: linesOfText(utf8.decode(body)) };
  };

  /** `GET /api/ledger` (§5.1): the exact bytes and their SHA-256, uninterpreted. */
  const readLedger = async (): Promise<Outcome> => {
    const body = await ledger.read();
    return {
      result: bytes(200, body, {
        "content-type": "application/x-ndjson; charset=utf-8",
        etag: `"${sha256Hex(body)}"`,
      }),
      code: "ledger_read",
    };
  };

  /** `POST /api/ledger/lines` (§5.2): the valid stretch, in one conditional write. */
  const appendLines = async (ifMatch: string | undefined, body: unknown): Promise<Outcome> => {
    const asked = requestedEtag(ifMatch);
    if ("absent" in asked) {
      return fail(refusal("precondition_required"));
    }
    const entries = judged(() => parseAppendBody(body));
    if (isRefusal(entries)) {
      return fail(entries);
    }
    const current = await remote();
    if (asked.etag !== current.etag) {
      return fail(refusal("precondition_failed"));
    }
    const judgement = acceptAppend(current.lines, entries, rules());
    let etag = current.etag;
    if (judgement.accepted > 0) {
      try {
        etag = (await ledger.appendLines(judgement.lines, current.etag)).etag;
      } catch (error) {
        if (error instanceof ConflictError) {
          return fail(refusal("precondition_failed"));
        }
        throw error;
      }
    }
    return {
      result: json(200, {
        etag,
        lines: current.lines.length + judgement.lines.length,
        accepted: judgement.accepted,
        ...(judgement.rejected === undefined ? {} : { rejected: judgement.rejected }),
      }),
      code: judgement.rejected === undefined ? "lines_appended" : "line_rejected",
    };
  };

  /** `PUT /api/ledger` (§5.5): the whole bytes of the first device, on an empty remote only. */
  const initialise = async (ifMatch: string | undefined, body: unknown): Promise<Outcome> => {
    const asked = requestedEtag(ifMatch);
    if ("absent" in asked) {
      return fail(refusal("precondition_required"));
    }
    if (asked.etag !== EMPTY_ETAG) {
      return fail(refusal("precondition_failed"));
    }
    const init = judged(() => parseInitBody(body));
    if (isRefusal(init)) {
      return fail(init);
    }
    // A remote that is not empty is refused by the write itself: appending on
    // the etag of zero bytes is a ConflictError (412) unless it is empty.
    const lines = judged(() => acceptInit(init.content, init.confirm_duplicate_ids, rules()));
    if (isRefusal(lines)) {
      return fail(lines);
    }
    try {
      const written = await ledger.appendLines(lines, EMPTY_ETAG);
      return {
        result: json(200, { etag: written.etag, lines: lines.length }),
        code: "initialised",
      };
    } catch (error) {
      if (error instanceof ConflictError) {
        return fail(refusal("precondition_failed"));
      }
      throw error;
    }
  };

  /**
   * `PUT /api/sync/devices/self` (§5.3): on the object the credential names,
   * **never creating it**, keeping what it is, and only on the ETag it was
   * read at. If another write crossed it, it is read again: forgotten in
   * between is `device_forgotten`, anything else `412`.
   */
  const publish = async (credential: SyncCredential, body: unknown): Promise<Outcome> => {
    const state = judged(() => parsePublishBody(body));
    if (isRefusal(state)) {
      return fail(state);
    }
    const stored = await devices.readForUpdate(credential.deviceId);
    const reason = deviceRefusal(stored?.device, credential.type);
    if (reason !== undefined || stored === undefined || typeof stored.device !== "object") {
      return fail(refusal("device_forgotten", { reason: reason ?? "unreadable" }));
    }
    const publishedAt = context.now().toISOString();
    const next = publishedDevice(stored.device, state, publishedAt);
    if (isRefusal(next)) {
      return fail(next);
    }
    if ((await devices.replace(next, stored.etag)) === "precondition_failed") {
      const again = deviceRefusal(await devices.read(credential.deviceId), credential.type);
      return fail(
        again === undefined
          ? refusal("precondition_failed")
          : refusal("device_forgotten", { reason: again }),
      );
    }
    return {
      result: json(200, { device_id: credential.deviceId, published_at: publishedAt }),
      code: "device_published",
    };
  };

  /** `GET /api/sync/devices` (§5.3, session only): every device, with its type and state. */
  const listDevices = async (): Promise<Outcome> => {
    const rows: Record<string, unknown>[] = [];
    let unreadable = false;
    for (const deviceId of await devices.ids()) {
      const device = await devices.read(deviceId);
      if (typeof device !== "object") {
        unreadable = true;
        rows.push({ device_id: deviceId, state: "unreadable" });
        continue;
      }
      rows.push({
        device_id: device.device_id,
        type: device.type,
        state: device.state,
        pending: device.pending,
        held: device.held,
        ...(device.last_sync_at === undefined ? {} : { last_sync_at: device.last_sync_at }),
        ...(device.published_at === undefined ? {} : { published_at: device.published_at }),
      });
    }
    return {
      result: json(200, { devices: rows }),
      ...(unreadable ? { reason: "device_object_unreadable" } : {}),
    };
  };

  /** `GET /api/reference/index` (§6): the first level of each prefix. */
  const indexReference = async (): Promise<Outcome> => {
    const [ecb, prices]: (readonly ListedObject[])[] = await Promise.all([
      objects.list("reference/ecb/"),
      objects.list("prices/"),
    ]);
    return { result: json(200, referenceIndex(ecb ?? [], prices ?? [])) };
  };

  /** `GET /api/reference/<kind>/<name>` (§6): the name checked **before** S3 is touched. */
  const readReference = async (
    kind: ReferenceKind,
    name: string,
    ifNoneMatch: string | undefined,
  ): Promise<Outcome> => {
    const key = referenceKey(kind, name);
    if ("code" in key) {
      return fail(key);
    }
    const type = referenceContentType(name);
    if (type === undefined) {
      return fail(refusal("not_found", { reason: "type" }));
    }
    const stored = await objects.get(key.key);
    if (stored === undefined) {
      return fail(refusal("not_found", { reason: "missing" }));
    }
    const version = versionOf(stored.etag);
    const headers = { etag: `"${version}"` };
    if (ifNoneMatchHits(ifNoneMatch, version)) {
      return { result: notModified(headers), code: "not_modified" };
    }
    return { result: bytes(200, stored.body, { ...headers, "content-type": type }) };
  };

  return {
    readLedger,
    appendLines,
    initialise,
    publish,
    listDevices,
    indexReference,
    readReference,
  };
};
