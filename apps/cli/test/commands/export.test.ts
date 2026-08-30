import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toCsv } from "../../src/commands/export.js";
import { BUY_WORLD, harness, seed } from "../harness.js";

describe("atlas export", () => {
  it("exports JSONL (from the store when the file is not available) and CSV", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(BUY_WORLD)).toBe(0);
    h.reset();
    expect(await h.exec(["export"])).toBe(0);
    expect(h.out.join("\n").split("\n")).toHaveLength(6);
    expect(h.out.join("\n")).toContain('"type":"buy"');
    h.reset();
    expect(await h.exec(["export", "--format", "csv"])).toBe(0);
    const [header, ...rows] = h.out.join("\n").split("\n");
    expect(header?.startsWith("schema_version,id,recorded_at,type,account_id,name")).toBe(true);
    expect(rows).toHaveLength(6);
    expect(rows[5]).toContain(",buy,");
    const dir = await mkdtemp(join(tmpdir(), "atlas-export-"));
    const out = join(dir, "ledger.csv");
    h.reset();
    expect(await h.exec(["export", "--format", "csv", "--out", out])).toBe(0);
    expect(await readFile(out, "utf8")).toContain("\n");
    expect(await h.exec(["export", "--format", "xml"])).toBe(64);
  });

  it("quotes CSV cells with commas, quotes and newlines", () => {
    expect(toCsv([{ a: 'x,"y"', b: true }, { c: "line\nbreak" }])).toBe(
      'a,b,c\n"x,""y""",true,\n,,"line\nbreak"',
    );
  });
});
