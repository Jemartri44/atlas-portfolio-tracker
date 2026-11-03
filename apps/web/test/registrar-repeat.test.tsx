// @vitest-environment happy-dom
//
// Registrar of direction A: «Repetir la compra del mes» carries the next purchase of the plan to the
// form, its amount masked until edited; the assets of the account a tap away as picks; the amount
// set large.

import { afterEach, describe, expect, it } from "vitest";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import Registrar from "../src/routes/registrar/index.jsx";
import { setPrivacy } from "../src/shell/preferences.js";
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
    expect(text(host.querySelector(".effect"))).not.toContain("Afecta");
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
