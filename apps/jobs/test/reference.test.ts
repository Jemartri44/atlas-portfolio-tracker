import type { LedgerState } from "@atlas/domain";
import { priceFileName } from "@atlas/domain/quotes";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeS3 } from "../../../packages/adapters/test/aws/test-only-fake-s3.js";
import { readReference } from "../src/reference.js";

describe("readReference", () => {
  it("degrades to no automatic prices only when the files do not read", async () => {
    const s3 = new TestOnlyFakeS3();
    s3.seed(`prices/${priceFileName("ast_a")}`, "");
    s3.seed("prices/symbols.json", "{not json");
    const state = { assets: new Map([["ast_a", {}]]) } as unknown as LedgerState;
    const read = await readReference(s3, state);
    expect(read.external).toBeUndefined();
    expect(read.counts.price_files).toBe(0);
  });

  it("hands the closes to the valuation when the files read", async () => {
    const s3 = new TestOnlyFakeS3();
    s3.seed(`prices/${priceFileName("ast_a")}`, "");
    const state = { assets: new Map([["ast_a", {}]]) } as unknown as LedgerState;
    const read = await readReference(s3, state);
    expect(read.external).toBeDefined();
    expect(read.counts.price_files).toBe(1);
  });
});
