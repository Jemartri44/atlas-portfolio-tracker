import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeLine, generateLedger } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { harness } from "../harness.js";

const tempDir = () => mkdtemp(join(tmpdir(), "atlas-synth-"));

describe("atlas synth", () => {
  it("writes the seed-1 ledger by default, exactly as the generator encodes it", async () => {
    const dir = await tempDir();
    const out = join(dir, "demo.jsonl");
    const h = harness();
    expect(await h.exec(["synth", "--out", out])).toBe(0);
    const expected = generateLedger({ seed: 1 })
      .map((event) => `${encodeLine(event)}\n`)
      .join("");
    expect(await readFile(out, "utf8")).toBe(expected);
    expect(h.text()).toContain("semilla 1");
    expect(h.text()).toContain("corporate_action");
    const again = join(dir, "again.jsonl");
    expect(await h.exec(["synth", "--out", again, "--seed", "1"])).toBe(0);
    expect(await readFile(again, "utf8")).toBe(expected);
  });

  it("varies with the seed and reports the summary as JSON", async () => {
    const dir = await tempDir();
    const out = join(dir, "seed7.jsonl");
    const h = harness();
    expect(await h.exec(["synth", "--out", out, "--seed", "7", "--json"])).toBe(0);
    const report = JSON.parse(h.out.join("\n")) as {
      path: string;
      seed: number;
      summary: { events: number; accounts: string[]; years: number[] };
    };
    expect(report.seed).toBe(7);
    expect(report.path).toBe(out);
    expect(report.summary.accounts).toEqual(["acc_bucket", "acc_ibkr", "acc_ibkr2", "acc_mi"]);
    expect(report.summary.years).toEqual([2026, 2027, 2028]);
    expect(await readFile(out, "utf8")).not.toBe(
      generateLedger({ seed: 1 })
        .map((event) => `${encodeLine(event)}\n`)
        .join(""),
    );
  });

  it("refuses an existing path without touching it and rejects a bad seed", async () => {
    const dir = await tempDir();
    const out = join(dir, "existing.jsonl");
    await writeFile(out, "keep me\n");
    const h = harness();
    expect(await h.exec(["synth", "--out", out])).toBe(1);
    expect(h.text()).toContain("ya existe");
    expect(await readFile(out, "utf8")).toBe("keep me\n");
    expect(await h.exec(["synth", "--out", join(dir, "x.jsonl"), "--seed", "abc"])).toBe(64);
    expect(await h.exec(["synth"])).toBe(64);
  });
});
