// The double has to be right before anything is proved with it.

import { describe, expect, it } from "vitest";
import { FakeDatabase } from "./fake-idb.js";

const settle = (tx: { oncomplete: (() => void) | null; onabort: (() => void) | null }) =>
  new Promise<"complete" | "abort">((resolve) => {
    tx.oncomplete = () => resolve("complete");
    tx.onabort = () => resolve("abort");
  });

describe("the IndexedDB double", () => {
  it("runs the transactions of a store one after the other and commits them by itself", async () => {
    const db = new FakeDatabase(["s"]);
    const order: string[] = [];
    const first = db.transaction("s", "readwrite");
    const second = db.transaction("s", "readonly");
    first.objectStore("s").put("a", "k").onsuccess = () => order.push("put");
    const read = second.objectStore("s").get("k");
    read.onsuccess = () => order.push(`get ${String(read.result)}`);
    expect(await Promise.all([settle(first), settle(second)])).toEqual(["complete", "complete"]);
    expect(order).toEqual(["put", "get a"]);
    expect(db.commits).toHaveLength(1);
    expect(db.commits[0]?.written).toEqual(["k"]);
  });

  it("refuses a request once the transaction is no longer active", async () => {
    const db = new FakeDatabase(["s"]);
    const tx = db.transaction("s", "readwrite");
    const store = tx.objectStore("s");
    const done = settle(tx);
    const late = new Promise<unknown>((resolve) => {
      store.get("k").onsuccess = () => {
        // Anything asynchronous between the read and the write: the trap.
        void Promise.resolve().then(() => {
          try {
            store.put("x", "k");
            resolve("written");
          } catch (error) {
            resolve(error);
          }
        });
      };
    });
    expect(await late).toMatchObject({ name: "TransactionInactiveError" });
    expect(await done).toBe("complete");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(() => store.get("k")).toThrow(/not active/);
  });

  it("aborts on an unhandled failure and rolls back what it wrote", async () => {
    const db = new FakeDatabase(["s"]);
    const setup = db.transaction("s", "readwrite");
    setup.objectStore("s").put("old", "k");
    await settle(setup);
    const tx = db.transaction("s", "readwrite");
    const store = tx.objectStore("s");
    store.put("new", "k");
    store.add("dup", "k");
    expect(await settle(tx)).toBe("abort");
    expect(tx.error?.name).toBe("ConstraintError");
    expect(db.store("s").get("k")).toBe("old");
    const handled = db.transaction("s", "readwrite");
    const request = handled.objectStore("s").add("dup", "k");
    request.onerror = (event) => event.preventDefault();
    handled.objectStore("s").delete("k");
    expect(await settle(handled)).toBe("complete");
    expect(db.store("s").has("k")).toBe(false);
  });

  it("aborts on request, and refuses writes in a read-only one or an unknown store", async () => {
    const db = new FakeDatabase(["s"]);
    const tx = db.transaction("s", "readwrite");
    tx.objectStore("s").put("v", "k");
    tx.abort();
    expect(await settle(tx)).toBe("abort");
    expect(() => tx.abort()).toThrow(/finished/);
    expect(db.store("s").size).toBe(0);
    const ro = db.transaction("s", "readonly");
    ro.objectStore("s").put("v", "k");
    ro.objectStore("s").delete("k").onerror = (event) => event.preventDefault();
    expect(await settle(ro)).toBe("abort");
    expect(() => db.transaction("s").objectStore("t")).toThrow(/not in this transaction/);
    expect(() => db.store("t")).toThrow(/no store/);
    expect(db.asIdb()).toBe(db);
  });
});
