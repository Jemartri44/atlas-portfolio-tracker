// What the screens say about the correspondence of symbols beside the
// automatic prices (second pass of the review of PR #80): shared by the
// screens that show prices and by Ajustes, without importing the lazy module
// of the quotes.

import type { SymbolsProblem } from "./quotes.js";

/** Why the currency of the automatic prices could not be checked. */
export const symbolsNotice = (symbols: SymbolsProblem): string =>
  symbols.problem === "missing"
    ? "Sin prices/symbols.json junto a ellos no se puede comprobar la divisa de los precios automáticos: se usan tal como están. Si los importaste a mano, importa también ese fichero."
    : symbols.code === "symbols_file_newer_version"
      ? "prices/symbols.json es de una versión más nueva de la aplicación: no se usan precios automáticos. Recarga la aplicación para actualizarla."
      : "prices/symbols.json no se entiende: no se puede comprobar la divisa de los precios automáticos, y no se usan. Vuelve a declarar los símbolos desde la consola.";
