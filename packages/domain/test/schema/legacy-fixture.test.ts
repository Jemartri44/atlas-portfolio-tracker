// The shared legacy fixture (tests/fixtures/ledger/legacy-v1-for-test-schema.jsonl)
// carries the fictitious old field `note`. Under the real schema it loads as
// version 1 with `note` ignored; under TEST_SCHEMA_V2 every line is migrated.

import { describe, expect, it } from "vitest";
import { decodeLine } from "../../src/schema/line.js";
import { fixtureLines } from "../fixtures-path.js";
import { TEST_SCHEMA_V2 } from "./test-schema.js";

const lines = fixtureLines("legacy-v1-for-test-schema.jsonl");

describe("legacy v1 fixture", () => {
  it("has four v1 lines, two of them with the old field", () => {
    expect(lines).toHaveLength(4);
    expect(lines.filter((line) => line.includes('"note":'))).toHaveLength(2);
    expect(lines.every((line) => line.startsWith('{"schema_version":1,'))).toBe(true);
  });

  it("loads with the real schema, keeping note as an unknown field", () => {
    const events = lines.map((line) => decodeLine(line).event);
    expect(events.map((event) => event.schema_version)).toEqual([1, 1, 1, 1]);
    expect((events[2] as { note?: string }).note).toBe("deposit typed by hand");
    expect((events[2] as { notes?: string }).notes).toBeUndefined();
  });

  it("loads with the test schema, migrated in memory to version 2", () => {
    const events = lines.map((line) => decodeLine(line, TEST_SCHEMA_V2).event);
    expect(events.map((event) => event.schema_version)).toEqual([2, 2, 2, 2]);
    expect((events[2] as { notes?: string }).notes).toBe("deposit typed by hand");
    expect((events[3] as { notes?: string }).notes).toBe("bought by phone");
    expect(events.some((event) => "note" in event)).toBe(false);
  });
});
