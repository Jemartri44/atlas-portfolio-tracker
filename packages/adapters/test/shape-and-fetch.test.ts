import { afterEach, describe, expect, it, vi } from "vitest";
import { reasonOf } from "../src/ecb/source.js";
import { closeOf } from "../src/prices/shape.js";
import { safeFetch } from "../src/safe-fetch.js";

describe("closeOf", () => {
  it("reads a close the reader of the files would read", () => {
    expect(closeOf("2026-02-27", "10.5")).toEqual({ date: "2026-02-27", close: "10.5" });
    expect(closeOf("2028-02-29", "1")).toEqual({ date: "2028-02-29", close: "1" });
  });

  it.each([
    ["2026-02-30", "10.5"],
    ["2026-13-01", "10.5"],
    ["2027-02-29", "10.5"],
    ["2026-02-27", "-1"],
    ["2026-02-27", "0.0"],
    ["2026-02-27", "1e3"],
    [20260227, "10.5"],
    ["2026-02-27", 10.5],
  ])("is not a close: %s %s", (date, close) => {
    expect(closeOf(date, close)).toBeUndefined();
  });
});

describe("the default fetch of the sources", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never follows a redirect and never waits for ever", async () => {
    const fetched = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetched);
    await safeFetch(5_000)("https://example.test/x");
    const [url, init] = fetched.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.test/x");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("the reason of a failed download", () => {
  it("is printable ASCII and at most 120 characters", () => {
    expect(reasonOf(new Error("a\u001b[31mred\nbé"))).toBe("a?[31mred?b?");
    expect(reasonOf(new Error("x".repeat(500)))).toHaveLength(120);
    expect(reasonOf("plain")).toBe("plain");
  });
});
