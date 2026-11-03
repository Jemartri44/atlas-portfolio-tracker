// The copies `atlas backup` makes are read-only for their owner and nobody else (audit of
// 03/11, finding 5): `400` the files, `700` the folders it creates.

import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeLine } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { EXIT, type Io } from "../src/context.js";
import { run } from "../src/main.js";
import { seed } from "./harness.js";

const modeOf = async (path: string): Promise<number> => (await stat(path)).mode & 0o777;

describe("atlas backup of a local ledger", () => {
  it("writes the copy and the copied documents 400, in folders it creates 700", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-perms-"));
    const ledger = join(dir, "ledger.jsonl");
    await writeFile(
      ledger,
      seed()
        .map((event) => `${encodeLine(event)}\n`)
        .join(""),
    );
    await mkdir(join(dir, "documents", "01ARYZ6S41TSV4RRFFQ69G5FAV"), { recursive: true });
    await writeFile(join(dir, "documents", "01ARYZ6S41TSV4RRFFQ69G5FAV", "aviso.pdf"), "pdf");
    const lines: string[] = [];
    const io: Io = {
      out: (t) => lines.push(t),
      err: (t) => lines.push(t),
      confirm: async () => true,
    };
    const target = join(dir, "backups", "nested");
    expect(await run(["--ledger", ledger, "backup", "--to", target, "--yes"], io)).toBe(EXIT.ok);
    const copy = /Copia verificada: (\S+\.jsonl)/.exec(lines.join("\n"))?.[1] as string;
    expect(await modeOf(copy)).toBe(0o400);
    expect(await modeOf(target)).toBe(0o700);
    expect(await modeOf(join(target, "documents"))).toBe(0o700);
    expect(await modeOf(join(target, "documents", "01ARYZ6S41TSV4RRFFQ69G5FAV"))).toBe(0o700);
    expect(await modeOf(join(target, "documents", "01ARYZ6S41TSV4RRFFQ69G5FAV", "aviso.pdf"))).toBe(
      0o400,
    );
  });
});
