// @vitest-environment happy-dom
//
// A dot is never part of a number typed in a field (`format/input.ts`): the key does not write it,
// the dot of the numeric keypad writes the comma, and a pasted dot is left for the parser to
// refuse whole (dropping it would turn `0.500` into `500`).

import { describe, expect, it } from "vitest";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import {
  choose,
  press,
  settle,
  show,
  text,
  today,
  type,
  withGoldenLedger,
} from "./helpers/render.jsx";

withGoldenLedger();

const open = () => show("/registrar/buy", RegistrarForm, "/registrar/:tipo");

const keyDown = (input: HTMLInputElement, init: KeyboardEventInit): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  input.dispatchEvent(event);
  return event;
};

describe("the dot key in a numeric field", () => {
  it("is not written", async () => {
    const host = await open();
    const amount = host.querySelector("#f-amount") as HTMLInputElement;
    expect(keyDown(amount, { key: ".", code: "Period" }).defaultPrevented).toBe(true);
    expect(keyDown(amount, { key: ",", code: "Comma" }).defaultPrevented).toBe(false);
  });

  it("is a comma on the numeric keypad", async () => {
    const host = await open();
    const amount = host.querySelector("#f-amount") as HTMLInputElement;
    type(host, "f-amount", "1");
    amount.setSelectionRange(1, 1);
    expect(keyDown(amount, { key: ".", code: "NumpadDecimal" }).defaultPrevented).toBe(true);
    await settle(10);
    expect(amount.value).toBe("1,");
  });

  it("leaves a pasted dot to the parser, which refuses the whole text", async () => {
    today("2026-09-18");
    const host = await open();
    choose(host, "f-account_id", "acc_mi");
    choose(host, "f-asset_id", "ast_world");
    type(host, "f-quantity", "4,8765");
    type(host, "f-amount", "0.500");
    await settle(20);
    await press(host, "Ver el efecto");
    expect(host.querySelector("#f-amount")?.getAttribute("aria-invalid")).toBe("true");
    expect(text(host)).toContain("no se sabe si son decimales o miles");
  });
});
