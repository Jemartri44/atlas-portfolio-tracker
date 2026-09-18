// The three field lists of an event: what it says, where it points and the line
// of the file it came from.
//
// The detail is where the ledger gets **checked**, so nothing is hidden: every
// field the line carries is printed, amounts and quantities through `Amount` so
// the privacy mode covers them, and the raw identifier stays beside the name it
// resolves to rather than instead of it.

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { Amount, Figure } from "../../components/index.js";
import { formatDate, formatInstantDate } from "../../format/date.js";
import type { DetailField, DetailView } from "../../view-models/index.js";

const Value = (props: { field: DetailField }): JSX.Element => (
  <>
    <Show when={props.field.kind === "amount"}>
      <Amount value={props.field.amount} />
    </Show>
    <Show when={props.field.kind === "quantity"}>
      <Amount quantity={props.field.quantity} />
    </Show>
    <Show when={props.field.kind === "date"}>{formatDate(props.field.text as string)}</Show>
    <Show when={props.field.kind === "percent"}>
      <Figure value={props.field.text} unit="percent" />
    </Show>
    <Show when={props.field.kind === "json"}>
      <pre>
        <code>{props.field.text}</code>
      </pre>
    </Show>
    <Show when={props.field.kind === "id" || props.field.kind === "text"}>
      {props.field.text}
      {/* The identifier stays where the ledger is checked, next to the name. */}
      <Show when={props.field.hint !== undefined}>
        {" "}
        <code class="tiny">{props.field.hint}</code>
      </Show>
    </Show>
  </>
);

export const EventFields = (props: { fields: readonly DetailField[] }): JSX.Element => (
  <section class="card">
    <header>
      <h2>Datos del evento</h2>
    </header>
    <dl class="fields">
      <For each={props.fields}>
        {(field) => (
          <>
            <dt>{field.label}</dt>
            <dd>
              <Value field={field} />
            </dd>
          </>
        )}
      </For>
    </dl>
  </section>
);

export const EventLinks = (props: { links: DetailView["links"] }): JSX.Element => (
  <Show when={props.links.length > 0}>
    <section class="card">
      <header>
        <h2>Enlaces</h2>
      </header>
      <dl class="fields">
        <For each={props.links}>
          {(link) => (
            <>
              <dt>{link.label}</dt>
              <dd>
                <A href={link.to}>{link.text}</A>
              </dd>
            </>
          )}
        </For>
      </dl>
    </section>
  </Show>
);

export const EventEnvelope = (props: {
  envelope: readonly DetailField[];
  position: number;
}): JSX.Element => (
  <section class="card">
    <header>
      <h2>La línea del libro</h2>
    </header>
    <dl class="fields">
      <For each={props.envelope}>
        {(field) => (
          <>
            <dt>{field.label}</dt>
            <dd>
              <Show when={field.name === "recorded_at"} fallback={<code>{field.text}</code>}>
                {formatInstantDate(field.text as string)}
              </Show>
            </dd>
          </>
        )}
      </For>
    </dl>
    <p class="note">
      Posición en el fichero: {props.position + 1}. Con este identificador puedes rectificar también
      desde la CLI.
    </p>
  </section>
);
