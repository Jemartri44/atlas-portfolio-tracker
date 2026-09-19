// @vitest-environment happy-dom
//
// A theme forced against the system paints the phone's browser bar too: it
// stayed white over a dark page (second pass of the review of 2026-09-19).

import { afterEach, describe, expect, it } from "vitest";
import { applyTheme } from "../src/shell/theme.js";

const metas = (): HTMLMetaElement[] => {
  document.head.innerHTML = `
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#1f1f1d" media="(prefers-color-scheme: dark)" />`;
  return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
};

afterEach(() => {
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
});

describe("the theme", () => {
  it("paints the browser's bar with the forced theme, whatever the system says", () => {
    const tags = metas();
    applyTheme(document, "dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(tags.map((tag) => tag.content)).toEqual(["#1f1f1d", "#1f1f1d"]);
    applyTheme(document, "light");
    expect(tags.map((tag) => tag.content)).toEqual(["#ffffff", "#ffffff"]);
  });

  it("gives each tag its own colour back when the system decides again", () => {
    const tags = metas();
    applyTheme(document, "dark");
    applyTheme(document, "system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(tags.map((tag) => tag.content)).toEqual(["#ffffff", "#1f1f1d"]);
  });
});
