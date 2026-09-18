// "¿Hay algo que hacer?" — every active warning, ordered by importance, each
// one saying what happens and leading to where it is fixed (FR-034). When there
// is nothing, it says so calmly instead of inventing a card.

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import type { AttentionItem } from "../../view-models/index.js";

export const AttentionBlock = (props: { items: readonly AttentionItem[] }): JSX.Element => (
  <section class="card" aria-label="Lo que reclama atención">
    <header>
      <h2>Atención</h2>
      <Show when={props.items.length > 0}>
        <span class="tiny">
          {props.items.length} {props.items.length === 1 ? "aviso" : "avisos"}
        </span>
      </Show>
    </header>

    <Show
      when={props.items.length > 0}
      fallback={
        <p class="calm" style={{ margin: 0 }}>
          <span aria-hidden="true">·</span> Nada que hacer.
        </p>
      }
    >
      <div class="attention">
        <For each={props.items}>
          {(item) => (
            <A href={item.action.to} class={`item is-${item.severity}`}>
              <span class="text">{item.message}</span>
              <span class="go" aria-hidden="true">
                {item.action.label} →
              </span>
            </A>
          )}
        </For>
      </div>
    </Show>
  </section>
);
