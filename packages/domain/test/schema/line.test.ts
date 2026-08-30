import { describe, expect, it } from "vitest";
import { SchemaTooNewError, ValidationError } from "../../src/errors.js";
import { decodeLine, encodeLine } from "../../src/schema/line.js";
import { SAMPLES, sampleList } from "../samples.js";

describe("encodeLine / decodeLine", () => {
  it("round-trips every sample as a single JSON line", () => {
    for (const sample of sampleList()) {
      const line = encodeLine(sample);
      expect(line.includes("\n")).toBe(false);
      const decoded = decodeLine(line);
      expect(decoded.event).toEqual(sample);
      expect(decoded.raw).toBe(line);
    }
  });

  it("writes the envelope keys first, in a fixed order", () => {
    const shuffled = Object.fromEntries(
      Object.entries(SAMPLES.buy).reverse(),
    ) as typeof SAMPLES.buy;
    const line = encodeLine({ ...shuffled, corrects_id: SAMPLES.sell.id });
    expect(line.startsWith('{"schema_version":1,"id":"')).toBe(true);
    expect(Object.keys(JSON.parse(line)).slice(0, 5)).toEqual([
      "schema_version",
      "id",
      "recorded_at",
      "type",
      "corrects_id",
    ]);
  });

  it("rejects invalid JSON, non-objects, numbers in amounts and newer schema versions", () => {
    expect(() => decodeLine("{")).toThrow(ValidationError);
    expect(() => decodeLine("[]")).toThrow(ValidationError);
    expect(() => decodeLine("42")).toThrow(ValidationError);
    expect(() => decodeLine(encodeLine(SAMPLES.buy).replace('"fee":"0"', '"fee":0'))).toThrow(
      ValidationError,
    );
    expect(() =>
      decodeLine(encodeLine(SAMPLES.buy).replace('"schema_version":1', '"schema_version":2')),
    ).toThrow(SchemaTooNewError);
  });
});
