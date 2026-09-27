// @vitest-environment happy-dom
//
// An anchor of the application stops under the fixed bar, not behind it
// (feature 020, E1, block 6; the defect of `#sincronizacion` that feature 015
// left, §30.5). Two parts, and each has its test:
//
//   1. the document's `scroll-padding-top` is tied to the height of the bar,
//      a variable, never a number, so if the bar changes the margin follows;
//   2. after a navigation with a fragment, the frame waits for the target to
//      exist and brings it up: the card of a lazy screen is painted after the
//      browser looked for the fragment, and at 400px the page did not move.
//
// The real browser measures the rest at 400 and 2045 (`medidas.json`).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import Ajustes from "../src/routes/ajustes/index.jsx";
import { scrollToFragment } from "../src/shell/anchor.js";
import { cssRules } from "./helpers/css-rules.js";
import { showInShell, until, withGoldenLedger } from "./helpers/render.jsx";
import { token, withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();
afterEach(() => {
  withoutStyles();
  vi.restoreAllMocks();
});

const styles = join(dirname(fileURLToPath(import.meta.url)), "../src/styles");

describe("the margin of an anchor", () => {
  it("is the height of the bar in force, as a variable", () => {
    const html = cssRules(readFileSync(join(styles, "base.css"), "utf8")).find(
      (rule) => rule.path.join(" ") === ":where(html)",
    );
    const padding = html?.declarations.find(([property]) => property === "scroll-padding-top");
    expect(padding?.[1]).toBe("calc(var(--header-h) + var(--space-3))");
  });

  it("follows the status bar on a phone and the top bar from 1200px", () => {
    withStyles(400);
    expect(token("--header-h")).toBe(token("--statusbar-h"));
    withoutStyles();
    withStyles(1440);
    expect(token("--header-h")).toBe(token("--topbar-h"));
    expect(token("--topbar-h")).not.toBe(token("--statusbar-h"));
  });
});

describe("going to the fragment", () => {
  it("waits for a target painted late, and brings it to the top once", async () => {
    const target = { scrollIntoView: vi.fn() } as unknown as Element;
    let frames = 0;
    const found = await scrollToFragment(
      "sincronizacion",
      () => (frames >= 3 ? target : null),
      async () => {
        frames += 1;
      },
    );
    expect(found).toBe(true);
    expect(frames).toBe(3);
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("gives up after its bound on a fragment with no target", async () => {
    let frames = 0;
    const found = await scrollToFragment(
      "nada",
      () => null,
      async () => {
        frames += 1;
      },
      5,
    );
    expect(found).toBe(false);
    expect(frames).toBe(6);
  });

  it("is what the frame does on /ajustes#sincronizacion", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    await showInShell("/ajustes#sincronizacion", { "/ajustes": Ajustes });
    await until(
      () => scroll.mock.contexts.some((element) => (element as Element).id === "sincronizacion"),
      "que el marco lleve a #sincronizacion",
    );
  });
});
