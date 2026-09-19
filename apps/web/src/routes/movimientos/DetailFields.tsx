// The three field lists of an event: what it says, where it points and the line
// of the file it came from (docs/design/system.md §7.3: the data in two
// columns, the linked movements as rows, the technical record folded).
//
// The detail is where the ledger gets **checked**, so nothing is hidden: every
// field the line carries is printed, amounts and quantities through `Amount` so
// the privacy mode covers them, and the raw identifier stays beside the name it
// resolves to rather than instead of it. The two structured fields — the
// effects of a corporate action and a configuration — are sentences, never
// JSON: the JSON printed their figures in plain text with the mask on.

import { A } from "@solidjs/router";
import { For, type JSX, Match, Show, Switch } from "solid-js";
import { Amount, Disclosure, Figure, Icon, Section } from "../../components/index.js";
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
          {(figure) => <Amount quantity={figure().quantity} of={figure().of} />}
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
      <Amount quantity={props.field.quantity} of={props.field.of} />
    </Match>
    <Match when={props.field.kind === "date"}>{formatDate(props.field.text as string)}</Match>
    <Match when={props.field.kind === "percent"}>
      <Figure value={props.field.text} unit="percent" />
    </Match>
    <Match when={props.field.kind === "effects"}>
      <ul class="sentences">
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
      <dl class="facts is-nested">
        <For each={props.field.rows ?? []}>
          {(row) => (
            <div class="fact">
              <dt>{row.label}</dt>
              <dd>
                <Parts parts={row.parts} />
              </dd>
            </div>
          )}
        </For>
      </dl>
    </Match>
    <Match when={true}>
      {props.field.text}
      {/* The identifier stays where the ledger is checked, next to the name. */}
      <Show when={props.field.hint !== undefined}>
        {" "}
        <code class="meta">{props.field.hint}</code>
      </Show>
    </Match>
  </Switch>
);

/** Label and value, in two columns: the data of the event as it was written. */
export const Facts = (props: { fields: readonly DetailField[] }): JSX.Element => (
  <dl class="facts">
    <For each={props.fields}>
      {(field) => (
        <div class="fact">
          <dt>{field.label}</dt>
          <dd>
            <Value field={field} />
          </dd>
        </div>
      )}
    </For>
  </dl>
);

/** The fields as a card of their own: what the correction form starts from. */
export const EventFields = (props: {
  fields: readonly DetailField[];
  title?: string;
}): JSX.Element => (
  <Section title={props.title ?? "Datos del movimiento"}>
    <Facts fields={props.fields} />
  </Section>
);

export const EventLinks = (props: { links: DetailView["links"] }): JSX.Element => (
  <Show when={props.links.length > 0}>
    <Section title="Movimientos enlazados" class="span-4">
      <ul class="rows">
        <For each={props.links}>
          {(link) => (
            <li>
              <A href={link.to} class="row">
                <span class="main">
                  <span class="title truncate">{link.text}</span>
                  <span class="sub">{link.label}</span>
                </span>
                <Icon name="chevright" class="icon-sm chev" />
              </A>
            </li>
          )}
        </For>
      </ul>
    </Section>
  </Show>
);

/**
 * The technical record, folded: the one place an identifier is shown as such,
 * because it is what the CLI asks for and what a repaired file is checked
 * against.
 */
export const EventEnvelope = (props: {
  envelope: readonly DetailField[];
  position: number;
}): JSX.Element => (
  <Disclosure label="Registro técnico">
    <dl class="facts">
      <For each={props.envelope}>
        {(field) => (
          <div class="fact">
            <dt>{field.label}</dt>
            <dd>
              <Switch fallback={<code>{field.text}</code>}>
                <Match when={field.name === "recorded_at"}>
                  {formatInstantDate(field.text as string)}
                </Match>
                <Match when={field.name === "type"}>{eventLabel(field.text as string)}</Match>
              </Switch>
            </dd>
          </div>
        )}
      </For>
    </dl>
    <p class="card-note">
      Línea {props.position + 1} del archivo de datos. Con este identificador puedes rectificar
      también desde la CLI.
    </p>
  </Disclosure>
);
