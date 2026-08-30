import { describe, expect, it } from "vitest";
import { SchemaTooNewError, ValidationError } from "../../src/errors.js";
import { canonicalLine, decodeLine, encodeLine, parseLine } from "../../src/schema/line.js";
import { SAMPLES, sampleList } from "../samples.js";
import { TEST_SCHEMA_V2 } from "./test-schema.js";

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

  it("decodes with an injected schema: migrates old lines and rejects newer ones", () => {
    const oldLine = encodeLine({ ...SAMPLES.cash_deposit, note: "typed by hand" } as never);
    expect(() => decodeLine(oldLine, TEST_SCHEMA_V2)).not.toThrow();
    const decoded = decodeLine(oldLine, TEST_SCHEMA_V2).event;
    expect(decoded.schema_version).toBe(2);
    expect((decoded as { notes?: string }).notes).toBe("typed by hand");
    expect("note" in decoded).toBe(false);
    expect(decodeLine(oldLine, TEST_SCHEMA_V2).raw).toBe(oldLine);
    expect(() =>
      decodeLine(oldLine.replace('"schema_version":1', '"schema_version":3'), TEST_SCHEMA_V2),
    ).toThrow(SchemaTooNewError);
    expect(() => decodeLine(oldLine.replace('"schema_version":1', '"schema_version":2'))).toThrow(
      SchemaTooNewError,
    );
  });

  it("parses raw records and writes them canonically without migrating", () => {
    expect(parseLine('{"a":1}')).toEqual({ a: 1 });
    expect(() => parseLine("{")).toThrow(ValidationError);
    expect(() => parseLine("null")).toThrow(ValidationError);
    const reordered =
      '{"type":"cash_deposit","amount":"1","id":"01ARYZ6S41TSV4RRFFQ69G5FAB","schema_version":1}';
    expect(canonicalLine(parseLine(reordered))).toBe(
      '{"schema_version":1,"id":"01ARYZ6S41TSV4RRFFQ69G5FAB","type":"cash_deposit","amount":"1"}',
    );
    expect(canonicalLine(parseLine(encodeLine(SAMPLES.buy)))).toBe(encodeLine(SAMPLES.buy));
  });
});
