// @vitest-environment happy-dom
//
// «Tipos del BCE» in the verification (feature 012, block 4): «sin
// contrastar» without a history, never «sin hallazgos»; and with one, the
// findings of the domain in Spanish. Mutants 9 and 25 of prompt 012 §5.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { saveImportedHistory } from "@atlas/adapters/reference";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import { reloadWebHistory } from "../src/ecb/history.js";
import Verificacion from "../src/routes/ajustes/verificacion.jsx";
import { settle, show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const holder = globalThis as { indexedDB?: unknown };
const before = holder.indexedDB;
beforeAll(() => {
  holder.indexedDB = new FakeIdbFactory();
});
afterAll(() => {
  holder.indexedDB = before;
});

const section = (host: HTMLElement): string =>
  text(
    [...host.querySelectorAll("section")].find((candidate) =>
      text(candidate.querySelector("h2")).includes("Tipos del BCE"),
    ),
  );

const until = async (condition: () => boolean, ms = 3000): Promise<void> => {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("no llegó a pasar");
    }
    await settle(5);
  }
};

describe("the ECB rates in the verification", () => {
  it("says «sin contrastar» without a history, never «sin hallazgos»", async () => {
    await reloadWebHistory();
    const host = await show("/ajustes/verificacion", Verificacion);
    await until(() => section(host).includes("Sin contrastar"));
    expect(section(host)).toContain("tipos en otra divisa están sin contrastar");
    expect(section(host)).not.toContain("sin hallazgos");
    expect(section(host)).not.toContain("todos son los oficiales");
  });

  it("with a history, contrasts them and says what it found", async () => {
    await saveImportedHistory({
      text: readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          "../../../tests/fixtures/ecb/eurofxref-hist.csv",
        ),
        "utf8",
      ),
      source: "zip",
      file_name: "eurofxref-hist.csv",
      imported_at: "2026-04-01T10:00:00.000Z",
    });
    await reloadWebHistory();
    const host = await show("/ajustes/verificacion", Verificacion);
    await until(() => section(host).includes("que llega hasta el 31/03/2026"));
    // The golden ledger goes past the synthetic history: those rates are said
    // to be without contrasting, one by one, in Spanish.
    expect(section(host)).toContain(
      "El histórico del BCE no llega todavía a la fecha de un movimiento",
    );
    expect(section(host)).not.toContain("Sin contrastar");
  });
});
