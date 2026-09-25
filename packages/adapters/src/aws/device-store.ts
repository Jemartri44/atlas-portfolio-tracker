// The objects of the devices, `sync/devices/<id>.json` (`docs/api.md` §5.3),
// over the narrow interface of S3. The rules — the key, the strict reading,
// who is alive — are the domain's.

import {
  type DeviceObject,
  deviceKey,
  parseDeviceObject,
  serializeDeviceObject,
} from "@atlas/domain/access";
import type { ObjectStore } from "./object-store.js";

const utf8 = new TextDecoder("utf-8", { fatal: true });

export class DeviceStore {
  constructor(private readonly objects: ObjectStore) {}

  /** The object of a device, `unreadable`, or nothing if it does not exist. */
  async read(deviceId: string): Promise<DeviceObject | "unreadable" | undefined> {
    const stored = await this.objects.get(deviceKey(deviceId));
    if (stored === undefined) {
      return undefined;
    }
    let text: string;
    try {
      text = utf8.decode(stored.body);
    } catch {
      return "unreadable";
    }
    return parseDeviceObject(text, deviceId);
  }

  /** Creates it, **never over another** (`If-None-Match: *`). */
  create(device: DeviceObject): Promise<"created" | "exists"> {
    return this.objects.putIfNoneMatch(
      deviceKey(device.device_id),
      new TextEncoder().encode(serializeDeviceObject(device)),
    );
  }
}
