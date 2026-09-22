// @vitest-environment happy-dom
//
// Every child of a grid says how many of its twelve columns it takes. One that
// did not — the folded filters of Movimientos — took one column of twelve from
// 1024px and squeezed every field in it to ~100px. Nothing overflowed, so no
// measure of overflow saw it (second pass of the review of 2026-09-19).

import type { JSX } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import Configuracion from "../src/routes/ajustes/configuracion.jsx";
import Ajustes from "../src/routes/ajustes/index.jsx";
import Verificacion from "../src/routes/ajustes/verificacion.jsx";
import Cartera from "../src/routes/cartera/index.jsx";
import Cubo from "../src/routes/cubo/index.jsx";
import Detail from "../src/routes/movimientos/detail.jsx";
import Movimientos from "../src/routes/movimientos/index.jsx";
import Resumen from "../src/routes/resumen/index.jsx";
import { show, withGoldenLedger } from "./helpers/render.jsx";
import { withoutStyles, withStyles } from "./helpers/styles.js";

withGoldenLedger();
afterEach(() => withoutStyles());

const SCREENS: readonly [string, () => JSX.Element, string?][] = [
  ["/", Resumen],
  ["/movimientos", Movimientos],
  ["/movimientos/01M1PS7N80HK088D7010QSGMEQ", Detail, "/movimientos/:id"],
  ["/cartera", Cartera],
  ["/cubo", Cubo],
  ["/ajustes", Ajustes],
  ["/ajustes/configuracion", Configuracion],
  ["/ajustes/verificacion", Verificacion],
];

describe("the grid", () => {
  for (const width of [1024, 1280]) {
    it(`gives every child a span at ${width}px`, async () => {
      withStyles(width, 800);
      const unspanned: string[] = [];
      for (const [path, screen, pattern] of SCREENS) {
        const host = await show(path, screen, pattern);
        for (const child of host.querySelectorAll(".grid > *")) {
          const column = getComputedStyle(child).gridColumn;
          if (column === "" || column === "auto" || column === "auto / auto") {
            unspanned.push(`${path}: ${child.tagName.toLowerCase()}.${child.className}`);
          }
        }
      }
      expect(unspanned).toEqual([]);
    });
  }
});
