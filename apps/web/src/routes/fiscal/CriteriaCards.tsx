// The two lists of criteria, side by side and kept apart on purpose.
//
// "No sé cómo se lee esto" y "sé cómo se lee, y esto es lo que hay detrás" are
// not the same thing (feature 010, block 2): the doubtful ones are where the
// reading itself is open, and the settled ones are the criteria held at high
// certainty that still move a figure if they are read the other way. Filtering
// the second list by amount is what lost 200,00 € of exposure once; an entry
// whose other reading moves nothing appears too, with its zeros.

import { type JSX, Show } from "solid-js";
import { EmptyState, Section } from "../../components/index.js";
import type { StakeView } from "../../view-models/fiscal/index.js";
import { StakeList } from "./Criteria.jsx";

export const DoubtfulCard = (props: { stakes: readonly StakeView[] }): JSX.Element => (
  <Section title="Criterios en duda" class="span-6">
    <Show
      when={props.stakes.length > 0}
      fallback={
        <EmptyState
          what="Ninguna cifra de este ejercicio depende de un criterio dudoso"
          why="Todo lo que has declarado se apoya en lecturas firmes de la norma."
          glyph="check"
        />
      }
    >
      <p class="card-note">
        Aquí está lo que <strong>no</strong> está claro en la norma y cuánto hay detrás. La
        dirección dice qué pasaría si la lectura aplicada estuviera mal.
      </p>
      <StakeList stakes={props.stakes} />
    </Show>
  </Section>
);

export const SettledCard = (props: { stakes: readonly StakeView[] }): JSX.Element => (
  <Show when={props.stakes.length > 0}>
    <Section title="Criterios firmes con dinero detrás" class="span-6">
      <p class="card-note">
        Estas lecturas no están en duda. Se enseñan porque, si alguna vez se leyeran al revés,
        moverían esta cantidad: saberlo es parte de saber qué estás declarando.
      </p>
      <StakeList stakes={props.stakes} />
    </Section>
  </Show>
);
