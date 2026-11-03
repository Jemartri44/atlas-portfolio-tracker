// @vitest-environment happy-dom
//
// A swap and the neutrality regime, from the web: the refusal of a merger without the regime sends
// the user to a form, so that form has to exist where the owner records things.

import { describe, expect, it } from "vitest";
import { store } from "../src/ledger/state.js";
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

const record = async (host: HTMLElement): Promise<void> => {
  await press(host, "Ver el efecto");
  await until(() => host.querySelector("section.effect") !== null);
  (
    [...host.querySelectorAll("section.effect button")].find(
      (button) => button.textContent?.trim() === "Registrar",
    ) as HTMLButtonElement
  ).click();
  await settle(50);
};

describe("the swap form", () => {
  it("records what is handed over and what is received, with both market values", async () => {
    const before = store.snapshot()?.events.length ?? 0;
    const host = await show("/registrar/permuta", RegistrarForm, "/registrar/:tipo");
    choose(host, "f-account_id", "acc_ibkr");
    choose(host, "f-from_asset_id", "ast_btc");
    await settle();
    expect((host.querySelector("#f-currency") as HTMLSelectElement).value).toBe("EUR");
    choose(host, "f-to_asset_id", "ast_mm");
    type(host, "f-trade_date", "2028-06-01");
    type(host, "f-value_date", "2028-06-01");
    type(host, "f-quantity_out", "1");
    type(host, "f-market_value_out", "100");
    type(host, "f-quantity_in", "2");
    type(host, "f-market_value_in", "101");
    await settle(50);
    await record(host);
    await until(() => (store.snapshot()?.events.length ?? 0) > before);
    expect(store.snapshot()?.events.at(-1)).toMatchObject({
      type: "swap",
      from_asset_id: "ast_btc",
      to_asset_id: "ast_mm",
      market_value_out: "100",
      market_value_in: "101",
    });
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
