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

import type { RealizedGain } from "@atlas/domain";
import { A } from "@solidjs/router";
import { For, type JSX, Match, Show, Switch } from "solid-js";
import {
  Amount,
  Disclosure,
  Figure,
  Icon,
  Parts,
  Section,
  StatLine,
  TotalLine,
} from "../../components/index.js";
import { formatDate, formatInstantDate } from "../../format/date.js";
import { eventLabel } from "../../format/labels.js";
import type { DetailField, DetailView } from "../../view-models/index.js";

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
    <Match when={true}>{props.field.text}</Match>
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
 * What a sale produced, from the gain the ledger booked for it: the figure a
 * sale is recorded for, which the list of its fields never said (review of
 * 2026-09-19). Nothing is computed here; absent, nothing is shown.
 */
export const SaleResult = (props: { gain: RealizedGain | undefined }): JSX.Element => (
  <Show when={props.gain}>
    {(gain) => (
      <>
        <h2 class="block-title">Resultado de la venta</h2>
        <StatLine label="Importe obtenido en euros">
          <Amount value={gain().proceeds_eur} />
        </StatLine>
        <StatLine label="Coste de lo vendido">
          <Amount value={gain().cost_eur} />
        </StatLine>
        <TotalLine label={gain().gain_eur_rounded.isNegative() ? "Pérdida" : "Ganancia"}>
          <Amount value={gain().gain_eur_rounded} signed coloured />
        </TotalLine>
        <p class="card-note">
          Es el resultado fiscal registrado, calculado con FIFO: el coste es el de los lotes más
          antiguos.
        </p>
      </>
    )}
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
  /**
   * The identifiers behind the names of the data (`acc_mi`, `ast_world`, the
   * ULID of an order): here and nowhere else, folded, where the ledger is
   * checked and a repair is written (review of 2026-09-19).
   */
  identifiers?: readonly DetailField[];
  /** Bookkeeping of the line: its origin, and the rate of 1 of an operation in euros. */
  technical?: readonly DetailField[];
}): JSX.Element => (
  <Disclosure label="Registro técnico">
    <dl class="facts">
      <For each={props.technical ?? []}>
        {(field) => (
          <div class="fact">
            <dt>{field.label}</dt>
            <dd>
              <Value field={field} />
            </dd>
          </div>
        )}
      </For>
      <For each={props.identifiers ?? []}>
        {(field) => (
          <div class="fact">
            <dt>{field.label}</dt>
            <dd>
              <code>{field.hint}</code>
            </dd>
          </div>
        )}
      </For>
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
