// Feature 015, E1: the device id this browser keeps (docs/api.md §5.4): a key
// of its own, outside the sync:* keys, read back only when well formed.

import { describe, expect, it } from "vitest";
import { LEDGER_STORE } from "../../src/ledger-store/browser/idb.js";
import {
  readWebDeviceId,
  saveWebDeviceId,
  WEB_DEVICE_KEY,
} from "../../src/ledger-store/browser/web-device.js";
import { FakeDatabase } from "../fake-idb.js";

const ID = "AAAAAAAAAAAAAAAAAAAAAA";

describe("the device id of the web", () => {
  it("is kept under its own key, never a sync:* key, and read back", async () => {
    const db = new FakeDatabase([LEDGER_STORE]);
    const open = () => Promise.resolve(db.asIdb());
    expect(await readWebDeviceId(open)).toBeUndefined();
    await saveWebDeviceId(ID, open);
    expect(await readWebDeviceId(open)).toBe(ID);
    expect(WEB_DEVICE_KEY.startsWith("sync:")).toBe(false);
    expect([...db.store(LEDGER_STORE).keys()]).toEqual([WEB_DEVICE_KEY]);
  });

  it("never keeps nor gives back a value that is not a device id", async () => {
    const db = new FakeDatabase([LEDGER_STORE]);
    const open = () => Promise.resolve(db.asIdb());
    await expect(saveWebDeviceId("../x", open)).rejects.toThrow();
    db.store(LEDGER_STORE).set(WEB_DEVICE_KEY, "not-an-id");
    expect(await readWebDeviceId(open)).toBeUndefined();
    db.store(LEDGER_STORE).set(WEB_DEVICE_KEY, 7);
    expect(await readWebDeviceId(open)).toBeUndefined();
  });
});
