// What a form may have to say above everything else: the data changed
// underneath it — and two small pieces of the form of a correction: its reason and the refusal of its dependants.

import { A } from "@solidjs/router";
import type { JSX } from "solid-js";
import { EmptyState, Field, Notice } from "../../components/index.js";
import { countOf } from "../../format/number.js";
import { PageHeader } from "../../shell/PageHeader.jsx";

export const Reloaded = (): JSX.Element => (
  <Notice severity="caution" title="Tus datos han cambiado">
    Otro dispositivo u otra pestaña han registrado algo mientras rellenabas. Se han vuelto a leer
    tus datos y el efecto de abajo es el de ahora: revísalo y confirma otra vez. No se ha pisado
    nada.
  </Notice>
);

/** An address with no form behind it: said, with the way to what can be recorded. */
export const NoForm = (props: { title: string; what: string }): JSX.Element => (
  <>
    <PageHeader title={props.title} />
    <EmptyState what={props.what}>
      <A href="/registrar" role="button" class="secondary">
        Ver qué se puede registrar
      </A>
    </EmptyState>
  </>
);

/** The reason of a correction: it is written into the ledger with the pair. */
export const CorrectionReason = (props: {
  value: string;
  onInput: (value: string) => void;
}): JSX.Element => (
  <Field
    id="correct-reason"
    kind="text"
    label="Motivo de la rectificación"
    required
    hint="Se anula el original y se registra el corregido; el motivo queda registrado."
    value={props.value}
    onInput={props.onInput}
    class="full"
  />
);

/** The movements that depend on the one being corrected, in one sentence. */
export const dependentsSentence = (count: number): string =>
  `${countOf(count, "movimiento posterior depende", "movimientos posteriores dependen")} de este: rectifícalos antes.`;
