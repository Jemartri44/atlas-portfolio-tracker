// @vitest-environment happy-dom
//
// A dot is never part of a number typed in a field (`format/input.ts`): the key does not write it,
// the dot of the numeric keypad writes the comma, and a pasted dot is left for the parser to
// refuse whole (dropping it would turn `0.500` into `500`).

import { describe, expect, it } from "vitest";
import Configuracion from "../src/routes/ajustes/configuracion.jsx";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import {
  choose,
  press,
  show,
  text,
  today,
  type,
  until,
  withGoldenLedger,
} from "./helpers/render.jsx";

withGoldenLedger();

const open = () => show("/registrar/buy", RegistrarForm, "/registrar/:tipo");

const keyDown = (input: HTMLInputElement, init: KeyboardEventInit): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  input.dispatchEvent(event);
  return event;
};

const beforeInput = (input: HTMLInputElement, inputType: string, data: string): InputEvent => {
  const event = new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType, data });
  input.dispatchEvent(event);
  return event;
};

describe("the dot in a numeric field", () => {
  it("is not written, as a phone keyboard reports it (beforeinput, not keydown)", async () => {
    const host = await open();
    const amount = host.querySelector("#f-amount") as HTMLInputElement;
    expect(beforeInput(amount, "insertText", ".").defaultPrevented).toBe(true);
    expect(beforeInput(amount, "insertText", ",").defaultPrevented).toBe(false);
    expect(beforeInput(amount, "insertText", "5").defaultPrevented).toBe(false);
  });

  it("is a comma on the numeric keypad of a decimal field", async () => {
    const host = await open();
    const amount = host.querySelector("#f-amount") as HTMLInputElement;
    type(host, "f-amount", "1");
    amount.setSelectionRange(1, 1);
    expect(keyDown(amount, { key: ".", code: "NumpadDecimal" }).defaultPrevented).toBe(true);
    await until(() => amount.value === "1,", "the comma in the amount");
    expect(amount.value).toBe("1,");
  });

  it("is nothing on the numeric keypad of an integer field", async () => {
    today("2026-09-18");
    const host = await show("/ajustes/configuracion", Configuracion);
    const days = [...host.querySelectorAll("input[inputmode=numeric]")][0] as
      | HTMLInputElement
      | undefined;
    expect(days).toBeDefined();
    const before = days?.value;
    expect(
      keyDown(days as HTMLInputElement, { key: ".", code: "NumpadDecimal" }).defaultPrevented,
    ).toBe(true);
    expect(days?.value).toBe(before);
  });

  it("leaves a pasted dot to the parser, which refuses the whole text", async () => {
    today("2026-09-18");
    const host = await open();
    const amount = host.querySelector("#f-amount") as HTMLInputElement;
    expect(beforeInput(amount, "insertFromPaste", "0.500").defaultPrevented).toBe(false);
    choose(host, "f-account_id", "acc_mi");
    choose(host, "f-asset_id", "ast_world");
    type(host, "f-quantity", "4,8765");
    type(host, "f-amount", "0.500");
    await until(
      () =>
        [...host.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Ver el efecto"),
      "the effect button",
    );
    await press(host, "Ver el efecto");
    expect(host.querySelector("#f-amount")?.getAttribute("aria-invalid")).toBe("true");
    expect(text(host)).toContain("no se sabe si son decimales o miles");
  });
});

describe("the dot typed through a keyboard composition", () => {
  it("is not written either (insertCompositionText, as many Android keyboards report it)", async () => {
    const host = await open();
    const amount = host.querySelector("#f-amount") as HTMLInputElement;
    expect(beforeInput(amount, "insertCompositionText", "0.").defaultPrevented).toBe(true);
    expect(beforeInput(amount, "insertCompositionText", "0,").defaultPrevented).toBe(false);
  });
});
