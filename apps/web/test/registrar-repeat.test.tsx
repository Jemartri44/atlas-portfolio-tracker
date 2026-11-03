// @vitest-environment happy-dom
//
// Registrar of direction A: «Repetir la compra del mes» carries the next purchase of the plan to the
// form, its amount masked until edited; the assets of the account a tap away as picks; the amount
// set large.

import { projectLedger } from "@atlas/domain";
import { afterEach, describe, expect, it } from "vitest";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import Registrar from "../src/routes/registrar/index.jsx";
import { withPrefill } from "../src/routes/registrar/prefill.js";
import { setPrivacy } from "../src/shell/preferences.js";
import {
  type EventFormSpec,
  FORM_SPECS,
  type FormValues,
  initialValues,
} from "../src/view-models/forms/index.js";
import { goldenEvents } from "./helpers/golden.js";
import {
  choose,
  settle,
  show,
  text,
  today,
  type,
  until,
  withGoldenLedger,
} from "./helpers/render.jsx";
import { withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();
afterEach(() => withoutStyles());

describe("«Repetir la compra del mes»", () => {
  it("leads to the form of the next purchase of the plan, with its account, asset and amount", async () => {
    today("2029-01-20");
    const host = await show("/registrar", Registrar);
    await until(() => host.querySelector(".is-repeat a") !== null, "la baldosa de repetir");
    const href = host.querySelector(".is-repeat a")?.getAttribute("href") ?? "";
    const query = new URLSearchParams(href.slice(href.indexOf("?")));
    expect(href.startsWith("/registrar/buy?")).toBe(true);
    expect(query.get("cuenta")).toMatch(/\S/);
    expect(query.get("activo")).toMatch(/\S/);
    expect(query.get("importe")).toMatch(/^\d+(\.\d+)?$/);
  });

  it("says its amount masked with the privacy mode on", async () => {
    today("2029-01-20");
    setPrivacy(true);
    const host = await show("/registrar", Registrar);
    await until(() => host.querySelector(".is-repeat a") !== null, "la baldosa de repetir");
    expect(text(host.querySelector(".is-repeat .tile-when"))).toContain("••••");
    expect(text(host.querySelector(".is-repeat .tile-when"))).not.toMatch(/\d/);
  });
});

describe("the form of a purchase", () => {
  const ACCOUNT = "acc_mi";

  it("comes filled from the address, the proposed amount masked until it is edited", async () => {
    setPrivacy(true);
    const host = await show(
      `/registrar/buy?cuenta=${ACCOUNT}&activo=ast_world&importe=600`,
      RegistrarForm,
      "/registrar/:tipo",
    );
    expect((host.querySelector("#f-account_id") as HTMLSelectElement | null)?.value).toBe(ACCOUNT);
    expect((host.querySelector("#f-asset_id") as HTMLSelectElement | null)?.value).toBe(
      "ast_world",
    );
    const amount = host.querySelector("#f-amount") as HTMLInputElement | null;
    expect(amount?.value).not.toBe("600");
    type(host, "f-amount", "650");
    expect((host.querySelector("#f-amount") as HTMLInputElement | null)?.value).toBe("650");
  });

  it("offers the assets of the account as picks that choose the asset, and sets the amount large", async () => {
    const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
    // No account yet: no picks, which would be every asset of every account.
    expect(host.querySelector(".picks")).toBeNull();
    choose(host, "f-account_id", ACCOUNT);
    await until(() => host.querySelectorAll(".picks .pick").length > 1, "los activos a mano");
    const pick = host.querySelector(".picks .pick") as HTMLButtonElement;
    pick.click();
    const chosen = (host.querySelector("#f-asset_id") as HTMLSelectElement).value;
    expect(chosen).not.toBe("");
    expect(pick.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector("#f-amount")?.closest(".field")?.classList.contains("is-big")).toBe(
      true,
    );
  });
});

describe("the effect beside the form", () => {
  it("follows what is typed on a computer, with no button pressed", async () => {
    withStyles(1440, 900);
    const host = await show("/registrar/cash-in", RegistrarForm, "/registrar/:tipo");
    choose(host, "f-account_id", "acc_mi");
    type(host, "f-value_date", "2027-11-02");
    type(host, "f-amount", "100");
    await until(() => text(host.querySelector(".effect")).includes("Registrar"), "el efecto");
    // Typing again takes the effect of what was there before away, and brings the new one.
    type(host, "f-amount", "120");
    // The effect of 100 is gone at once: no button to record what is no longer written.
    expect(text(host.querySelector(".effect"))).not.toContain("Registrar");
    await until(() => text(host.querySelector(".effect")).includes("Registrar"), "el efecto nuevo");
  });

  it("waits for the button on a phone", async () => {
    withStyles(390);
    const host = await show("/registrar/cash-in", RegistrarForm, "/registrar/:tipo");
    choose(host, "f-account_id", "acc_mi");
    type(host, "f-value_date", "2027-11-02");
    type(host, "f-amount", "100");
    await settle(600);
    expect(host.querySelector("form.form")).not.toBeNull();
    expect(text(host.querySelector(".effect"))).not.toContain("Registrar");
  });
});

describe("what the address may fill", () => {
  const state = projectLedger(goldenEvents(), { collectErrors: true });
  const buy = FORM_SPECS.find((spec) => spec.type === "buy") as EventFormSpec;
  const sell = FORM_SPECS.find((spec) => spec.type === "sell") as EventFormSpec;
  const base = initialValues(buy, "2029-01-20");
  const fill = (prefill: FormValues, spec = buy) =>
    withPrefill(spec, state, initialValues(spec, "2029-01-20"), prefill);

  it("fills a purchase in euros with its account, asset and amount", () => {
    const values = fill({ account_id: "acc_mi", asset_id: "ast_world", amount: "600" });
    expect([values.account_id, values.asset_id, values.currency, values.amount]).toEqual([
      "acc_mi",
      "ast_world",
      "EUR",
      "600",
    ]);
  });

  it("never puts the euros of the plan in a form of another currency", () => {
    const values = fill({ account_id: "acc_ibkr", asset_id: "ast_gold", amount: "350" });
    expect(values.currency).toBe("USD");
    expect(values.amount).toBe(base.amount);
  });

  it.each([
    ["an account that does not exist", { account_id: "acc_none", asset_id: "ast_world" }],
    ["an asset that does not exist", { account_id: "acc_mi", asset_id: "ast_none" }],
    ["an asset the account does not hold", { account_id: "acc_mi", asset_id: "ast_alpha" }],
  ])("drops %s", (_case, prefill) => {
    const values = fill(prefill);
    expect(values.asset_id).toBe(base.asset_id);
  });

  it("drops an amount that does not read as one, and fills nothing but a purchase", () => {
    expect(fill({ account_id: "acc_mi", asset_id: "ast_world", amount: "abc" }).amount).toBe(
      base.amount,
    );
    expect(fill({ account_id: "acc_mi", amount: "600" }, sell)).toEqual(
      initialValues(sell, "2029-01-20"),
    );
  });

  it("takes one value of a parameter repeated in the address, and the form stands", async () => {
    const host = await show(
      "/registrar/buy?cuenta=acc_mi&cuenta=acc_ibkr&activo=ast_world",
      RegistrarForm,
      "/registrar/:tipo",
    );
    expect((host.querySelector("#f-account_id") as HTMLSelectElement | null)?.value).toBe("acc_mi");
    expect((host.querySelector("#f-asset_id") as HTMLSelectElement | null)?.value).toBe(
      "ast_world",
    );
  });
});
