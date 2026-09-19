// @vitest-environment happy-dom
//
// The unit inside a numeric field (docs/design/system.md §5.10): the currency
// of an amount, what a quantity counts, the percent of a share — at the right
// of the field, the figure right-aligned against it, and read with the field.

import { describe, expect, it } from "vitest";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import { formSpec } from "../src/view-models/forms/specs.js";
import { fieldUnit } from "../src/view-models/forms/units.js";
import { choose, show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const field = (slug: string, name: string) => {
  const found = formSpec(slug)?.fields.find((one) => one.name === name);
  if (found === undefined) {
    throw new Error(`no hay campo ${name} en ${slug}`);
  }
  return found;
};

const names = { "unidades:ast_world": "part." };

describe("the unit of a field", () => {
  it("is the currency of an amount, its own for a fee or a pair", () => {
    expect(fieldUnit(field("buy", "amount"), { currency: "USD" }, names)).toBe("USD");
    expect(fieldUnit(field("buy", "amount"), { currency: "EUR" }, names)).toBe("€");
    expect(fieldUnit(field("buy", "fee"), { currency: "USD", fee_currency: "EUR" }, names)).toBe(
      "€",
    );
    expect(fieldUnit(field("tesis", "planned_size_eur"), {}, names)).toBe("€");
  });

  it("is what a quantity counts, once there is an asset to count", () => {
    expect(fieldUnit(field("buy", "quantity"), { asset_id: "" }, names)).toBeUndefined();
  });

  it("is nothing for a rate of the ECB, which is a ratio", () => {
    expect(fieldUnit(field("buy", "fx_rate"), { currency: "USD" }, names)).toBeUndefined();
  });
});

describe("the unit on the screen", () => {
  it("sits inside the field, right of a right-aligned figure, and is read with it", async () => {
    const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
    choose(host, "f-account_id", "acc_mi");
    choose(host, "f-asset_id", "ast_world");
    const amount = host.querySelector("#f-amount") as HTMLInputElement;
    expect(amount.closest(".control.has-unit")).not.toBeNull();
    expect(text(host.querySelector("#f-amount-unit"))).toBe("€");
    expect(amount.getAttribute("aria-describedby")).toContain("f-amount-unit");
    expect(text(host.querySelector("#f-quantity-unit"))).toBe("part.");
  });
});
