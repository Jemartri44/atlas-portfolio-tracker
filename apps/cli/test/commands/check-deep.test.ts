import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AssetCreatedEvent,
  encodeLine,
  type LedgerEvent,
  type LedgerSchema,
  type Migration,
} from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { harness, seed } from "../harness.js";

const fixtures = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/ledger",
);
const linesOf = (name: string) =>
  readFileSync(join(fixtures, name), "utf8")
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

describe("atlas check --deep", () => {
  it("is clean on the synthetic golden file and reports the expected warning only", async () => {
    const h = harness({ lines: linesOf("synthetic-v1.jsonl") });
    expect(await h.exec(["check", "--deep"])).toBe(0);
    expect(h.text()).toContain("same_asset_two_accounts");
    expect(h.text()).not.toContain("error");
    h.reset();
    expect(await h.exec(["check", "--deep", "--json"])).toBe(0);
    const report = JSON.parse(h.out.join("\n")) as {
      findings: unknown[];
      deep: unknown[];
      warnings: unknown[];
    };
    expect(report.findings).toEqual([]);
    expect(report.deep).toEqual([]);
    expect(report.warnings).toHaveLength(1);
  });

  it("flags invented fingerprints, duplicate ids and non-canonical lines", async () => {
    const legacy = harness({ lines: linesOf("valid-v1.jsonl") });
    expect(await legacy.exec(["check"])).toBe(0);
    legacy.reset();
    expect(await legacy.exec(["check", "--deep"])).toBe(1);
    expect(legacy.text()).toContain("fingerprint_mismatch");

    const lines = linesOf("synthetic-v1.jsonl").slice(0, 30);
    const duplicated = harness({ lines: [...lines, lines[3] as string] });
    expect(await duplicated.exec(["check"])).toBe(1);
    expect(duplicated.text()).toContain("duplicate_id");
    duplicated.reset();
    expect(await duplicated.exec(["check", "--deep"])).toBe(1);
    expect(duplicated.text()).toContain("duplicate_id");

    const spaced = [...lines];
    spaced[2] = (spaced[2] as string).replace('"type"', ' "type"');
    const canonical = harness({ lines: spaced });
    expect(await canonical.exec(["check", "--deep"])).toBe(0);
    expect(canonical.text()).toContain("non_canonical_line");
  });

  it("reports dangling references and outdated lines, gone after compact", async () => {
    const asset: LedgerEvent = {
      ...(seed()[2] as AssetCreatedEvent),
      id: "01ARYZ6S41TSV4RRFFQ69H0100",
      asset_id: "ast_tracker",
      reference_etf_id: "ast_missing",
    };
    const dangling = harness({ events: [...seed(), asset] });
    expect(await dangling.exec(["check", "--deep"])).toBe(1);
    expect(dangling.text()).toContain("dangling_reference");

    const outdated = harness({
      lines: linesOf("legacy-v1-for-test-schema.jsonl"),
      schema: TEST_SCHEMA_V2,
      instant: "2028-01-15T10:00:00.000Z",
    });
    expect(await outdated.exec(["check", "--deep"])).toBe(0);
    expect(outdated.text()).toContain("outdated_lines");
    outdated.reset();
    expect(await outdated.exec(["compact", "--yes"])).toBe(0);
    outdated.reset();
    expect(await outdated.exec(["check", "--deep"])).toBe(0);
    expect(outdated.text()).toBe("Libro íntegro: sin hallazgos.");
    expect(encodeLine(seed()[0] as never)).toContain("acc_fund");
  });
});
