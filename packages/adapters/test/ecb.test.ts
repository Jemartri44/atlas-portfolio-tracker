// The ECB adapters (feature 012, block 2): the ZIP read with node:zlib, the
// source with the ZIP first and the API as fallback — never touching the
// network: `fetch` is a double —, and `reference/ecb/` on the disk under the
// lock of the folder.

import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { EcbHistoryDamaged, FileEcbHistoryStore, fileOfSource } from "../src/ecb/history-store.js";
import { ECB_API_URL, ECB_ZIP_URL, EcbDownloadFailed, EcbFxRateSource } from "../src/ecb/source.js";
import { entryOfZip, ZipUnreadable } from "../src/ecb/zip.js";
import { LedgerLockedError, LOCK_FILE } from "../src/ledger-store/folder-lock.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/ecb");
const csv = async (): Promise<Buffer> => readFile(join(fixtures, "eurofxref-hist.csv"));

/** A ZIP of one entry, built the way the ECB's is: deflated, with its CRC-32. */
const zipOf = (name: string, content: Uint8Array, method: 0 | 8 = 8): Buffer => {
  const data = method === 8 ? deflateRawSync(content) : Buffer.from(content);
  const nameBytes = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(crc32(content) >>> 0, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(crc32(content) >>> 0, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + nameBytes.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, nameBytes, data, central, nameBytes, end]);
};

describe("entryOfZip", () => {
  it("reads the CSV of the ZIP byte for byte, deflated or stored", async () => {
    const content = await csv();
    expect(Buffer.from(entryOfZip(zipOf("eurofxref-hist.csv", content), ".csv").bytes)).toEqual(
      content,
    );
    expect(Buffer.from(entryOfZip(zipOf("eurofxref-hist.csv", content, 0), ".csv").bytes)).toEqual(
      content,
    );
  });

  it("refuses what is not a ZIP, a truncated one and a damaged one", async () => {
    const content = await csv();
    const zip = zipOf("eurofxref-hist.csv", content);
    const refuses =
      (bytes: Uint8Array, suffix = ".csv") =>
      () =>
        entryOfZip(bytes, suffix);
    expect(refuses(Buffer.from("<html>503</html>"))).toThrow(ZipUnreadable);
    expect(refuses(zip.subarray(0, zip.length - 30))).toThrow(ZipUnreadable);
    expect(refuses(zip, ".xml")).toThrow(/no entry ending/);
    const corrupt = Buffer.from(zip);
    corrupt[60] = (corrupt[60] as number) ^ 0xff; // inside the deflated data
    expect(refuses(corrupt)).toThrow(ZipUnreadable);
    const wrongCrc = Buffer.from(zip);
    const centralAt = wrongCrc.length - 22 - 46 - "eurofxref-hist.csv".length;
    wrongCrc.writeUInt32LE(1, centralAt + 16);
    expect(refuses(wrongCrc)).toThrow(/CRC-32/);
    const badLocal = Buffer.from(zip);
    badLocal.writeUInt32LE(0, 0);
    expect(refuses(badLocal)).toThrow(/local header/);
    const badCentral = Buffer.from(zip);
    badCentral.writeUInt32LE(0, centralAt);
    expect(refuses(badCentral)).toThrow(/central directory/);
    const method = Buffer.from(zip);
    method.writeUInt16LE(12, centralAt + 10);
    expect(refuses(method)).toThrow(/method 12/);
    const short = Buffer.from(zip);
    short.writeUInt32LE(zip.length, centralAt + 20);
    expect(refuses(short)).toThrow(/truncated/);
  });
});

const response = (status: number, body: Uint8Array | string): Response =>
  new Response(typeof body === "string" ? body : new Uint8Array(body), { status });

describe("EcbFxRateSource", () => {
  const now = () => new Date("2026-09-24T10:00:00.000Z");

  it("takes the ZIP first, and keeps its CSV byte for byte", async () => {
    const content = await csv();
    const asked: string[] = [];
    const source = new EcbFxRateSource(async (url) => {
      asked.push(url);
      return response(200, zipOf("eurofxref-hist.csv", content));
    }, now);
    const downloaded = await source.download();
    expect(asked).toEqual([ECB_ZIP_URL]);
    expect(downloaded).toMatchObject({
      source: "zip",
      url: ECB_ZIP_URL,
      fetched_at: "2026-09-24T10:00:00.000Z",
    });
    expect(Buffer.from(downloaded.bytes)).toEqual(content);
    expect("zip_failure" in downloaded).toBe(false);
  });

  it("falls back to the API when the ZIP fails, and says it is the API (mutant 21)", async () => {
    const api = await readFile(join(fixtures, "api-exr.csv"));
    for (const zipAnswer of [
      () => Promise.resolve(response(503, "no")),
      () => Promise.resolve(response(200, "<html>no es un zip</html>")),
      () => Promise.reject(new Error("sin red")),
    ]) {
      const source = new EcbFxRateSource(
        async (url) => (url === ECB_ZIP_URL ? zipAnswer() : response(200, api)),
        now,
      );
      const downloaded = await source.download();
      expect(downloaded.source).toBe("api");
      expect(downloaded.url).toBe(ECB_API_URL);
      expect(Buffer.from(downloaded.bytes)).toEqual(api);
      expect(downloaded.zip_failure).toMatch(/HTTP 503|no end of central directory|sin red/);
    }
  });

  it("fails, saying both reasons, when neither answers", async () => {
    const source = new EcbFxRateSource(async (url) => {
      if (url === ECB_ZIP_URL) {
        throw new Error("sin red");
      }
      throw "cortado";
    }, now);
    const error = await source.download().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EcbDownloadFailed);
    expect(error).toMatchObject({ zip: "sin red", api: "cortado" });
  });

  it("uses the global fetch and the system clock by default", () => {
    expect(new EcbFxRateSource()).toBeInstanceOf(EcbFxRateSource);
  });
});

