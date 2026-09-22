// The theme on the document: the tokens read `data-theme` both ways
// (styles/tokens.css), and the bar of the phone's browser reads the
// `theme-color` meta tags, one per system scheme (index.html). A theme forced
// against the system left that bar white over a dark page (second pass of the
// review of 2026-09-19), so a forced theme sets both tags to its own colour,
// and «Sistema» gives each back the one it was written with.
//
// No colour is written here: each tag remembers its own, and a forced theme
// borrows the colour of the tag written for that scheme.

import type { Theme } from "../ledger/state.js";

type Scheme = "light" | "dark";

// The attribute, not the `media` property, which not every DOM implements.
const schemeOf = (meta: HTMLMetaElement): Scheme =>
  (meta.getAttribute("media") ?? "").includes("dark") ? "dark" : "light";

export const applyTheme = (doc: Document, theme: Theme): void => {
  if (theme === "system") {
    doc.documentElement.removeAttribute("data-theme");
  } else {
    doc.documentElement.setAttribute("data-theme", theme);
  }
  const metas = [...doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  for (const meta of metas) {
    meta.dataset.written ??= meta.content;
  }
  const written = (scheme: Scheme): string | undefined =>
    metas.find((meta) => schemeOf(meta) === scheme)?.dataset.written;
  for (const meta of metas) {
    meta.content = (theme === "system" ? meta.dataset.written : written(theme)) ?? meta.content;
  }
};
