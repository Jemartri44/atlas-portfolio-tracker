import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeLine, type LedgerSchema, type Migration } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { harness, seed } from "../harness.js";

const fixtures = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/ledger",
);
const legacyLines = readFileSync(join(fixtures, "legacy-v1-for-test-schema.jsonl"), "utf8")
  .split("\n")
  .filter((line) => line !== "");

const renameNote: Migration = (line) => {
  if (line.note === undefined) {
    return line;
  }
  const { note, ...rest } = line;
  return { ...rest, notes: note };
};
const TEST_SCHEMA_V2: LedgerSchema = { version: 2, migrations: new Map([[1, renameNote]]) };

describe("atlas compact", () => {
  it("shows the plan, asks, rewrites and reports the archive", async () => {
    const h = harness({
      lines: legacyLines,
      schema: TEST_SCHEMA_V2,
      instant: "2028-01-15T10:00:00.000Z",
    });
    const original = h.store.toText();
    expect(await h.exec(["compact", "--yes"])).toBe(0);
    expect(h.text()).toContain("v1: 4");
    expect(h.text()).toContain("Compactado: 4 líneas → 4 líneas en schema_version 2");
    expect(h.text()).toContain("archive/ledger-2028-01-15-v1.jsonl");
    expect(h.store.archives.get("ledger-2028-01-15-v1.jsonl")).toBe(original);
    expect(
      h.store
        .toText()
        .split("\n")
        .filter((l) => l !== "")
        .every((l) => l.includes('"schema_version":2')),
    ).toBe(true);
    h.reset();
    expect(await h.exec(["compact", "--yes"])).toBe(0);
    expect(h.text()).toContain("Nada que compactar: las 4 líneas están en schema_version 2");
  });

  it("does nothing on a current ledger, asks before writing and reports as JSON", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(["compact"])).toBe(0);
    expect(h.text()).toContain("Nada que compactar");
    const asking = harness({ lines: legacyLines, schema: TEST_SCHEMA_V2 });
    expect(await asking.exec(["compact"])).toBe(4);
    expect(asking.store.archives.size).toBe(0);
    const declining = harness({ lines: legacyLines, schema: TEST_SCHEMA_V2, confirm: false });
    expect(await declining.exec(["compact"])).toBe(0);
    expect(declining.text()).toContain("Cancelado.");
    expect(declining.store.archives.size).toBe(0);
    const json = harness({
      lines: legacyLines,
      schema: TEST_SCHEMA_V2,
      instant: "2028-01-15T10:00:00.000Z",
    });
    expect(await json.exec(["compact", "--yes", "--json"])).toBe(0);
    expect(JSON.parse(json.out.join("\n"))).toMatchObject({
      status: "compacted",
      archiveName: "ledger-2028-01-15-v1.jsonl",
      linesBefore: 4,
      targetVersion: 2,
    });
  });

  it("refuses a ledger with invalid events (exit 1) and lists them", async () => {
    const invalid = [
      ...legacyLines,
      encodeLine({
        schema_version: 1,
        id: "01ARYZ6S41TSV4RRFFQ69H0009",
        recorded_at: "2027-01-01T18:00:00.000Z",
        type: "cash_withdrawal",
        account_id: "acc_missing",
        value_date: "2027-01-01",
        amount: "1",
        currency: "EUR",
        fx_rate: "1",
        fingerprint: "sha256:x",
      }),
    ];
    const h = harness({ lines: invalid, schema: TEST_SCHEMA_V2 });
    expect(await h.exec(["compact", "--yes"])).toBe(1);
    expect(h.text()).toContain("eventos inválidos");
    expect(h.text()).toContain("acc_missing");
    expect(h.store.archives.size).toBe(0);
  });
});
