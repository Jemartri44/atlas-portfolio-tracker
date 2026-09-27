// What a corporate action leaves in fractions, by account: none, or the ones
// that are sold, with the gain that sale brings. Said by the form of the
// corporate action before its effect.

import { Quantity } from "@atlas/domain";
import { For, type JSX, Show } from "solid-js";
import { Amount, Notice } from "../../../components/index.js";
import { displayName, type NameIndex } from "../../../format/names.js";

export const Fractions = (props: {
  readonly none: boolean;
  readonly fractional: readonly { readonly account_id: string; readonly quantity: string }[];
  readonly names: NameIndex;
}): JSX.Element => (
  <>
    <Show when={props.none}>
      <Notice severity="info" title="Sin picos">
        Ninguna cuenta queda con fracciones, así que no se genera ninguna venta forzosa.
      </Notice>
    </Show>
    <Show when={props.fractional.length > 0}>
      <Notice severity="caution" title="Picos que se venden">
        <For each={props.fractional}>
          {(row) => (
            <p class="meta">
              {displayName(props.names, row.account_id)}:{" "}
              <Amount quantity={Quantity.parse(row.quantity)} />
            </p>
          )}
        </For>
        Esa venta genera ganancia patrimonial. La aplicación la calcula al registrar el evento.
      </Notice>
    </Show>
  </>
);
