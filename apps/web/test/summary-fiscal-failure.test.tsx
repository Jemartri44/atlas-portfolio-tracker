// @vitest-environment happy-dom
//
// A failure of the tax engine takes only the tax card of the summary, never the whole screen: it
// blanked the summary with the technical English of the domain (`fx_rate_unknown`).

import { DomainError } from "@atlas/domain";
import { describe, expect, it, vi } from "vitest";
import { toAppError } from "../src/ledger/errors.js";
import Resumen from "../src/routes/resumen/index.jsx";
import { setPrivacy } from "../src/shell/preferences.js";
import { show, showInShell, text, today, until, withGoldenLedger } from "./helpers/render.jsx";

vi.mock("../src/routes/resumen/fiscal-status.js", () => ({
  fiscalStatus: () => {
    throw new DomainError("fx_rate_unknown", "the ledger holds USD and knows no ECB rate", {
      currency: "USD",
    });
  },
}));

withGoldenLedger();

describe("the summary when the tax engine cannot answer", () => {
  it("in the income tax season, says in the tax card why it is not calculated", async () => {
    today("2029-05-10");
    const host = await show("/", Resumen);
    await until(() => text(host).includes("No se ha podido calcular"), "the failure of the engine");
    expect(text(host)).toContain("Patrimonio total");
    expect(text(host)).not.toContain("Esta pantalla no ha podido abrirse");
    expect(text(host)).not.toContain("the ledger holds");
  });

  it("out of the season, says it in Atención with the way to the declaration", async () => {
    today("2029-09-01");
    const host = await show("/", Resumen);
    await until(() => text(host).includes("No se ha podido calcular"), "the failure of the engine");
    expect(text(host)).toContain("Ver la declaración");
    expect(text(host)).not.toContain("Esta pantalla no ha podido abrirse");
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

describe("the detail of an unexpected failure", () => {
  it("follows the privacy mode while it is on screen", () => {
    const error = toAppError(new Error("saldo de 1234,56 EUR"));
    setPrivacy(true);
    expect(error.message).not.toContain("1234");
    setPrivacy(false);
    expect(error.message).toContain("1234,56");
  });
});
