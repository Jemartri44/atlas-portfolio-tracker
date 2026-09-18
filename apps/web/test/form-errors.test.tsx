// @vitest-environment happy-dom
//
// A form says what is wrong **where it is wrong**. Pressing "Ver el efecto"
// with a bad amount painted "El dominio rechaza este evento — El campo amount de
// buy no es válido" 667 px above the screen, and the reason the button was
// disabled sat 1.000 px below it.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DomainError } from "@atlas/domain";
import { beforeEach, describe, expect, it } from "vitest";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import { FORM_SPECS, fieldErrorOf } from "../src/view-models/forms/index.js";
import { choose, press, show, text, today, type, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

/** Fills a purchase of World Index Fund in the form of the application. */
const fillPurchase = (host: HTMLElement, amount: string): void => {
  choose(host, "f-account_id", "acc_mi");
  choose(host, "f-asset_id", "ast_world");
  type(host, "f-quantity", "4,8765");
  type(host, "f-amount", amount);
};

/** A path of the web, from this file: `new URL` is not Node's under happy-dom. */
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../src/styles/components.css"), "utf8");

/** The declarations of one selector of the stylesheet, comments out. */
const declarations = (selector: string): string[] => {
  const found: string[] = [];
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, " ").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (
      (match[1] as string)
        .split(",")
        .map((one) => one.trim())
        .includes(selector)
    ) {
      found.push(...(match[2] as string).split(";").map((one) => one.trim().replace(/\s+/g, " ")));
    }
  }
  return found;
};

describe("a refusal of the domain goes on its field", () => {
  const buy = FORM_SPECS.find((spec) => spec.slug === "buy");
  const fields = buy?.fields ?? [];
  const values = { currency: "EUR", account_id: "acc_mi" };
  const refusal = (code: string, details: Record<string, unknown>) =>
    new DomainError(code, "english", details);

  it("puts an invalid amount on the amount, in plain Spanish", () => {
    const error = fieldErrorOf(
      refusal("invalid_field", { type: "buy", field: "amount", value: "0" }),
      fields,
      values,
    );
    expect(error).toEqual({ field: "amount", message: "Tiene que ser mayor que cero." });
  });

  it("puts a value date before the trade date on the value date", () => {
    const error = fieldErrorOf(
      refusal("invalid_field", { type: "buy", trade_date: "2027-01-05", value_date: "2027-01-04" }),
      fields,
      values,
    );
    expect(error?.field).toBe("value_date");
  });

  it("puts a missing basis on the unit price", () => {
    expect(fieldErrorOf(refusal("missing_basis", { type: "buy" }), fields, values)?.field).toBe(
      "unit_price",
    );
  });

  it("leaves a refusal about no field to the button, and never targets a hidden field", () => {
    expect(
      fieldErrorOf(refusal("insufficient_position", { account_id: "acc_mi" }), fields, values),
    ).toBeUndefined();
    // In euros the rate is hidden: the user cannot fix what they cannot see.
    expect(
      fieldErrorOf(refusal("invalid_field", { type: "buy", field: "fx_rate" }), fields, values),
    ).toBeUndefined();
    expect(fieldErrorOf(new Error("boom"), fields, values)).toBeUndefined();
  });
});

describe("the form, rendered", () => {
  beforeEach(() => today("2026-09-18"));

  it("says why the button is disabled inside the bar the button lives in", async () => {
    const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
    const bar = host.querySelector(".actions-bar");
    expect(text(bar?.querySelector(".reason"))).toContain("Para ver el efecto faltan: Cuenta");
    expect(bar?.querySelector("button")?.disabled).toBe(true);
  });

  it("puts a refusal of the domain on the field it is about", async () => {
    const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
    fillPurchase(host, "600");
    type(host, "f-trade_date", "2027-03-10");
    type(host, "f-value_date", "2027-03-08");
    await press(host, "Ver el efecto");

    const field = host.querySelector("#f-value_date")?.closest(".field");
    expect(text(field?.querySelector(".error"))).toBe(
      "La fecha valor no puede ser anterior a la de contratación.",
    );
  });

  it("puts a refusal about no field right above the button, not at the top", async () => {
    const host = await show("/registrar/sell", RegistrarForm, "/registrar/:tipo");
    choose(host, "f-account_id", "acc_mi");
    choose(host, "f-asset_id", "ast_world");
    type(host, "f-quantity", "100000");
    type(host, "f-amount", "600");
    await press(host, "Ver el efecto");

    const form = host.querySelector("form");
    const callout = form?.querySelector(".callout.is-error");
    expect(text(callout)).toContain("no tiene suficiente World Index Fund");
    // Inside the form, and the bar right after it: next to the button.
    expect(callout?.parentElement?.nextElementSibling?.classList.contains("actions-bar")).toBe(
      true,
    );
  });

  it("keeps the reason of a disabled button inside the bar, on a line of its own", () => {
    expect(declarations(".actions-bar")).toContain("flex-wrap: wrap");
    expect(declarations(".actions-bar .reason")).toContain("flex-basis: 100%");
  });
});
