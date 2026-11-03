// @vitest-environment happy-dom
//
// «Buscar o registrar» in the frame of the application: «/» opens it on a computer, the arrows and
// Enter follow a command, a letter goes to its form, and none of it happens while typing in a
// field or on a phone. The manifest offers the two forms a long press away.

import { afterEach, describe, expect, it } from "vitest";
import Movimientos from "../src/routes/movimientos/index.jsx";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import Resumen from "../src/routes/resumen/index.jsx";
import { settle, showInShell, text, withGoldenLedger } from "./helpers/render.jsx";
import { withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();
afterEach(() => withoutStyles());

const ROUTES = { "/": Resumen, "/movimientos": Movimientos, "/registrar/:tipo": RegistrarForm };

const press = (key: string, target: EventTarget = document.body): void => {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
};

describe("«Buscar o registrar»", () => {
  it("opens with «/» on a computer and follows the command chosen with the arrows", async () => {
    withStyles(1440, 900);
    const host = await showInShell("/", ROUTES);
    expect(host.querySelector(".command-button")?.getAttribute("aria-keyshortcuts")).toBe("/");
    press("/");
    await settle();
    const field = host.querySelector(".command-field") as HTMLInputElement;
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
    await settle(20);
    expect(window.location.pathname + window.location.search).toBe("/movimientos?q=valoracion");
  });

  it("goes to the form of a letter, but not while a field is being typed in", async () => {
    withStyles(1440, 900);
    const host = await showInShell("/registrar/sell", ROUTES);
    await settle(20);
    const input = host.querySelector("input:not([type=hidden])") as HTMLInputElement;
    press("c", input);
    await settle(20);
    expect(window.location.pathname).toBe("/registrar/sell");
    press("c");
    await settle(20);
    expect(window.location.pathname).toBe("/registrar/buy");
  });

  it("is not there on a phone, and its letters do nothing", async () => {
    withStyles(390);
    const host = await showInShell("/", ROUTES);
    expect(host.querySelector(".command-button")).toBeNull();
    press("v");
    await settle(20);
    expect(window.location.pathname).toBe("/");
  });
});
