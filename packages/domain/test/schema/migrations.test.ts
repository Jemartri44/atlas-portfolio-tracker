import { describe, expect, it } from "vitest";
import { DomainError, SchemaTooNewError, ValidationError } from "../../src/errors.js";
import {
  MIGRATIONS,
  type Migration,
  type MigrationChain,
  migrate,
} from "../../src/schema/migrations/index.js";
import { SAMPLES } from "../samples.js";

describe("migrate", () => {
  it("returns a version 1 line untouched with the empty default chain", () => {
    expect(MIGRATIONS.target).toBe(1);
    expect(MIGRATIONS.steps.size).toBe(0);
    const line = { ...SAMPLES.buy };
    expect(migrate(line)).toBe(line);
  });

  it("rejects missing, non-integer and future versions", () => {
    expect(() => migrate({ ...SAMPLES.buy, schema_version: undefined })).toThrow(ValidationError);
    expect(() => migrate({ ...SAMPLES.buy, schema_version: "1" })).toThrow(ValidationError);
    expect(() => migrate({ ...SAMPLES.buy, schema_version: 0 })).toThrow(ValidationError);
    expect(() => migrate({ ...SAMPLES.buy, schema_version: 2 })).toThrow(SchemaTooNewError);
  });

  it("applies the steps in order and stamps the version", () => {
    const chain: MigrationChain = {
      target: 3,
      steps: new Map<number, Migration>([
        [1, (line) => ({ ...line, fee: line.fee ?? "0" })],
        [2, (line) => ({ ...line, renamed: line.fee })],
      ]),
    };
    const migrated = migrate({ schema_version: 1, type: "buy" }, chain);
    expect(migrated).toEqual({ schema_version: 3, type: "buy", fee: "0", renamed: "0" });
    expect(migrate({ schema_version: 2, type: "buy", fee: "1" }, chain)).toEqual({
      schema_version: 3,
      type: "buy",
      fee: "1",
      renamed: "1",
    });
  });

  it("fails loudly when a step is missing from the chain", () => {
    const chain: MigrationChain = {
      target: 3,
      steps: new Map<number, Migration>([[2, (line) => line]]),
    };
    expect(() => migrate({ schema_version: 1 }, chain)).toThrow(DomainError);
  });
});
