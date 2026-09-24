// @vitest-environment happy-dom
//
// «Tipos del BCE» in Ajustes and the import of the history by hand (feature
// 012, block 3): the ZIP of the ECB's page or its CSV, read before it is kept,
// and refused when it changes a rate already published. The ZIP is read with
// the platform's `DecompressionStream`, and its CRC-32 checked.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, crc32 as nodeCrc32 } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import { importHistoryFile, loadWebHistory, reloadWebHistory } from "../src/ecb/history.js";
import { crc32, entryOfZip, isZip, ZipUnreadable } from "../src/ecb/zip.js";
import Ajustes from "../src/routes/ajustes/index.jsx";
import { settle, show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const csv = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/ecb/eurofxref-hist.csv"),
);

/** A ZIP of one deflated entry, the way the ECB's is. */
const zipOf = (name: string, content: Uint8Array): Uint8Array => {
  const data = deflateRawSync(content);
  const nameBytes = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(nodeCrc32(content) >>> 0, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(nodeCrc32(content) >>> 0, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(local.length + nameBytes.length + data.length, 16);
  return new Uint8Array(Buffer.concat([local, nameBytes, data, central, nameBytes, end]));
};

const holder = globalThis as { indexedDB?: unknown };
const before = holder.indexedDB;
beforeAll(() => {
  holder.indexedDB = new FakeIdbFactory();
});
afterAll(() => {
  holder.indexedDB = before;
});

describe("the ZIP in the browser", () => {
  it("reads the CSV of the ECB's ZIP byte for byte, and checks it", async () => {
    const zip = zipOf("eurofxref-hist.csv", csv);
    expect(isZip(zip)).toBe(true);
    expect(isZip(csv)).toBe(false);
    expect(Buffer.from(await entryOfZip(zip, ".csv"))).toEqual(csv);
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("refuses what is not a ZIP, or a damaged one", async () => {
    await expect(entryOfZip(new Uint8Array(csv), ".csv")).rejects.toBeInstanceOf(ZipUnreadable);
    const zip = zipOf("eurofxref-hist.csv", csv);
    await expect(entryOfZip(zip, ".xml")).rejects.toThrow(/no trae ningún/);
    const damaged = new Uint8Array(zip);
    damaged[60] = (damaged[60] as number) ^ 0xff;
    await expect(entryOfZip(damaged, ".csv")).rejects.toBeInstanceOf(Error);
  });
});

describe("importing the history by hand", () => {
  it("keeps the ZIP's history, and refuses one that changes a published rate", async () => {
    expect((await reloadWebHistory()).history).toBeUndefined();
    const first = await importHistoryFile("eurofxref-hist.zip", zipOf("eurofxref-hist.csv", csv));
    expect(first).toEqual({ kind: "imported", latest: "2026-03-31", source: "zip" });
    expect((await loadWebHistory()).origin).toBe("imported");
    const changed = new TextEncoder().encode(csv.toString("utf8").replace(",0.8595,", ",0.8596,"));
    const second = await importHistoryFile("otro.csv", changed);
    expect(second).toMatchObject({ kind: "rejected", total: 1 });
    expect((await loadWebHistory()).latest).toBe("2026-03-31");
  });

  it("says in Ajustes which history is in use and until when", async () => {
    await reloadWebHistory();
    const host = await show("/ajustes", Ajustes);
    await settle(50);
    const said = text(host);
    expect(said).toContain("Tipos del BCE");
    expect(said).toContain("Importado a mano en este navegador");
    expect(said).toContain("publica hasta el 31/03/2026");
    expect(said).toContain("La web no descarga nada de fuera");
  });
});
