// @vitest-environment happy-dom
//
// "1.200,50" in the form of a purchase: the way anybody in Spain writes an
// amount, refused until now as "el campo amount de buy no es válido". And an
// ambiguous "1.5", refused on its own field with a sentence that says how to
// write it. The rule itself is tested in `input.test.ts`.

import { beforeEach, describe, expect, it } from "vitest";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import { choose, press, show, text, today, type, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

/** Fills a purchase of World Index Fund in the form of the application. */
const fillPurchase = (host: HTMLElement, amount: string): void => {
  choose(host, "f-account_id", "acc_mi");
  choose(host, "f-asset_id", "ast_world");
  type(host, "f-quantity", "4,8765");
  type(host, "f-amount", amount);
};

describe("numbers typed the Spanish way", () => {
  beforeEach(() => today("2026-09-18"));

  it("accepts the thousands the way a Spanish keyboard writes them", async () => {
    const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
    fillPurchase(host, "1.200,50");
    await press(host, "Ver el efecto");

    expect(host.querySelector(".field .error")).toBeNull();
    expect(host.querySelector(".preview")).not.toBeNull();
  });

  it("puts an ambiguous amount on its field, in Spanish, with no callout far away", async () => {
    const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
    fillPurchase(host, "1.5");
    await press(host, "Ver el efecto");

    const amount = host.querySelector("#f-amount");
    expect(amount?.getAttribute("aria-invalid")).toBe("true");
    const error = amount?.closest(".field")?.querySelector(".error");
    expect(text(error)).toContain("escribe 1,5");
    expect(text(host)).not.toMatch(/dominio|amount|buy/);
    expect(host.querySelector(".preview")).toBeNull();
  });
});
