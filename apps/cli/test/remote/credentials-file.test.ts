// A failed write of the credentials leaves no temporary behind: it holds the token.

import { promises as fs } from "node:fs";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { updateCredentials } from "../../src/remote/credentials-file.js";

afterEach(() => vi.restoreAllMocks());

describe("updateCredentials", () => {
  it.each(["sync", "rename"] as const)("removes the temporary when the %s fails", async (step) => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-credentials-"));
    const path = join(dir, "credentials.json");
    if (step === "rename") {
      vi.spyOn(fs, "rename").mockRejectedValue(new Error("rename failed"));
    } else {
      const open = fs.open.bind(fs);
      vi.spyOn(fs, "open").mockImplementation(async (...args: Parameters<typeof fs.open>) => {
        const handle = await open(...args);
        vi.spyOn(handle, "sync").mockRejectedValue(new Error("sync failed"));
        return handle;
      });
    }
    await expect(updateCredentials(path, (file) => ({ ...file }))).rejects.toThrow(/failed/);
    expect(await readdir(dir)).toEqual([]);
  });
});
