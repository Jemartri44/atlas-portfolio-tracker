import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { harness } from "../harness.js";
import { LEDGER_FIXTURES } from "../support/fixtures.js";

const lines = readFileSync(join(LEDGER_FIXTURES, "synthetic-v1.jsonl"), "utf8")
  .split("\n")
  .filter((line) => line !== "");

describe("atlas rehearse", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "atlas-rehearse-"));
  });
  afterEach(() => rm(dir, { recursive: true }));

  const dumpOf = async (content: string[]): Promise<string> => {
    const path = join(dir, "dump.jsonl");
    await writeFile(path, `${content.join("\n")}\n`);
    return path;
  };

  it("restores a dump of the ledger to the same figures, even if the ledger grew after it", async () => {
    const h = harness({ lines });
    const early = await dumpOf(lines.slice(0, 60));
    expect(await h.exec(["rehearse", "--dump", early])).toBe(0);
    expect(h.text()).toContain("60 eventos");
    h.reset();
    expect(await h.exec(["rehearse", "--dump", await dumpOf(lines), "--json"])).toBe(0);
    expect(JSON.parse(h.out.join("\n"))).toEqual({ ok: true, events: lines.length });
  });

  it("says by code and count what differs, and fails", async () => {
    const h = harness({ lines: lines.slice(0, 60) });
    expect(await h.exec(["rehearse", "--dump", await dumpOf(lines.slice(0, 61))])).toBe(1);
    expect(h.text()).toContain("event_missing_in_live: 1");
  });

  it.each([
    ["an empty dump", ""],
    ["a line that is not a ledger event", "not json\n"],
  ])("refuses %s, without echoing it", async (_name, content) => {
    const h = harness({ lines });
    const path = join(dir, "bad.jsonl");
    await writeFile(path, content);
    expect(await h.exec(["rehearse", "--dump", path])).toBe(1);
    expect(h.text()).not.toContain("not json");
  });

  it("refuses bytes that are not UTF-8", async () => {
    const h = harness({ lines });
    const path = join(dir, "binary.jsonl");
    await writeFile(path, Buffer.from([0xff, 0xfe, 0x0a]));
    expect(await h.exec(["rehearse", "--dump", path])).toBe(1);
    expect(h.text()).toContain("dump_unreadable");
  });

  it("needs its dump", async () => {
    expect(await harness({ lines }).exec(["rehearse"])).toBe(64);
  });
});
