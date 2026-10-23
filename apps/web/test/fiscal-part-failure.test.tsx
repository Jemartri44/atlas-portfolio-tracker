// @vitest-environment happy-dom
//
// A part of the fiscal screen that cannot be calculated says why where it is, and the rest of the
// screen stays. The informative returns and the boxes used to be read with no guard, so a
// refusal of the domain in one of them took the whole screen down.

import { DomainError } from "@atlas/domain";
import { describe, expect, it, vi } from "vitest";
import Fiscal from "../src/routes/fiscal/index.jsx";
import { show, text, today, until, withGoldenLedger } from "./helpers/render.jsx";

vi.mock("@atlas/domain/fiscal", async (original) => ({
  ...(await original<typeof import("@atlas/domain/fiscal")>()),
  informativeReturn: () => {
    throw new DomainError("fx_rate_unknown", "the ledger holds USD and knows no ECB rate", {
      currency: "USD",
    });
  },
}));

withGoldenLedger();

describe("the fiscal screen when a part cannot be calculated", () => {
  it("keeps the base and the boxes, and says in Spanish what failed", async () => {
    today("2029-05-10");
    const host = await show("/fiscal?ejercicio=2028", Fiscal);
    await until(() => text(host).includes("No se ha podido calcular esta parte"), "the failure");
    const shown = text(host);
    expect(shown).toContain("Modelo 720");
    expect(shown).toContain("Modelo 721");
    expect(shown).toContain("Tu declaración por casillas");
    expect(shown).not.toContain("the ledger holds");
    expect(shown).not.toContain("Esta pantalla no ha podido abrirse");
  });
});
