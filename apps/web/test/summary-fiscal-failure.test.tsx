// @vitest-environment happy-dom
//
// A failure of the tax engine takes only the tax card of the summary, never the whole screen. The
// golden ledger holds dated events up to 2028: read on a day before them, the 720 raises
// `fx_rate_unknown` — which blanked the summary with the technical English of the domain.

import { DomainError } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import Resumen from "../src/routes/resumen/index.jsx";
import { setPrivacy } from "../src/shell/preferences.js";
import { show, showInShell, text, today, until, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

describe("the summary when the tax engine cannot answer", () => {
  it("keeps the patrimony and says in Spanish why the declaration is not calculated", async () => {
    today("2026-10-23");
    const host = await show("/", Resumen);
    await until(() => text(host).includes("No se ha podido calcular"), "the failure of the engine");
    expect(text(host)).toContain("Patrimonio total");
    expect(text(host)).not.toContain("Esta pantalla no ha podido abrirse");
    expect(text(host)).not.toContain("the ledger holds");
  });
});

describe("a screen that throws a refusal of the domain", () => {
  const refusal = () =>
    new DomainError("fx_rate_unknown", "the ledger holds USD and knows no ECB rate", {
      currency: "USD",
    });

  it("is told in Spanish, and follows the privacy mode", async () => {
    setPrivacy(false);
    const host = await showInShell("/", {
      "/": () => {
        throw refusal();
      },
    });
    await until(() => text(host).includes("Esta pantalla no ha podido abrirse"), "the failure");
    await until(() => !text(host).includes("the ledger holds"), "the translation");
    expect(text(host)).toContain("USD");
  });
});
