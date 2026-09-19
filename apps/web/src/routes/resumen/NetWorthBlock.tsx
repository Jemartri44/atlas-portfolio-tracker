// The patrimony: always broken down, never a single number (constitution III).
// The total shown is the sum of the figures shown, so adding the column gives
// the number at the bottom, and the partial mark says when something is missing
// instead of quietly showing a smaller total.

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { Amount, Tag } from "../../components/index.js";
import { formatLongDate } from "../../format/date.js";
import type { NetWorthView } from "../../view-models/index.js";

export const NetWorthBlock = (props: { view: NetWorthView }): JSX.Element => (
  <section class="card networth" aria-label="Patrimonio total">
    <header>
      <h2>Patrimonio</h2>
      <span class="tiny">{formatLongDate(props.view.date)}</span>
    </header>

    <div class="total">
      <Amount value={props.view.total} class="total-amount" missingReason="nada tiene precio" />
      <Show when={props.view.partial}>
        <Tag tone="caution" title={`Faltan: ${props.view.missing.join(", ")}`}>
          parcial
        </Tag>
      </Show>
    </div>

    <div class="blocks">
      <For each={props.view.blocks}>
        {(block) => (
          <div class="block">
            <div class="spread">
              <span class="label">
                {block.label}
                <Show when={block.partial && block.subtotal !== undefined}>
                  {" "}
                  <span class="tiny">(parcial)</span>
                </Show>
              </span>
              <Amount value={block.subtotal} missingReason="ninguna posición tiene precio" />
            </div>
            <div class="lines">
              <For each={block.lines}>
                {(line) => (
                  <div class="line">
                    <span class="name" title={line.detail}>
                      {line.name}
                      <Show when={line.partial === true}>
                        {" "}
                        <span class="tiny">(parcial)</span>
                      </Show>
                    </span>
                    <Show
                      when={line.value !== undefined}
                      fallback={<Amount value={undefined} missingReason={line.missing} />}
                    >
                      <Amount value={line.value} />
                    </Show>
                  </div>
                )}
              </For>
              <Show when={block.lines.length === 0}>
                <span class="tiny">Sin posiciones.</span>
              </Show>
            </div>
          </div>
        )}
      </For>
    </div>

    <Show when={props.view.missing.length > 0}>
      <p class="note">
        Faltan {props.view.missing.join(", ")}:{" "}
        <A href="/registrar/valuation">registra la valoración</A> y el total dejará de ser parcial.
      </p>
    </Show>
  </section>
);