describe("FileEcbHistoryStore", () => {
  const downloaded = (
    bytes: Uint8Array,
    source: "zip" | "api" = "zip",
    fetched_at = "2026-09-24T10:00:00.000Z",
  ) => ({
    source,
    bytes,
    url: source === "zip" ? ECB_ZIP_URL : ECB_API_URL,
    fetched_at,
  });

  it("stores the history byte for byte with its manifest, and keeps the previous as a backup", async () => {
    const folder = await mkdtemp(join(tmpdir(), "atlas-ecb-"));
    const store = new FileEcbHistoryStore(folder);
    expect(await store.active()).toBeUndefined();
    const content = await csv();
    const first = await store.activate(downloaded(content));
    expect(first).toMatchObject({ file: "eurofxref-hist.csv", source: "zip", url: ECB_ZIP_URL });
    expect(await readFile(join(folder, "reference", "ecb", "eurofxref-hist.csv"))).toEqual(content);
    expect((await store.active())?.text).toBe(content.toString("utf8"));
    const api = await readFile(join(fixtures, "api-exr.csv"));
    const second = await store.activate(downloaded(api, "api", "2026-09-25T10:00:00.000Z"));
    expect(second.file).toBe("api-exr.csv");
    const manifest = await store.manifest();
    expect(manifest?.active.source).toBe("api");
    expect(manifest?.previous).toMatchObject({
      file: "previous/eurofxref-hist.csv",
      source: "zip",
    });
    expect(
      await readFile(join(folder, "reference", "ecb", "previous", "eurofxref-hist.csv")),
    ).toEqual(content);
    // No lock left behind.
    expect((await readdir(folder)).includes(LOCK_FILE)).toBe(false);
  });

  it("keeps a rejected download apart without touching the one in force", async () => {
    const folder = await mkdtemp(join(tmpdir(), "atlas-ecb-"));
    const store = new FileEcbHistoryStore(folder);
    const content = await csv();
    await store.activate(downloaded(content));
    const kept = await store.keepRejected(
      downloaded(Buffer.from("otro"), "zip", "2026-09-25T10:00:00.000Z"),
    );
    expect(kept.file).toBe("rejected/2026-09-25T10-00-00-000Z-eurofxref-hist.csv");
    expect((await store.active())?.text).toBe(content.toString("utf8"));
    expect((await store.manifest())?.rejected).toHaveLength(1);
  });

  it("writes under the lock of the ledger folder, and never with another writer in it (mutant 23)", async () => {
    const folder = await mkdtemp(join(tmpdir(), "atlas-ecb-"));
    await writeFile(
      join(folder, LOCK_FILE),
      JSON.stringify({ holder: "cli", token: "otro", since: "2026-09-24T09:00:00.000Z" }),
    );
    const store = new FileEcbHistoryStore(folder);
    await expect(store.activate(downloaded(await csv()))).rejects.toBeInstanceOf(LedgerLockedError);
    await expect(store.keepRejected(downloaded(await csv()))).rejects.toBeInstanceOf(
      LedgerLockedError,
    );
    expect(await store.active()).toBeUndefined();
  });

  it("does not leave the new history in force when the manifest could not be written", async () => {
    const folder = await mkdtemp(join(tmpdir(), "atlas-ecb-"));
    const content = await csv();
    await new FileEcbHistoryStore(folder).activate(downloaded(content));
    const failing = new FileEcbHistoryStore(folder, {
      beforeManifest: async () => {
        throw new Error("disco lleno");
      },
    });
    const api = await readFile(join(fixtures, "api-exr.csv"));
    await expect(failing.activate(downloaded(api, "api"))).rejects.toThrow("disco lleno");
    expect((await failing.active())?.meta.source).toBe("zip");
  });

  it("refuses a stored file that is not the one its manifest records", async () => {
    const folder = await mkdtemp(join(tmpdir(), "atlas-ecb-"));
    const store = new FileEcbHistoryStore(folder);
    await store.activate(downloaded(await csv()));
    await writeFile(join(folder, "reference", "ecb", "eurofxref-hist.csv"), "editado a mano");
    await expect(store.active()).rejects.toBeInstanceOf(EcbHistoryDamaged);
    expect(fileOfSource("api")).toBe("api-exr.csv");
  });

  it("rethrows an unexpected error reading the manifest", async () => {
    const folder = await mkdtemp(join(tmpdir(), "atlas-ecb-"));
    await new FileEcbHistoryStore(folder).activate(downloaded(await csv()));
    await writeFile(join(folder, "reference", "ecb", "manifest.json"), "{");
    await expect(new FileEcbHistoryStore(folder).manifest()).rejects.toBeInstanceOf(SyntaxError);
  });
});
