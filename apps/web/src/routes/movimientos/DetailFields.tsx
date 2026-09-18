// The three field lists of an event: what it says, where it points and the line
// of the file it came from.
//
// The detail is where the ledger gets **checked**, so nothing is hidden: every
// field the line carries is printed, amounts and quantities through `Amount` so
// the privacy mode covers them, and the raw identifier stays beside the name it
// resolves to rather than instead of it. The two structured fields — the
// effects of a corporate action and a configuration — are sentences, never
// JSON: the JSON printed their figures in plain text with the mask on.

import { A } from "@solidjs/router";
import { For, type JSX, Match, Show, Switch } from "solid-js";
import { Amount, Figure } from "../../components/index.js";
import { formatDate, formatInstantDate } from "../../format/date.js";
import { eventLabel } from "../../format/labels.js";
import type { DetailField, DetailView } from "../../view-models/index.js";
import type { Part } from "../../view-models/structured.js";

/** A sentence made of text and figures; each figure goes through the gate. */
export const Parts = (props: { parts: readonly Part[] }): JSX.Element => (
  <For each={props.parts}>
    {(part) => (
      <Switch>
        <Match when={"amount" in part && part}>
          {(figure) => <Amount value={figure().amount} decimals={figure().decimals} />}
        </Match>
        <Match when={"quantity" in part && part}>
          {(figure) => <Amount quantity={figure().quantity} />}
        </Match>
        <Match when={"text" in part && part}>{(words) => words().text}</Match>
      </Switch>
    )}
  </For>
);

const Value = (props: { field: DetailField }): JSX.Element => (
  <Switch>
    <Match when={props.field.kind === "amount"}>
      <Amount value={props.field.amount} decimals={props.field.decimals} />
    </Match>
    <Match when={props.field.kind === "quantity"}>
      <Amount quantity={props.field.quantity} />
    </Match>
    <Match when={props.field.kind === "date"}>{formatDate(props.field.text as string)}</Match>
    <Match when={props.field.kind === "percent"}>
      <Figure value={props.field.text} unit="percent" />
    </Match>
    <Match when={props.field.kind === "effects"}>
      <ul class="flush">
        <For each={props.field.sentences ?? []}>
          {(sentence) => (
            <li>
              <Parts parts={sentence} />
            </li>
          )}
        </For>
      </ul>
    </Match>
    <Match when={props.field.kind === "settings"}>
      <dl class="fields">
        <For each={props.field.rows ?? []}>
          {(row) => (
            <>
              <dt>{row.label}</dt>
              <dd>
                <Parts parts={row.parts} />
              </dd>
            </>
          )}
        </For>
      </dl>
    </Match>
    <Match when={true}>
      {props.field.text}
      {/* The identifier stays where the ledger is checked, next to the name. */}
      <Show when={props.field.hint !== undefined}>
        {" "}
        <code class="tiny">{props.field.hint}</code>
      </Show>
    </Match>
  </Switch>
);

export const EventFields = (props: {
  fields: readonly DetailField[];
  title?: string;
}): JSX.Element => (
  <section class="card">
    <header>
      <h2>{props.title ?? "Datos del evento"}</h2>
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

/**
 * The technical block: the one place an identifier is shown as such, because
 * it is what the CLI asks for and what a repaired file is checked against.
 */
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
              <Switch fallback={<code>{field.text}</code>}>
                <Match when={field.name === "recorded_at"}>
                  {formatInstantDate(field.text as string)}
                </Match>
                <Match when={field.name === "type"}>{eventLabel(field.text as string)}</Match>
              </Switch>
            </dd>
          </>
        )}
      </For>
    </dl>
    <p class="note">
      Línea {props.position + 1} del fichero. Con este identificador puedes rectificar también desde
      la CLI.
    </p>
  </section>
);
