import { link, mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

  describe("--out over an existing file", () => {
    const setup = async (confirm?: boolean) => {
      const dir = await mkdtemp(join(tmpdir(), "atlas-export-"));
      const ledger = join(dir, "ledger.jsonl");
      await writeFile(ledger, "LEDGER\n");
      const elsewhere = await mkdtemp(join(tmpdir(), "atlas-export-other-"));
      const other = join(elsewhere, "other.csv");
      await writeFile(other, "OTHER\n");
      const h = harness({
        events: seed(),
        ledgerPath: ledger,
        ...(confirm === undefined ? {} : { confirm }),
      });
      return { h, ledger, other };
    };

    it("never replaces the ledger, not even through a link, not even with --yes", async () => {
      const { h, ledger } = await setup(true);
      const dir = dirname(ledger);
      await symlink(ledger, join(dir, "soft.csv"));
      await link(ledger, join(dir, "hard.csv"));
      for (const target of [ledger, join(dir, "soft.csv"), join(dir, "hard.csv")]) {
        h.reset();
        expect(await h.exec(["--yes", "export", "--format", "csv", "--out", target])).toBe(1);
        expect(h.text()).toContain("es el propio libro");
        expect(await readFile(ledger, "utf8")).toBe("LEDGER\n");
      }
    });

    it("never replaces any file of the ledger folder, not even with --yes, and still writes new ones", async () => {
      const { h, ledger } = await setup(true);
      const dir = dirname(ledger);
      await mkdir(join(dir, "sync"));
      const guarded = [join(dir, "credentials.json"), join(dir, "sync", "state.json")];
      for (const file of guarded) {
        await writeFile(file, "KEEP\n");
      }
      await symlink(guarded[0] as string, join(dir, "alias.csv"));
      const outside = await mkdtemp(join(tmpdir(), "atlas-export-other-"));
      await symlink(join(outside, "gone.csv"), join(dir, "dangling.csv"));
      await symlink(outside, join(dir, "linked"));
      for (const target of [
        ...guarded,
        join(dir, "alias.csv"),
        join(dir, "sync", "..", "credentials.json"),
      ]) {
        h.reset();
        expect(await h.exec(["--yes", "export", "--format", "csv", "--out", target])).toBe(1);
        expect(h.text()).toContain("carpeta del libro");
        expect(await readFile(guarded[0] as string, "utf8")).toBe("KEEP\n");
        expect(await readFile(guarded[1] as string, "utf8")).toBe("KEEP\n");
      }
      h.reset();
      expect(
        await h.exec(["--yes", "export", "--format", "csv", "--out", join(dir, "fresh.csv")]),
      ).toBe(0);
    });

    it("refuses a directory and leaves no temporary behind", async () => {
      const { h, ledger } = await setup(true);
      const folder = join(dirname(ledger), "folder");
      await mkdir(folder);
      expect(await h.exec(["--yes", "export", "--out", folder])).toBe(1);
      expect(await readdir(dirname(ledger))).not.toContainEqual(expect.stringContaining(".tmp-"));
    });

    it("asks before replacing another file, and leaves it alone unless told yes", async () => {
      const refused = await setup(false);
      expect(await refused.h.exec(["export", "--out", refused.other])).toBe(0);
      expect(await readFile(refused.other, "utf8")).toBe("OTHER\n");
      const silent = await setup(undefined);
      expect(await silent.h.exec(["export", "--out", silent.other])).not.toBe(0);
      expect(await readFile(silent.other, "utf8")).toBe("OTHER\n");
      const accepted = await setup(true);
      expect(await accepted.h.exec(["export", "--format", "csv", "--out", accepted.other])).toBe(0);
      expect(await readFile(accepted.other, "utf8")).toContain("schema_version");
    });
  });

  it("quotes CSV cells with commas, quotes and newlines", () => {
    expect(toCsv([{ a: "carriage\rreturn" }])).toBe('a\n"carriage\rreturn"');
    expect(toCsv([{ a: 'x,"y"', b: true }, { c: "line\nbreak" }])).toBe(
      'a,b,c\n"x,""y""",true,\n,,"line\nbreak"',
    );
  });

  it("defuses free text a spreadsheet would run as a formula, and leaves numbers alone", () => {
    expect(
      toCsv([
        {
          a: "=HYPERLINK(1)",
          b: "+cmd",
          c: "@SUM(A1)",
          d: "-1+2",
          e: "\tx",
          f: "-12.5",
          g: "40",
          h: -3,
          i: "ordinary -note",
        },
      ]),
    ).toBe(
      "a,b,c,d,e,f,g,h,i\n'=HYPERLINK(1),'+cmd,'@SUM(A1),'-1+2,'\tx,-12.5,40,-3,ordinary -note",
    );
  });
});
