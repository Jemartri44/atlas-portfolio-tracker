import { describe, expect, it } from "vitest";
import { deepCheck } from "../../src/projections/deep-check.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { LedgerEvent } from "../../src/schema/events.js";
import { decodeLine, encodeLine } from "../../src/schema/line.js";
import type { LedgerSchema, Migration } from "../../src/schema/migrations/index.js";
import { knownFieldsOf } from "../../src/schema/validate.js";
import { generateLedger } from "../../src/synth/scenario.js";
import { compactLedger, planCompact } from "../../src/usecases/compact.js";
import { fixtureLines } from "../fixtures-path.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { TestStore } from "../memory-store.js";
import { TEST_SCHEMA_V2 } from "../schema/test-schema.js";

const check = (lines: readonly string[], schema = undefined as never) => {
  const events = lines.map((line) => decodeLine(line, schema).event);
  return deepCheck(lines, events, projectLedger(events, { collectErrors: true }), schema);
};

const codes = (lines: readonly string[]) => check(lines).map((f) => `${f.severity}:${f.code}`);

describe("deepCheck", () => {
  it("finds nothing in the synthetic golden file", () => {
    expect(check(fixtureLines("synthetic-v1.jsonl"))).toEqual([]);
  });

  it("reports duplicate ids with their line numbers and skips the reproduction check", () => {
    const events = generateLedger({ seed: 3 }).slice(0, 20);
    const lines = events.map(encodeLine);
    const duplicated = [...lines, lines[5] as string];
    const findings = deepCheck(
      duplicated,
      [...events, events[5] as LedgerEvent],
      projectLedger(events),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "error", code: "duplicate_id" });
    expect(findings[0]?.message).toContain("lines 6, 21");
  });

  it("detects a fingerprint that no longer matches the fields (a line edited by hand)", () => {
    const lines = generateLedger({ seed: 3 }).slice(0, 25).map(encodeLine);
    const index = lines.findIndex((line) => line.includes('"type":"buy"'));
    const edited = [...lines];
    edited[index] = (edited[index] as string).replace(/"quantity":"[0-9.]+"/, '"quantity":"999"');
    const findings = check(edited);
    expect(findings.map((f) => f.code)).toEqual(["fingerprint_mismatch"]);
    expect(findings[0]?.event_ids).toEqual([JSON.parse(edited[index] as string).id]);
    // The 001 fixture carries invented fingerprints: the check flags every one of them.
    const legacy = check(fixtureLines("valid-v1.jsonl"));
    expect(legacy.filter((f) => f.code === "fingerprint_mismatch").length).toBeGreaterThan(0);
  });

  it("warns about non-canonical lines without changing the outcome of the projection", () => {
    const lines = generateLedger({ seed: 3 }).slice(0, 12).map(encodeLine);
    const record = JSON.parse(lines[11] as string) as Record<string, unknown>;
    const { schema_version, ...rest } = record;
    lines[11] = JSON.stringify({ ...rest, schema_version }, null, 1).replaceAll("\n", "");
    expect(codes(lines)).toEqual(["warning:non_canonical_line"]);
  });

  it("warns about outdated lines under a newer schema, and not after compact", async () => {
    const lines = fixtureLines("legacy-v1-for-test-schema.jsonl");
    const events = lines.map((line) => decodeLine(line, TEST_SCHEMA_V2).event);
    const state = projectLedger(events, { collectErrors: true });
    const findings = deepCheck(lines, events, state, TEST_SCHEMA_V2);
    expect(findings.map((f) => f.code)).toEqual(["outdated_lines"]);
    expect(findings[0]?.message).toContain("4 lines below schema_version 2 (v1: 4)");
    expect(findings[0]?.message).toContain("atlas compact");
    const store = TestStore.fromLines(lines, TEST_SCHEMA_V2);
    const clock = { now: () => new Date("2028-01-15T10:00:00.000Z") };
    await compactLedger({ store, clock }, await planCompact({ store, clock }));
    const reloaded = await store.load();
    expect(
      deepCheck(reloaded.lines, reloaded.events, projectLedger(reloaded.events), TEST_SCHEMA_V2),
    ).toEqual([]);
    // Under the real schema the legacy field `note` is unknown, and nothing is outdated.
    expect(codes(lines)).toEqual(["warning:unknown_field", "warning:unknown_field"]);
    // Two outdated versions are counted separately in the message.
    const v3: LedgerSchema = {
      version: 3,
      migrations: new Map<number, Migration>([...TEST_SCHEMA_V2.migrations, [2, (line) => line]]),
    };
    const mixed = [
      ...lines,
      (lines[0] as string)
        .replace('"schema_version":1', '"schema_version":2')
        .replace('"id":"01ARYZ6S41TSV4RRFFQ69H0000"', '"id":"01ARYZ6S41TSV4RRFFQ69H0055"'),
    ];
    const mixedEvents = mixed.map((line) => decodeLine(line, v3).event);
    const mixedFindings = deepCheck(
      mixed,
      mixedEvents,
      projectLedger(mixedEvents, { collectErrors: true }),
      v3,
    );
    expect(mixedFindings.map((f) => f.code)).toEqual(["outdated_lines"]);
    expect(mixedFindings[0]?.message).toContain("(v1: 4, v2: 1)");
  });

  it("knows the fields of every type, settings included", () => {
    expect(knownFieldsOf("settings_changed")).toContain("settings");
    expect(knownFieldsOf("buy")).toContain("thesis_id");
    expect(knownFieldsOf("buy")).toContain("corrects_id");
    expect(knownFieldsOf("reversal")).not.toContain("settings");
  });

  it("flags a state that the text does not reproduce", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_fund" });
    const events = b.build();
    const lines = events.map(encodeLine);
    const other = projectLedger(events.slice(0, -1));
    const findings = deepCheck(lines, events, other);
    expect(findings.map((f) => f.code)).toEqual(["projection_not_reproducible"]);
    expect(findings[0]?.message).toContain("cash");
    expect(deepCheck(lines, events, projectLedger(events))).toEqual([]);
  });

  it("ignores events without fingerprint and events of reserved types", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const events = b.build();
    expect(deepCheck(events.map(encodeLine), events, projectLedger(events))).toEqual([]);
    // A reserved type (none today) carries no rules: its fingerprint is not judged.
    const reserved = {
      ...b.nextEnvelope("future_event" as never),
      fingerprint: "x",
    } as LedgerEvent;
    expect(deepCheck([], [reserved], projectLedger([]))).toEqual([]);
  });
});
