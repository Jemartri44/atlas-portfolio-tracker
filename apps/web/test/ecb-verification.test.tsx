// @vitest-environment happy-dom
//
// «Tipos del BCE» in the verification: «sin contrastar» without a history, never «sin hallazgos»;
// and with one, the findings of the domain in Spanish.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { forgetWebHistory, reloadWebHistory } from "../src/ecb/history.js";
import Verificacion from "../src/routes/ajustes/verificacion.jsx";
import { serveReference } from "./helpers/cloud-reference.js";
import { show, text, until, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
  forgetWebHistory();
});

const section = (host: HTMLElement): string =>
  text(
    [...host.querySelectorAll("section")].find((candidate) =>
      text(candidate.querySelector("h2")).includes("Tipos del BCE"),
    ),
  );

describe("the ECB rates in the verification", () => {
  it("says «sin contrastar» without a history, never «sin hallazgos»", async () => {
    restore = serveReference({});
    await reloadWebHistory();
    const host = await show("/ajustes/verificacion", Verificacion);
    await until(() => section(host).includes("Sin contrastar"));
    expect(section(host)).toContain("tipos en otra divisa están sin contrastar");
    expect(section(host)).not.toContain("sin hallazgos");
    expect(section(host)).not.toContain("todos son los oficiales");
  });

  it("with a history, contrasts them and says what it found", async () => {
    restore = serveReference({
      ecb: {
        csv: readFileSync(
          join(
            dirname(fileURLToPath(import.meta.url)),
            "../../../tests/fixtures/ecb/eurofxref-hist.csv",
          ),
          "utf8",
        ),
      },
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
