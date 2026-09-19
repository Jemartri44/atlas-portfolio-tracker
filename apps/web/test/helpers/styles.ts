// Our stylesheets, applied to the document of a test, so a test can ask what
// the browser would **apply** — `getComputedStyle` — instead of whether a
// declaration is written somewhere in a file. happy-dom resolves the cascade,
// the custom properties and the media queries against the viewport, which is
// what the defects of the shell were made of: a rule that existed and did not
// win, a list hidden by a query nobody tested at that width.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** A path of the web, from this file: `new URL` is not Node's under happy-dom. */
const styles = join(dirname(fileURLToPath(import.meta.url)), "../../src/styles");

/** The stylesheets `index.css` imports, in its order, our own ones only. */
const ownSheets = (): string[] =>
  [...readFileSync(join(styles, "index.css"), "utf8").matchAll(/@import "\.\/([^"]+)";/g)].map(
    (match) => match[1] as string,
  );

/** The whole cascade as one text, in the order the application loads it. */
export const cascade = (): string =>
  ownSheets()
    .map((name) => readFileSync(join(styles, name), "utf8"))
    .join("\n");

/**
 * Puts the cascade in the document and sets the viewport. The width has to be
 * set **before** the markup is rendered: happy-dom recomputes styles on a
 * change of the DOM, not on a change of the viewport alone.
 */
export const withStyles = (width = 400, height = 890): void => {
  // happy-dom's own handle on the window; absent in any other environment.
  (
    window as unknown as { happyDOM?: { setViewport: (size: object) => void } }
  ).happyDOM?.setViewport({ width, height });
  const style = document.createElement("style");
  style.dataset.test = "cascade";
  style.textContent = cascade();
  document.head.append(style);
};

/** Removes what `withStyles` put in the document. */
export const withoutStyles = (): void => {
  for (const style of document.head.querySelectorAll('style[data-test="cascade"]')) {
    style.remove();
  }
};

/** A custom property of the root, resolved: what a token is worth right now. */
export const token = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** The applied value of one property of one element. */
export const applied = (element: Element | null | undefined, property: string): string => {
  if (element === null || element === undefined) {
    throw new Error(`no hay elemento para leer ${property}`);
  }
  return getComputedStyle(element).getPropertyValue(property).trim();
};

/** A length as pixels: happy-dom answers some of them in `rem`, at 16px each. */
export const pixels = (length: string): number => {
  const value = Number.parseFloat(length);
  return length.endsWith("rem") ? value * 16 : value;
};
