// atlas tax <año>: the console only prints, as JSON, what the domain computed (the figures and the
// text of the report are the domain's and the web's); here, that the report is complete, that the
// boxes come out too, and that the refusals speak Spanish.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXIT } from "../../src/context.js";
import { harness } from "../harness.js";
import { LEDGER_FIXTURES } from "../support/fixtures.js";

const goldenLines = (): string[] =>
  readFileSync(join(LEDGER_FIXTURES, "synthetic-v1.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line !== "");

/** Standing in 2029: every window of 2027 is closed. */
const golden = () => harness({ lines: goldenLines(), instant: "2029-03-01T10:00:00.000Z" });

describe("atlas tax", () => {
  it("prints the whole report as JSON, decimals as strings, labelled as the fiscal total", async () => {
    const h = golden();
    expect(await h.exec(["tax", "2027"])).toBe(0);
    const json = JSON.parse(h.text()) as {
      year: number;
      scope: string;
      base_eur: string;
      doubtful: { criterion: string }[];
      settled: { base_difference_eur: string }[];
      notes: { code: string }[];
    };
    expect(json.year).toBe(2027);
    expect(json.scope).toBe("fiscal_total");
    expect(typeof json.base_eur).toBe("string");
    expect(json.doubtful.map((d) => d.criterion)).toContain("2:listed");
    expect(json.notes.map((n) => n.code)).toContain("tax_quota_not_computed");
    // A settled criterion that moves nothing is still there, with its zero.
    expect(json.settled.map((c) => c.base_difference_eur)).toContain("0");
    for (const section of [
      "capital_gains",
      "movable_capital",
      "wash_sale",
      "compensation",
      "withholdings",
      "double_taxation",
      "settings_diff",
    ]) {
      expect(json).toHaveProperty(section);
    }
  });

  it("says that no settled criterion moves anything with an empty list, not with empty headings", async () => {
    const h = golden();
    expect(await h.exec(["tax", "2028"])).toBe(0);
    expect(JSON.parse(h.text()).settled).toEqual([]);
  });

  it("takes --json, before or after the command, and prints the same", async () => {
    const plain = golden();
    expect(await plain.exec(["tax", "2027"])).toBe(0);
    const before = golden();
    expect(await before.exec(["--json", "tax", "2027"])).toBe(0);
    const after = golden();
    expect(await after.exec(["tax", "2027", "--json"])).toBe(0);
    expect(JSON.parse(before.text())).toEqual(JSON.parse(plain.text()));
    expect(JSON.parse(after.text())).toEqual(JSON.parse(plain.text()));
  });

  it("prints the layout by box with --boxes", async () => {
    const h = golden();
    expect(await h.exec(["tax", "2027", "--boxes"])).toBe(0);
    expect(JSON.parse(h.text())).toMatchObject({ year: 2027 });
  });

  it("no longer takes --lots: the lots of each transmission are in the report", async () => {
    const h = golden();
    expect(await h.exec(["tax", "2027", "--lots"])).toBe(EXIT.usage);
    const report = golden();
    expect(await report.exec(["tax", "2027"])).toBe(0);
    expect(JSON.stringify(JSON.parse(report.text()).capital_gains)).toContain("lots");
  });

  it("refuses a year before the regime, and a word that is not a year", async () => {
    const h = golden();
    expect(await h.exec(["tax", "2017"])).toBe(EXIT.domain);
    expect(h.text()).toContain("régimen de compensación vigente desde 2018");
    expect(await h.exec(["tax", "dos mil"])).toBe(EXIT.usage);
    for (const year of ["0", "1e3", "0x7e3", "", "20255", " 2025"]) {
      expect(await h.exec(["tax", year])).toBe(EXIT.usage);
    }
    expect(await h.exec(["tax"])).toBe(EXIT.usage);
  });

  it("refuses a ledger with invalid events and lists them instead of a figure", async () => {
    const lines = goldenLines();
    const sale = JSON.parse(lines.find((line) => line.includes('"type":"sell"')) as string);
    // A sale of far more than is held: the loader accepts the line, the projection does not.
    const oversold = JSON.stringify({
      ...sale,
      id: "01ARYZ6S41TSV4RRFFQ69ZZZZZ",
      quantity: "99999",
    });
    const bad = harness({ lines: [...lines, oversold], instant: "2029-03-01T10:00:00.000Z" });
    expect(await bad.exec(["tax", "2027"])).toBe(EXIT.domain);
    expect(bad.text()).toContain("movimiento inválido");
    expect(bad.text()).toContain("01ARYZ6S41TSV4RRFFQ69ZZZZZ");
  });
});
