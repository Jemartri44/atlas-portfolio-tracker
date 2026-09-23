import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SETTINGS, encodeLine, type LedgerSchema, type Migration } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { EXIT } from "../../src/context.js";
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
        fx_rate_date: "2027-01-01",
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

/**
 * **A ledger that cannot be compacted is frozen for ever** (ADR-0025), because
 * compacting is the only way of migrating it to a new schema version. The way
 * out is refused by default, asked for **by name**, and recorded in the ledger
 * itself — after resealing, that line is the only trace left.
 */
describe("atlas compact and a fingerprint that cannot be verified", () => {
  /** The legacy ledger plus a filing sealed over it, with a line edited afterwards. */
  const tampered = () => {
    const before = legacyLines.map((line) => JSON.parse(line) as Record<string, unknown>);
    const filing = {
      schema_version: 1,
      id: "01ARYZ6S41TSV4RRFFQ69G5FKM",
      recorded_at: "2028-01-10T10:00:00.000Z",
      type: "tax_return_filed",
      model: "renta",
      tax_year: 2027,
      filed_at: "2028-01-10",
      receipt_reference: "100-2027-ABCDEFGHIJKL",
      declared: { savings_base_eur: "0", pending_losses: [], deferred_losses_eur: "0" },
      computed: {
        as_of: "2028-01-10",
        settings_origin: "default",
        settings: DEFAULT_SETTINGS,
        savings_base_eur: "0",
        pending_losses: [],
        deferred_losses_eur: "0",
      },
      // Sealed over a prefix whose digest will not hold: the point of the case.
      ledger_fingerprint: {
        schema_version: 1,
        lines: before.length,
        sha256: "0".repeat(64),
      },
      fingerprint: "sha256:filing",
    };
    return [...legacyLines, JSON.stringify(filing)];
  };

  /**
   * When the compaction does **not** go through, nothing may have announced
   * that the waiver is recorded: it is not (review of feature 011).
   */
  it("says nothing is recorded when the compaction does not go through", async () => {
    const h = harness({
      lines: tampered(),
      schema: TEST_SCHEMA_V2,
      instant: "2028-01-15T10:00:00.000Z",
      confirm: false,
    });
    await h.exec(["compact", "--accept-unverified", "01ARYZ6S41TSV4RRFFQ69G5FKM"]);
    expect(h.text()).toContain("Cancelado.");
    expect(h.text()).not.toContain("Registrado");
    expect(h.text()).not.toContain("Queda registrado");
  });

  it("refuses by default: nobody compacts a broken fingerprint by accident", async () => {
    const h = harness({
      lines: tampered(),
      schema: TEST_SCHEMA_V2,
      instant: "2028-01-15T10:00:00.000Z",
      confirm: true,
    });
    expect(await h.exec(["compact"])).toBe(EXIT.domain);
    expect(h.text()).toContain("declaración presentada");
    expect(h.store.archives.size).toBe(0);
  });

  it("names what is given up before asking, and records it in the ledger", async () => {
    const h = harness({
      lines: tampered(),
      schema: TEST_SCHEMA_V2,
      instant: "2028-01-15T10:00:00.000Z",
      confirm: true,
    });
    const code = await h.exec(["compact", "--accept-unverified", "01ARYZ6S41TSV4RRFFQ69G5FKM"]);
    expect(code).toBe(0);
    // What it costs is on screen **before** the question, named one by one —
    // and "it is recorded" only **after** the compaction has gone through,
    // never before: that is not known until then.
    const text = h.text();
    expect(text).toContain("renunciando a verificar la huella");
    expect(text).toContain("01ARYZ6S41TSV4RRFFQ69G5FKM");
    expect(text.indexOf("Registrado en tus propios datos")).toBeGreaterThan(
      text.indexOf("Compactado:"),
    );
    const { events } = await h.store.load();
    const waiver = events.find((event) => event.type === "filing_fingerprint_waived");
    expect(waiver).toBeDefined();
  });

  /**
   * **The review found it by trying**: `atlas delete <waiver> --reason limpiar`
   * returned 0, and afterwards `atlas check` answered "Libro íntegro: sin
   * hallazgos". The way out had become a way of cleaning the record.
   */
  it("refuses to annul the waiver, and check keeps saying it", async () => {
    const h = harness({
      lines: tampered(),
      schema: TEST_SCHEMA_V2,
      instant: "2028-01-15T10:00:00.000Z",
      confirm: true,
    });
    await h.exec(["compact", "--accept-unverified", "01ARYZ6S41TSV4RRFFQ69G5FKM"]);
    const { events } = await h.store.load();
    const waiver = events.find((event) => event.type === "filing_fingerprint_waived");
    h.reset();
    expect(await h.exec(["delete", waiver?.id as string, "--reason", "limpiar", "--yes"])).toBe(
      EXIT.domain,
    );
    expect(h.text()).toContain("No se puede anular la renuncia");
    h.reset();
    await h.exec(["check"]);
    expect(h.text()).not.toContain("Libro íntegro");
    expect(h.text()).toContain("nunca llegó a comprobarse");
  });

  it("says it for ever afterwards, in check", async () => {
    const h = harness({
      lines: tampered(),
      schema: TEST_SCHEMA_V2,
      instant: "2028-01-15T10:00:00.000Z",
      confirm: true,
    });
    await h.exec(["compact", "--accept-unverified", "01ARYZ6S41TSV4RRFFQ69G5FKM"]);
    h.reset();
    await h.exec(["check"]);
    expect(h.text()).toContain("filing_fingerprint_waived");
  });
});
