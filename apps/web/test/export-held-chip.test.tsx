// @vitest-environment happy-dom
//
// The export and the chip of the header, together (review of PR #97, round 3,
// O2): exporting with something held back leaves the chip saying that it is
// still to be downloaded, and «Descargar lo retenido» takes that away — both
// in the same visit, without reloading.

import { openAtlasDb } from "@atlas/adapters/browser";
import { holdRecords, recordsText } from "@atlas/domain/sync";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import { downloadHeld, exportLedger } from "../src/ledger/export.js";
import { goldenText } from "./helpers/golden.js";
import { settle, showInShell, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const holder = globalThis as { indexedDB?: unknown };
const before = holder.indexedDB;
const factory = new FakeIdbFactory();
const createObjectURL = URL.createObjectURL;
const revokeObjectURL = URL.revokeObjectURL;
beforeAll(async () => {
  holder.indexedDB = factory;
  // The downloads of the page: nothing to save in a test.
  URL.createObjectURL = () => "blob:atlas-test";
  URL.revokeObjectURL = () => undefined;
  await openAtlasDb();
  const ledger = factory.databases.get("atlas")?.store("ledger") as Map<string, unknown>;
  ledger.set("current", { text: goldenText(), updatedAt: "2029-07-01T00:00:00.000Z" });
  ledger.set(
    "sync:held",
    recordsText(holdRecords(["x"], "client", { code: "new_duplicate", details: {} }, "t")),
  );
});
afterAll(() => {
  holder.indexedDB = before;
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

describe("the export and the chip, in one visit", () => {
  it("owes what is held back after exporting, until it is downloaded", async () => {
    const host = await showInShell("/", { "/": () => <p>pantalla</p> });
    const chip = () => text(host.querySelector(".source"));
    const result = await exportLedger();
    await settle(10);
    expect(result.held?.operations).toBe(1);
    expect(chip()).toContain("falta descargar lo retenido");
    await downloadHeld(result.held as NonNullable<typeof result.held>);
    await settle(10);
    expect(chip()).not.toContain("falta descargar lo retenido");
  });
});
