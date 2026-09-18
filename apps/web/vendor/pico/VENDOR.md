# Vendored dependency: Pico CSS

| | |
|---|---|
| Package | `@picocss/pico` |
| Version | 2.1.1 |
| Origin | https://registry.npmjs.org/@picocss/pico/-/pico-2.1.1.tgz (repository https://github.com/picocss/pico) |
| Tarball integrity | `sha512-kIDugA7Ps4U+2BHxiNHmvgPIQDWPDU4IeU6TNRdvXQM1uZX+FibqDQT2xUOnnO2yq/LUHcwnGlu1hvf4KfXnMg==` (verified against the registry metadata on 2026-09-18) |
| File vendored | `css/pico.css` from the tarball, copied **unmodified** as `pico.css` (the unminified build; Vite minifies it) |
| SHA-256 of `vendor/pico/pico.css` | `55dae2996f4f2dc108cea27ffecd3ad8eaf0063fc96fa8d92306ed76a3ad33ec` |
| Size | 93.407 bytes raw, 13,2 KB gzip |
| License | MIT (Pico). Full text in `LICENSE.md`, copied from the tarball |

Why vendored and not an npm dependency: ADR-0017 and `docs/dependencies.md`. Pico is a single dependency-free CSS file whose repository has been quiet for months; vendoring it makes that irrelevant, because the file that works today is ours and will keep working in 2036. Same treatment as `big.js` (ADR-0005, `packages/domain/vendor/VENDOR.md`).

## How it is wired

- `src/styles/index.css` imports `../../vendor/pico/pico.css` first and then our own layers, so every `--pico-*` variable can be redefined by `src/styles/tokens.css`.
- Pico reads the theme from `data-theme="light" | "dark"` on `<html>` and falls back to `prefers-color-scheme`, which is exactly what the theme switch sets: nothing custom is needed for dark mode.
- `biome.json` excludes this directory, like `packages/domain/vendor/big.js`.
- No remote fonts, no remote assets: Pico uses the system font stack (constitution, security).

## Which build and why

The full class-based build (`pico.css`), not `pico.classless.css` nor `pico.conditional.css`:

- The application styles semantic HTML (`<table>`, `<dialog>`, `<select>`, `<details>`, `<input>`) and needs Pico's defaults to apply to it without wrapper classes, which is what the classless build gives **but** it also drops the utility classes (`role="switch"`, `.grid`, `.contrast`, `outline`) that the shell uses.
- The colour variants (`pico.blue.css`, `pico.amber.css`…) are the same file with another accent; our accent comes from `tokens.css`, so the default build is the neutral starting point.

## Update procedure (expected: rarely)

1. Download the new tarball from the npm registry and verify its `dist.integrity` against the registry metadata.
2. Copy `css/pico.css` over `vendor/pico/pico.css` without edits; copy `LICENSE.md` again; recompute `sha256sum` and update this table (version, integrity, hash, size).
3. Diff the `--pico-*` variables against `src/styles/tokens.css`: a variable that disappears is a silent style regression.
4. Run `npm run build` and check the bundle size against the budget of `scripts/check-bundle.mjs`.
5. Review the application at 360 px in both themes before committing.
6. One commit: `chore(web): update vendored pico css to X.Y.Z`.
