// @vitest-environment happy-dom
//
// «Buscar o registrar» in the frame of the application: «/» opens it on a computer, the arrows and
// Enter follow a command, a letter goes to its form, and none of it happens while typing in a
// field or on a phone. The manifest offers the two forms a long press away.

import { afterEach, describe, expect, it } from "vitest";
import Ajustes from "../src/routes/ajustes/index.jsx";
import Movimientos from "../src/routes/movimientos/index.jsx";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import Resumen from "../src/routes/resumen/index.jsx";
import { setLetterKeys } from "../src/shell/preferences.js";
import { settle, showInShell, text, until, withGoldenLedger } from "./helpers/render.jsx";
import { applied, withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();
afterEach(() => withoutStyles());

const ROUTES = {
  "/": Resumen,
  "/ajustes": Ajustes,
  "/movimientos": Movimientos,
  "/registrar/:tipo": RegistrarForm,
};

const press = (key: string, target: EventTarget = document.body): void => {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
};

describe("«Buscar o registrar»", () => {
  it("opens with «/» on a computer and follows the command chosen with the arrows", async () => {
    withStyles(1440, 900);
    const host = await showInShell("/", ROUTES);
    const button = host.querySelector(".command-button");
    expect(button?.getAttribute("aria-keyshortcuts")).toBe("/");
    // Named in words, also in the compact bar, where only the icon and the key are seen.
    expect(button?.getAttribute("aria-label")).toBe("Buscar o registrar");
    press("/");
    await settle();
    const field = host.querySelector(".command-field") as HTMLInputElement;
    expect((host.querySelector(".command-dialog") as HTMLDialogElement).open).toBe(true);
    expect(document.activeElement).toBe(field);
    field.value = "valoracion";
    field.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await settle();
    const active = host.querySelector(`#${field.getAttribute("aria-activedescendant")}`);
    expect(text(active)).toContain("Registrar una valoración");
    press("ArrowDown", field);
    await settle();
    expect(text(host.querySelector('[role="option"][aria-selected="true"]'))).toContain(
      "Buscar «valoracion» en los movimientos",
    );
    press("Enter", field);
    await until(
      () => window.location.pathname + window.location.search === "/movimientos?q=valoracion",
      "the search",
    );
  });

  it("never leaves a screen with a form by a letter: what was typed stays", async () => {
    withStyles(1440, 900);
    const form = await showInShell("/registrar/sell", ROUTES);
    await until(() => form.querySelector("input:not([type=hidden])") !== null, "the form field");
    // Not from a field, and not from anywhere else on the screen.
    press("c", form.querySelector("input:not([type=hidden])") as HTMLInputElement);
    press("c");
    // Negative wait: nothing to poll.
    await settle(20);
    expect(window.location.pathname).toBe("/registrar/sell");
  });

  it("goes to the form of a letter from a screen without a form", async () => {
    withStyles(1440, 900);
    await showInShell("/", ROUTES);
    press("c");
    await until(() => window.location.pathname === "/registrar/buy", "the buy form");
  });

  it("closes with Esc and with «Cerrar», for the mouse too", async () => {
    withStyles(1440, 900);
    const host = await showInShell("/", ROUTES);
    const dialog = host.querySelector(".command-dialog") as HTMLDialogElement;
    press("/");
    await settle();
    expect(dialog.open).toBe(true);
    // The hint and «Cerrar» in one row: the foot keeps its own rule.
    expect(applied(dialog.querySelector(".command-foot"), "display")).toBe("flex");
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await settle();
    expect(dialog.open).toBe(false);
    press("/");
    await settle();
    (
      [...dialog.querySelectorAll("button")].find((button) => text(button) === "Cerrar") as
        | HTMLButtonElement
        | undefined
    )?.click();
    await settle();
    expect(dialog.open).toBe(false);
  });

  it("turns the letters off from Ajustes, on this device, and keeps «/»", async () => {
    withStyles(1440, 900);
    const host = await showInShell("/ajustes", ROUTES);
    // Ajustes holds no form: what stops the letter below is the switch alone.
    expect(host.querySelector("main form")).toBeNull();
    press("v");
    await until(() => window.location.pathname === "/registrar/sell", "the sell form");
    window.history.back();
    await until(() => window.location.pathname === "/ajustes", "Ajustes again");
    await until(() => host.querySelector("#letters-setting") !== null, "the switch");
    const toggle = host.querySelector("#letters-setting") as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    toggle.click();
    await settle();
    expect(window.localStorage.getItem("atlas.letters")).toBe("off");
    press("c");
    // Negative wait: nothing to poll.
    await settle(20);
    expect(window.location.pathname).toBe("/ajustes");
    press("/");
    await settle();
    expect((host.querySelector(".command-dialog") as HTMLDialogElement).open).toBe(true);
    setLetterKeys(true);
  });

  it("is not there on a phone, and its letters do nothing", async () => {
    withStyles(390);
    const host = await showInShell("/", ROUTES);
    expect(host.querySelector(".command-button")).toBeNull();
    press("v");
    // Negative wait: nothing to poll.
    await settle(20);
    expect(window.location.pathname).toBe("/");
  });
});
