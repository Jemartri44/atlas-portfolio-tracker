// What the fiscal screen says instead of the return: a ledger with nothing to
// declare yet, and one that cannot be read fiscally until it is repaired.

import { A } from "@solidjs/router";
import type { JSX } from "solid-js";
import { EmptyState, Notice, Section } from "../../components/index.js";

/** One empty state with the next step, not six cards of zeros. */
export const NothingYet = (): JSX.Element => (
  <div class="grid">
    <Section title="Todavía no hay nada que declarar" class="span-12">
      <EmptyState
        what="Tu libro no tiene ninguna operación"
        why="En cuanto registres una compra, una venta o un dividendo, aquí verás la base del ahorro del ejercicio, las casillas del Modelo 100 y si te toca el Modelo 720."
        glyph="plus"
      >
        <A href="/registrar" role="button">
          Registrar la primera operación
        </A>
      </EmptyState>
    </Section>
  </div>
);

/** A ledger with invalid events: the way to what to repair, never a figure (ADR-0015). */
export const CannotCompute = (props: { message: string }): JSX.Element => (
  <Notice
    severity="danger"
    title="No se puede calcular tu declaración"
    action={
      <A href="/ajustes/verificacion" role="button">
        Ver la verificación
      </A>
    }
  >
    {props.message}
  </Notice>
);

/** A year the portfolio has nothing in: said once, not as six cards of zeros. */
export const NothingThisYear = (props: { year: number }): JSX.Element => (
  <Section title={`Ejercicio ${props.year}`} class="span-12">
    <EmptyState
      what="No hay nada que declarar en este ejercicio"
      why="En tu cartera no se ha vendido nada, no han llegado rendimientos y no arrastras pérdidas: su base del ahorro es cero."
      glyph="check"
    />
  </Section>
);
