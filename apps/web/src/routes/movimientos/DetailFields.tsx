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
import { resultWord, type SaleResultView } from "../../view-models/sale.js";

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
 * What a movement sold, from every gain the ledger booked for it: a sale books
 * one, a corporate action can book one per account (`view-models/sale.ts`).
 * With several, a line per sale and the total; nothing is computed here.
 */
export const SaleResult = (props: { view: SaleResultView | undefined }): JSX.Element => (
  <Show when={props.view}>
    {(view) => (
      <>
        <h2 class="block-title">
          {view().lines.length === 1 ? "Resultado de la venta" : "Resultado de las ventas"}
        </h2>
        <Show
          when={view().total}
          fallback={
            <For each={view().lines}>
              {(line) => (
                <>
                  <StatLine label="Importe obtenido en euros">
                    <Amount value={line.proceeds} />
                  </StatLine>
                  <StatLine label="Coste de lo vendido">
                    <Amount value={line.cost} />
                  </StatLine>
                  <TotalLine label={resultWord(line.result)}>
                    <Amount value={line.result} signed coloured />
                  </TotalLine>
                </>
              )}
            </For>
          }
        >
          {(total) => (
            <>
              <For each={view().lines}>
                {(line) => (
                  <StatLine label={line.where}>
                    <Amount value={line.result} signed coloured />
                  </StatLine>
                )}
              </For>
              <TotalLine label={`${resultWord(total())} total`}>
                <Amount value={total()} signed coloured />
              </TotalLine>
            </>
          )}
        </Show>
        <p class="card-note">
          Es el resultado fiscal registrado, calculado con FIFO: el coste es el de los lotes más
          antiguos.
          <Show when={view().rounded}>
            {" "}
            Se redondea al céntimo una vez por operación, como se declara
            {view().total === undefined ? ": puede diferir en un céntimo de la resta." : "."}
          </Show>
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
