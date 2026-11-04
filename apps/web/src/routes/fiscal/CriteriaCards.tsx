// The two lists of criteria, side by side and kept apart on purpose.
//
// "No sé cómo se lee esto" y "sé cómo se lee, y esto es lo que hay detrás" are
// not the same thing: the doubtful ones are where the
// reading itself is open, and the settled ones are the criteria held at high
// certainty that still move a figure if they are read the other way. Filtering
// the second list by amount is what lost 200,00 € of exposure once; an entry
// whose other reading moves nothing appears too, with its zeros.

import { type JSX, Show } from "solid-js";
import { FoldSection } from "../../components/index.js";
import { countOf } from "../../format/number.js";
import type { StakeView } from "../../view-models/fiscal/index.js";
import { StakeList } from "./Criteria.jsx";

export const DoubtfulCard = (props: { stakes: readonly StakeView[] }): JSX.Element => (
  <FoldSection
    title="Criterios en duda"
    summary={
      props.stakes.length === 0
        ? "Ninguna cifra depende de uno"
        : countOf(props.stakes.length, "criterio", "criterios")
    }
  >
    <Show
      when={props.stakes.length > 0}
      fallback={
        <p class="card-note">
          Ninguna cifra de este ejercicio depende de un criterio dudoso: todo lo que has declarado
          se apoya en lecturas firmes de la norma.
        </p>
      }
    >
      <p class="card-note">
        Aquí está lo que <strong>no</strong> está claro en la norma y cuánto hay detrás. La
        dirección dice qué pasaría si la lectura aplicada estuviera mal.
      </p>
      <StakeList stakes={props.stakes} />
    </Show>
  </FoldSection>
);

/**
 * It has an empty state instead of disappearing, and that is the point: the
 * console printed its section always and the screen hid the card when there
 * was nothing, so the two interfaces answered the same question differently —
 * exactly what ADR-0024 is about. "We looked and it moves nothing" **is**
 * information, by the same argument that split this list from the doubtful one
 * instead of filtering it.
 */
export const SettledCard = (props: { stakes: readonly StakeView[] }): JSX.Element => (
  <FoldSection
    title="Criterios firmes con dinero detrás"
    summary={
      props.stakes.length === 0
        ? "Ninguno movería nada"
        : countOf(props.stakes.length, "criterio", "criterios")
    }
  >
    <Show
      when={props.stakes.length > 0}
      fallback={
        <p class="card-note">
          Ninguno de tus criterios firmes movería nada leído al revés. Se ha comprobado uno a uno:
          no es que no se haya mirado.
        </p>
      }
    >
      <p class="card-note">
        Estas lecturas no están en duda. Se enseñan porque, si alguna vez se leyeran al revés,
        moverían esta cantidad: saberlo es parte de saber qué estás declarando.
      </p>
      <StakeList stakes={props.stakes} />
    </Show>
  </FoldSection>
);
