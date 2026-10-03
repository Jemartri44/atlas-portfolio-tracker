// What a screen says with the privacy mode on that it should not: any amount or
// quantity of the ledger, in its Spanish form, in the **text** or in an
// **attribute** (`aria-label`, `title`, the `<title>` and the `<desc>` of an
// SVG, a `data-*`). A screen reader reads an `aria-label`, and so does anybody
// who opens the DOM; a mask in the text and the figure in the tooltip hides
// nothing (feature 020, E3, block 1).
//
// Two nets, because each catches what the other lets through:
//   - the **figures of the ledger** themselves, formatted the way the screens
//     format an amount, a unit price and a quantity: a hit is a leak whatever
//     the shape around it;
//   - the **shape** of an amount or a quantity (a decimal with a comma that is
//     not a percentage or points, a figure followed by its unit): it catches a
//     figure the domain computed and no fixture contains.

import { formatDecimalString, formatQuantityString } from "../../src/format/number.js";
import { goldenEvents } from "./golden.js";

/** Attributes that are geometry or styling, never something a person reads. */
const NOT_TEXT = new Set([
  "d",
  "points",
  "viewBox",
  "transform",
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "dx",
  "dy",
  "width",
  "height",
  "class",
  "id",
  "style",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "preserveAspectRatio",
]);

/** Every piece of text a node carries: its words, then each readable attribute. */
export const sayings = (root: Element): string[] => {
  const said = [(root.textContent ?? "").replace(/ /g, " ")];
  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of element.getAttributeNames()) {
      if (!NOT_TEXT.has(attribute)) {
        said.push(`${attribute}=${(element.getAttribute(attribute) ?? "").replace(/ /g, " ")}`);
      }
    }
  }
  return said;
};

const collect = (value: unknown, into: Set<string>): void => {
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
    into.add(value.replace(/^-/, ""));
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collect(item, into);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) {
      collect(item, into);
    }
  }
};

/** The figures of the synthetic ledger as a screen would write them, three digits or more. */
export const ledgerFigures = (): string[] => {
  const raw = new Set<string>();
  for (const event of goldenEvents()) {
    collect(event, raw);
  }
  const written = new Set<string>();
  for (const value of raw) {
    for (const form of [
      formatDecimalString(value, { decimals: 2 }),
      formatDecimalString(value, { decimals: 4 }),
      formatQuantityString(value),
    ]) {
      if (form.replace(/\D/g, "").length >= 3) {
        written.add(form);
      }
    }
  }
  return [...written];
};

const regexSafe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A percentage or a count of points, which stay visible on purpose. */
const KEPT = /[\d.]+,\d+\s?(?:%|pp)|Tipo del BCE: [\d.,]+/g;

/** What `root` says that it should not under the privacy mode: empty when it is clean. */
export const exposures = (
  root: Element,
  figures: readonly string[] = ledgerFigures(),
): string[] => {
  const found: string[] = [];
  for (const saying of sayings(root)) {
    for (const figure of figures) {
      const at = new RegExp(`(?<![\\d.,])${regexSafe(figure)}(?![\\d]|,\\d|\\.\\d|\\s?%|\\s?pp)`);
      if (at.test(saying)) {
        found.push(`${figure} in «${saying.slice(0, 80)}»`);
      }
    }
    const rest = saying.replace(KEPT, "");
    if (/\d,\d/.test(rest) || /\d\s?(?:€|EUR|USD|part\.|acc\.|uds\.)/.test(rest)) {
      found.push(`the shape of an amount in «${saying.slice(0, 80)}»`);
    }
  }
  return found;
};
