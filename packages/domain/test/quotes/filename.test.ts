import { describe, expect, it } from "vitest";
import { priceFileName } from "../../src/quotes/line.js";

describe("the file of an asset in prices/", () => {
  it("is its id, and encodes only what could not name a file", () => {
    expect(priceFileName("ast_world")).toBe("ast_world.jsonl");
    expect(priceFileName("a/b")).toBe("a%2Fb.jsonl");
    expect(priceFileName("..")).toBe("%2E..jsonl");
    expect(priceFileName(".x")).toBe("%2Ex.jsonl");
  });
});
