// Feature 016, E1: the file notifier of the tests and the captures writes each
// mail as text, subject first, in the order they come.

import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TestOnlyFileNotifier } from "./test-only-file-notifier.js";

describe("the file notifier", () => {
  it("writes each mail to its own file, subject first", async () => {
    const folder = join(await mkdtemp(join(tmpdir(), "atlas-mail-")), "out");
    const notifier = new TestOnlyFileNotifier(folder);
    expect(await notifier.send({ subject: "S1", body: "B1\n" })).toEqual({ ok: true });
    await notifier.send({ subject: "S2", body: "B2\n" });
    expect(await readdir(folder)).toEqual(["001.txt", "002.txt"]);
    expect(await readFile(join(folder, "002.txt"), "utf8")).toBe("Asunto: S2\n\nB2\n");
  });
});
