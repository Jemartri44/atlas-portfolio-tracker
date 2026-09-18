// A sober "it does not exist": never a blank page (FR-019).

import { A } from "@solidjs/router";
import type { JSX } from "solid-js";
import { EmptyState } from "../components/index.js";
import { PageHeader } from "../shell/PageHeader.jsx";

export default function NoExisteRoute(): JSX.Element {
  return (
    <>
      <PageHeader title="Aquí no hay nada" />
      <EmptyState what="Esa dirección no corresponde a ninguna pantalla.">
        <A href="/">Volver al resumen</A>
      </EmptyState>
    </>
  );
}
