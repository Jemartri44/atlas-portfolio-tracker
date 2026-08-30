import { describe, expect, it } from "vitest";
import { DomainError, SchemaTooNewError, ValidationError } from "../../src/errors.js";
import {
  CURRENT_LEDGER_SCHEMA,
  type LedgerSchema,
  type Migration,
  migrate,
} from "../../src/schema/migrations/index.js";
import { SAMPLES } from "../samples.js";
import { TEST_SCHEMA_V2 } from "./test-schema.js";

describe("migrate", () => {
  it("returns a version 1 line untouched with the empty default schema", () => {
    expect(CURRENT_LEDGER_SCHEMA.version).toBe(1);
    expect(CURRENT_LEDGER_SCHEMA.migrations.size).toBe(0);
    const line = { ...SAMPLES.buy };
    expect(migrate(line)).toBe(line);
  });

  it("rejects missing, non-integer and future versions", () => {
    expect(() => migrate({ ...SAMPLES.buy, schema_version: undefined })).toThrow(ValidationError);
    expect(() => migrate({ ...SAMPLES.buy, schema_version: "1" })).toThrow(ValidationError);
    expect(() => migrate({ ...SAMPLES.buy, schema_version: 0 })).toThrow(ValidationError);
    expect(() => migrate({ ...SAMPLES.buy, schema_version: 2 })).toThrow(SchemaTooNewError);
    expect(() => migrate({ ...SAMPLES.buy, schema_version: 3 }, TEST_SCHEMA_V2)).toThrow(
      SchemaTooNewError,
    );
  });

  it("applies the steps in order and stamps the version", () => {
    const schema: LedgerSchema = {
      version: 3,
      migrations: new Map<number, Migration>([
        [1, (line) => ({ ...line, fee: line.fee ?? "0" })],
        [2, (line) => ({ ...line, renamed: line.fee })],
      ]),
    };
    const migrated = migrate({ schema_version: 1, type: "buy" }, schema);
    expect(migrated).toEqual({ schema_version: 3, type: "buy", fee: "0", renamed: "0" });
    expect(migrate({ schema_version: 2, type: "buy", fee: "1" }, schema)).toEqual({
      schema_version: 3,
      type: "buy",
      fee: "1",
      renamed: "1",
    });
  });

  it("fails loudly when a step is missing from the chain", () => {
    const schema: LedgerSchema = {
      version: 3,
      migrations: new Map<number, Migration>([[2, (line) => line]]),
    };
    expect(() => migrate({ schema_version: 1 }, schema)).toThrow(DomainError);
  });

  it("renames note to notes under the test schema and leaves lines without note alone", () => {
    const old = { ...SAMPLES.cash_deposit, note: "old field" };
    expect(migrate(old, TEST_SCHEMA_V2)).toEqual({
      ...SAMPLES.cash_deposit,
      schema_version: 2,
      notes: "old field",
    });
    expect(migrate({ ...SAMPLES.cash_deposit }, TEST_SCHEMA_V2)).toEqual({
      ...SAMPLES.cash_deposit,
      schema_version: 2,
    });
    expect(migrate({ ...SAMPLES.cash_deposit, schema_version: 2 }, TEST_SCHEMA_V2)).toEqual({
      ...SAMPLES.cash_deposit,
      schema_version: 2,
    });
  });
});
