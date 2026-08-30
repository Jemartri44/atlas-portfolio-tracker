# Vendored dependency: big.js

| | |
|---|---|
| Package | `big.js` |
| Version | 7.0.1 |
| Origin | https://registry.npmjs.org/big.js/-/big.js-7.0.1.tgz (repository https://github.com/MikeMcl/big.js) |
| Tarball integrity | `sha512-iFgV784tD8kq4ccF1xtNMZnXeZzVuXWWM+ERFzKQjv+A5G9HC8CY3DuV45vgzFFcW+u2tIvmF95+AzWgs6BjCg==` |
| File vendored | `big.mjs` from the tarball, copied **unmodified** as `big.js` (ESM build; the UMD `big.js` of the tarball is not used) |
| SHA-256 of `vendor/big.js` | `bce2c8a40bdf758848ac066732ca0c4e6c7660de9fcf310c6144f85551802bf1` |
| License | MIT (Michael Mclaughlin). Full text below |
| Typings | `big.d.ts`, hand-written, covers only the API used by `src/money/decimal.ts` |

Why vendored and not an npm dependency: ADR-0005 and `docs/dependencies.md`. `@atlas/domain` has no runtime dependencies; this file is part of the domain and is expected to never change.

## How it is wired

- `src/money/decimal.ts` imports `../../vendor/big.js`; TypeScript resolves the types from `big.d.ts`.
- `vendor/` is outside the TypeScript program (`rootDir: src`, output in `dist/`); the compiled `dist/money/decimal.js` resolves `../../vendor/big.js` to this very directory, so nothing is copied.
- The architecture test only allows domain imports that resolve inside `src/` or `vendor/`.

## Update procedure (expected: never)

1. Download the new tarball from the npm registry and verify its `dist.integrity` against the registry metadata.
2. Copy `big.mjs` over `vendor/big.js` without edits; recompute `sha256sum vendor/big.js` and update this table (version, integrity, hash).
3. Diff the public API against `big.d.ts` and adjust the typings if needed.
4. Run the full test suite; the property tests of `Decimal` and `Money` are the contract.
5. One commit: `chore(domain): update vendored big.js to X.Y.Z`.

## License

The MIT License (MIT)
=====================

Copyright © `<2025>` `Michael Mclaughlin`

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the “Software”), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

