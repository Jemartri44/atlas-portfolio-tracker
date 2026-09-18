# Vendored dependency: uPlot

| | |
|---|---|
| Package | `uplot` |
| Version | 1.6.32 (**pinned**; ADR-0017 names this exact version) |
| Origin | https://registry.npmjs.org/uplot/-/uplot-1.6.32.tgz (repository https://github.com/leeoniya/uPlot) |
| Tarball integrity | `sha512-KIMVnG68zvu5XXUbC4LQEPnhwOxBuLyW1AHtpm6IKTXImkbLgkMy+jabjLgSLMasNuGGzQm/ep3tOkyTxpiQIw==` (verified against the registry metadata on 2026-09-18) |
| Files vendored | `dist/uPlot.esm.js` → `uPlot.js`, `dist/uPlot.d.ts` → `uPlot.d.ts`, `dist/uPlot.min.css` → `uPlot.css`, `LICENSE`. All **unmodified** |
| SHA-256 `uPlot.js` | `5dd9b3281aa64b461b42d9945f6adb2649d346502b12281a9ae0d46599a80eba` |
| SHA-256 `uPlot.d.ts` | `af44374f6e808be4f7f3fa5888b9c7574dca9f8a15a66d54b6763535802c8080` |
| SHA-256 `uPlot.css` | `df630c6a8d6f8eeaff264b50f73ce5b114f646ffd9a0bb74f049b0a00135fa04` |
| SHA-256 `LICENSE` | `8f989229699b4fe2f1a0432d0e9edc338a8a911e250e2d1b01ecd770a5f5b1bd` |
| Size | 145.423 bytes raw; minified by Rolldown to ~50 KB, **21,6 KB gzip** in the bundle. The CSS is 1.857 bytes raw, 0,7 KB gzip |
| License | MIT (Leon Sorokin). Full text in `LICENSE`, copied from the tarball |

Why vendored and not an npm dependency: ADR-0017 and `docs/dependencies.md`. uPlot is a single dependency-free file; vendoring it makes the health of its repository irrelevant, because the code that works today is ours and will keep working in 2036. Same treatment as Pico (`vendor/pico/`) and `big.js` (ADR-0005).

**On the size**: ADR-0017 quotes "23 KB", which is the **minified** figure it compares against Chart.js (66 KB) and ECharts (197 KB). Measured on 2026-09-18, the minified file is 49,9 KB and **21,6 KB gzip**. The two numbers are not in conflict; the unit simply was not gzip. It is the reason the bundle budget was split in two (arranque / total) in feature 007.

## Which build and why

The **ESM source** (`uPlot.esm.js`), not the minified IIFE:

- Rolldown minifies it anyway, so the bundle is the same size either way.
- Vendored code is meant to be read in ten years. A minified file cannot be audited, and auditing is half the point of vendoring.
- `uPlot.d.ts` comes with it so `tsc` in strict mode needs no `any` and no hand-written typings.

## How it is wired

- `src/components/chart/Chart.tsx` imports `../../../vendor/uplot/uPlot.js`; it is the **only** importer, so uPlot lands in the lazily loaded chunks of `/nucleo` and `/cubo` and never in the boot path.
- `src/styles/index.css` imports `../../vendor/uplot/uPlot.css` after Pico and before our layers, so `src/styles/components.css` can restyle `.u-*` with our own tokens.
- `biome.json` excludes this directory, like `vendor/pico`.
- No remote fonts, no remote assets, no network: uPlot draws on a `<canvas>` (constitution, security).
- The architecture test that checks every class in the markup is declared somewhere reads this stylesheet too: the `.u-*` classes uPlot writes at runtime are declared here, not by us.

## What uPlot does not do, and what we do instead

- **No pie or donut**: the core allocation is drawn by hand in SVG (`components/chart/Allocation.tsx`), which is what ADR-0017 already said.
- **No touch gestures**: the time range is chosen with buttons (1M / 1A / 5A / Todo). That is a decision of ADR-0017, not a workaround.
- **No gap policy of its own beyond `null`**: a `null` in a series is drawn as a gap when `spanGaps` is false, which is exactly the rule of this project — where there is no price there is a hole.

## Update procedure (expected: rarely)

1. Download the new tarball from the npm registry and verify its `dist.integrity` against the registry metadata.
2. Copy the four files again without edits; recompute `sha256sum` and update this table (version, integrity, hashes, size).
3. Diff `uPlot.d.ts` against what `Chart.tsx` uses; the options object is the contract.
4. Run `npm run build` and check **both** budgets of `scripts/check-bundle.mjs`.
5. Look at the three charts at 400×890 with `deviceScaleFactor` 3, in both themes, before committing.
6. One commit: `chore(web): update vendored uplot to X.Y.Z`.
