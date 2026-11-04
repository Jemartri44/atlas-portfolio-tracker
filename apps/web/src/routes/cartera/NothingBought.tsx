// The Cartera before the first purchase: seven cards of «sin cifra» say less than the next step.

import { A } from "@solidjs/router";
import type { JSX } from "solid-js";
import { EmptyState } from "../../components/index.js";

export const NothingBought = (): JSX.Element => (
  <EmptyState
    glyph="portfolio"
    what="Todavía no hay nada en la cartera"
    why="Cuando registres tu primera compra verás aquí los pesos, la aportación del mes y la rentabilidad."
  >
    <A href="/" role="button">
      Ir a los primeros pasos
    </A>
  </EmptyState>
);
