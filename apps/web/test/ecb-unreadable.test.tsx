// @vitest-environment happy-dom
//
// A copy of the ECB history that this browser keeps and that does not read is not «this browser
// does not keep site data»: it is said as what it is, with the way out (erase it, download it
// again). And the failed download of the cloud says why in words, not as a bare code.

import { saveImportedHistory } from "@atlas/adapters/reference";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import { reloadWebHistory } from "../src/ecb/history.js";
import { cloudSaid } from "../src/routes/ajustes/ecb-cloud-said.js";
import Ajustes from "../src/routes/ajustes/index.jsx";
import { settle, show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const holder = globalThis as { indexedDB?: unknown };
const before = holder.indexedDB;
beforeEach(() => {
  holder.indexedDB = new FakeIdbFactory();
});
afterAll(() => {
  holder.indexedDB = before;
});

describe("a stored copy of the ECB history that does not read", () => {
  it("is said as unreadable, and the card offers to erase it", async () => {
    await saveImportedHistory({
      text: "this is not a history",
      source: "zip",
      file_name: "eurofxref-hist.csv",
      imported_at: "2026-10-01T08:00:00.000Z",
    });
    expect((await reloadWebHistory()).problem).toBe("unreadable");
    const host = await show("/ajustes", Ajustes);
    await settle(100);
    const said = text(host);
    expect(said).toContain("no se puede leer");
    expect(said).not.toContain("no permite guardar datos del sitio");
    expect(said).toContain("Borrar la copia del BCE de este navegador");
  });
});

describe("what the card says of a download of the cloud that failed", () => {
  it("gives the reason in words and what to do, never only the code", () => {
    const said = cloudSaid({ kind: "failed", code: "network_failed" }, true);
    expect(said && "text" in said ? said.text : "").toContain("no hay conexión con la nube");
    expect(JSON.stringify(said)).not.toContain("network_failed");
    expect(JSON.stringify(said)).toContain("Bajar de la nube");
  });
});
