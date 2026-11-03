import { describe, expect, it } from "vitest";
import { type ObjectStore, writeConditional } from "../../src/aws/object-store.js";

const calls: string[] = [];
const objects = (created: boolean, written: boolean): ObjectStore =>
  ({
    putIfNoneMatch: async (key: string) => {
      calls.push(`none-match ${key}`);
      return created ? "created" : "exists";
    },
    putIfMatch: async (key: string, _body: Uint8Array, etag: string) => {
      calls.push(`match ${key} ${etag}`);
      return written ? "written" : "precondition_failed";
    },
  }) as unknown as ObjectStore;

describe("writeConditional", () => {
  it("creates when nothing was read, and replaces on the etag that was", async () => {
    const body = new Uint8Array([1]);
    expect(await writeConditional(objects(true, false), "k", body, undefined)).toBe(true);
    expect(await writeConditional(objects(false, true), "k", body, '"e"')).toBe(true);
    expect(calls).toEqual(["none-match k", 'match k "e"']);
  });

  it("says false when the precondition did not hold", async () => {
    const body = new Uint8Array([1]);
    expect(await writeConditional(objects(false, true), "k", body, undefined)).toBe(false);
    expect(await writeConditional(objects(true, false), "k", body, '"e"')).toBe(false);
  });
});
