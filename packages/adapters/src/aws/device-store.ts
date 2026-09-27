// The objects of the devices, `sync/devices/<id>.json` (`docs/api.md` §5.3),
// over the narrow interface of S3. The rules — the key, the strict reading,
// who is alive — are the domain's.

import {
  type DeviceObject,
  deviceKey,
  isId22,
  parseDeviceObject,
  serializeDeviceObject,
} from "@atlas/domain/access";
import type { ObjectStore } from "./object-store.js";

const utf8 = new TextDecoder("utf-8", { fatal: true });
const DEVICES_PREFIX = "sync/devices/";

export class DeviceStore {
  constructor(private readonly objects: ObjectStore) {}

  /** The object of a device, `unreadable`, or nothing if it does not exist. */
  async read(deviceId: string): Promise<DeviceObject | "unreadable" | undefined> {
    return (await this.readForUpdate(deviceId))?.device;
  }

  /** The object and the ETag of S3 it was read at, to write it back on that condition. */
  async readForUpdate(
    deviceId: string,
  ): Promise<{ readonly device: DeviceObject | "unreadable"; readonly etag: string } | undefined> {
    const stored = await this.objects.get(deviceKey(deviceId));
    if (stored === undefined) {
      return undefined;
    }
    let text: string;
    try {
      text = utf8.decode(stored.body);
    } catch {
      return { device: "unreadable", etag: stored.etag };
    }
    return { device: parseDeviceObject(text, deviceId), etag: stored.etag };
  }

  /**
   * Writes it back **only on the ETag it was read at** (`If-Match`): never
   * creating it, never over a write that came in between (§5.3).
   */
  replace(device: DeviceObject, etag: string): Promise<"written" | "precondition_failed"> {
    return this.objects.putIfMatch(
      deviceKey(device.device_id),
      new TextEncoder().encode(serializeDeviceObject(device)),
      etag,
    );
  }

  /** The ids of every object under `sync/devices/`: only those whose name is an id. */
  async ids(): Promise<string[]> {
    return (await this.objects.list(DEVICES_PREFIX))
      .map((object) => object.key.slice(DEVICES_PREFIX.length))
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length))
      .filter((id) => isId22(id));
  }

  /** Creates it, **never over another** (`If-None-Match: *`). */
  create(device: DeviceObject): Promise<"created" | "exists"> {
    return this.objects.putIfNoneMatch(
      deviceKey(device.device_id),
      new TextEncoder().encode(serializeDeviceObject(device)),
    );
  }
}
