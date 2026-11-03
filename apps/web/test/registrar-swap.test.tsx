// @vitest-environment happy-dom
//
// A swap and the neutrality regime, from the web: the refusal of a merger without the regime sends
// the user to a form, so that form has to exist where the owner records things.

import { describe, expect, it } from "vitest";
import { toCorporateParams } from "../src/routes/registrar/corporate/params.js";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import { corporateForm } from "../src/view-models/forms/corporate.js";
import {
  choose,
  press,
  settle,
  show,
  text,
  type,
  until,
  withGoldenLedger,
} from "./helpers/render.jsx";

withGoldenLedger();

describe("the swap form", () => {
  it("shows what is handed over and the gain on the higher of the two market values", async () => {
    const host = await show("/registrar/permuta", RegistrarForm, "/registrar/:tipo");
    choose(host, "f-account_id", "acc_bucket");
    choose(host, "f-from_asset_id", "ast_delta");
    await settle();
    expect((host.querySelector("#f-currency") as HTMLSelectElement).value).toBe("EUR");
    choose(host, "f-to_asset_id", "ast_gamma");
    choose(host, "f-thesis_id", "th_gamma");
    type(host, "f-trade_date", "2028-06-01");
    type(host, "f-value_date", "2028-06-01");
    type(host, "f-quantity_out", "25");
    type(host, "f-market_value_out", "1000");
    type(host, "f-quantity_in", "12");
    type(host, "f-market_value_in", "1010");
    await settle(50);
    await press(host, "Ver el efecto");
    await until(() => host.querySelector("section.effect") !== null);
    expect(text(host.querySelector("section.effect"))).toContain("Ganancia");
    expect(text(host.querySelector("section.effect"))).toContain("474,50");
  });
});

describe("the neutrality regime of a merger", () => {
  const values = { asset_id: "a", effective_date: "2027-03-01", source_document: "x", ratio: "1" };

  it.each([
    ["true", true],
    ["false", false],
    ["", undefined],
  ])("%j reaches the event as %s", (typed, expected) => {
    const params = toCorporateParams(
      corporateForm("fusion") as never,
      { ...values, neutrality_regime: typed },
      [],
    );
    expect(params.neutrality_regime).toBe(expected);
  });

  it("is asked in the merger and the spin-off", () => {
    for (const slug of ["fusion", "escision"]) {
      expect(corporateForm(slug)?.fields.map((field) => field.name)).toContain("neutrality_regime");
    }
  });
});
