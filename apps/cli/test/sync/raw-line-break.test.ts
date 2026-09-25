// A ledger with Windows line endings (decision D-Q18 of feature 014): the
// message gives the exact, safe order to convert it, and the order works.

import { execFileSync, execSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ValidationError } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { describeError, RAW_LINE_BREAK_FIX } from "../../src/output/messages.js";

describe("raw_line_break in the console", () => {
  it("says the order to convert the ledger with a copy first, and to sync after", () => {
    const text = describeError(new ValidationError("raw_line_break", "x", { line: 3 }));
    expect(text).toContain("La línea 3");
    expect(text).toContain(RAW_LINE_BREAK_FIX);
    expect(text).toContain("ledger.jsonl.crlf");
    expect(text).toContain("vuelve a sincronizar");
  });

  it("gives an order that really converts, keeps a copy, and never overwrites it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-crlf-014-"));
    const crlf = '{"a":"ñ"}\r\n{"b":"\\\\r"}\r\n';
    await writeFile(join(dir, "ledger.jsonl"), crlf);
    const script = /node -e "(.*)"$/.exec(RAW_LINE_BREAK_FIX)?.[1] as string;
    // Typed in a shell, as the user will: the quoting has to survive it.
    execSync(RAW_LINE_BREAK_FIX.replace(/^node /, `"${process.execPath}" `), { cwd: dir });
    expect(await readFile(join(dir, "ledger.jsonl"), "utf8")).toBe('{"a":"ñ"}\n{"b":"\\\\r"}\n');
    expect(await readFile(join(dir, "ledger.jsonl.crlf"), "utf8")).toBe(crlf);
    expect(() =>
      execFileSync(process.execPath, ["-e", script], { cwd: dir, stdio: "pipe" }),
    ).toThrow();
    expect(await readFile(join(dir, "ledger.jsonl.crlf"), "utf8")).toBe(crlf);
  });
});
