// The keyboard of a computer: «/» and one letter per form, never in the way of the browser, of a
// field being typed in or of an open dialog; and the commands «Buscar o registrar» offers.

import { describe, expect, it } from "vitest";
import { COMMANDS, commandsFor, shortcutOf } from "../src/shell/shortcuts.js";

const key = (value: string, extra: Partial<Parameters<typeof shortcutOf>[0]> = {}) => ({
  key: value,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  defaultPrevented: false,
  ...extra,
});

const FREE = { dialogOpen: false, formOnScreen: false, letters: true };

describe("the shortcuts", () => {
  it("open the box with «/» and go to the form of each letter, either case", () => {
    expect(shortcutOf(key("/"), null, FREE)).toEqual({ kind: "search" });
    expect(shortcutOf(key("c"), null, FREE)).toEqual({ kind: "go", to: "/registrar/buy" });
    expect(shortcutOf(key("V"), null, FREE)).toEqual({ kind: "go", to: "/registrar/sell" });
    expect(shortcutOf(key("p"), null, FREE)).toEqual({ kind: "go", to: "/registrar/valuation" });
    expect(shortcutOf(key("x"), null, FREE)).toBeUndefined();
  });

  it.each([
    ["with Ctrl", key("c", { ctrlKey: true }), null, FREE],
    ["with Cmd", key("c", { metaKey: true }), null, FREE],
    ["with Alt", key("/", { altKey: true }), null, FREE],
    ["while composing", key("c", { isComposing: true }), null, FREE],
    ["held down", key("/", { repeat: true }), null, FREE],
    ["already handled", key("c", { defaultPrevented: true }), null, FREE],
    ["in a field", key("c"), { tagName: "INPUT" }, FREE],
    ["in a text area", key("/"), { tagName: "TEXTAREA" }, FREE],
    ["in a list", key("p"), { tagName: "SELECT" }, FREE],
    ["in something editable", key("v"), { tagName: "DIV", isContentEditable: true }, FREE],
    ["over a dialog", key("/"), null, { ...FREE, dialogOpen: true }],
  ])("stay out of the way %s", (_case, event, target, context) => {
    expect(shortcutOf(event, target, context)).toBeUndefined();
  });

  it("leave a screen with a form alone, and act only while they are on; «/» still opens the box", () => {
    expect(shortcutOf(key("c"), null, { ...FREE, formOnScreen: true })).toBeUndefined();
    expect(shortcutOf(key("c"), null, { ...FREE, letters: false })).toBeUndefined();
    expect(shortcutOf(key("/"), null, { ...FREE, formOnScreen: true, letters: false })).toEqual({
      kind: "search",
    });
  });
});

describe("«Buscar o registrar»", () => {
  it("offers every command before anything is typed", () => {
    expect(commandsFor("  ")).toEqual(COMMANDS);
  });

  it("finds the commands by their words, accents aside, and always offers to search the movements", () => {
    const found = commandsFor("valoracion");
    expect(found[0]?.to).toBe("/registrar/valuation");
    expect(found.at(-1)).toEqual({
      label: "Buscar «valoracion» en los movimientos",
      to: "/movimientos?q=valoracion",
    });
    expect(commandsFor("World Index").map((command) => command.to)).toEqual([
      "/movimientos?q=World%20Index",
    ]);
  });
});
