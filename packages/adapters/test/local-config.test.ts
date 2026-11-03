import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ValidationError } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { readLocalConfig } from "../src/config/local-config.js";

describe("readLocalConfig", () => {
  it("reads the defaults without a file, the file when there is one, and refuses a bad one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-config-"));
    expect(await readLocalConfig(dir)).toEqual({
      ecb_stale_currency_days: 30,
      lock_stale_minutes: 10,
    });
    await writeFile(join(dir, "atlas.config.json"), '{"ecb_stale_currency_days": 60}');
    expect((await readLocalConfig(dir)).ecb_stale_currency_days).toBe(60);
    await writeFile(join(dir, "atlas.config.json"), "{");
    await expect(readLocalConfig(dir)).rejects.toBeInstanceOf(ValidationError);
    const other = await mkdtemp(join(tmpdir(), "atlas-config-"));
    await mkdir(join(other, "atlas.config.json"));
    await expect(readLocalConfig(other)).rejects.toMatchObject({ code: "EISDIR" });
  });
});
