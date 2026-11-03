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

describe("the shortcuts", () => {
  it("open the box with «/» and go to the form of each letter, either case", () => {
    expect(shortcutOf(key("/"), null, false)).toEqual({ kind: "search" });
    expect(shortcutOf(key("c"), null, false)).toEqual({ kind: "go", to: "/registrar/buy" });
    expect(shortcutOf(key("V"), null, false)).toEqual({ kind: "go", to: "/registrar/sell" });
    expect(shortcutOf(key("p"), null, false)).toEqual({ kind: "go", to: "/registrar/valuation" });
    expect(shortcutOf(key("x"), null, false)).toBeUndefined();
  });

  it.each([
    ["with Ctrl", key("c", { ctrlKey: true }), null, false],
    ["with Cmd", key("c", { metaKey: true }), null, false],
    ["with Alt", key("/", { altKey: true }), null, false],
    ["while composing", key("c", { isComposing: true }), null, false],
    ["already handled", key("c", { defaultPrevented: true }), null, false],
    ["in a field", key("c"), { tagName: "INPUT" }, false],
    ["in a text area", key("/"), { tagName: "TEXTAREA" }, false],
    ["in a list", key("p"), { tagName: "SELECT" }, false],
    ["in something editable", key("v"), { tagName: "DIV", isContentEditable: true }, false],
    ["over a dialog", key("/"), null, true],
  ])("stay out of the way %s", (_case, event, target, dialog) => {
    expect(shortcutOf(event, target, dialog)).toBeUndefined();
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
