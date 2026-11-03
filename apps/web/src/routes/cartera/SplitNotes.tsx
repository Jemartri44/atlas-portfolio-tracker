// What explains the split of the month, always in sight under it: the help of whole units, the
// assets that get nothing, the surplus spread by target weights, and that nothing was recorded —
// Atlas never places an order.

import { A } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import { Amount, Icon } from "../../components/index.js";
import type { ContributionView } from "../../view-models/core/index.js";

export const SplitNotes = (props: { view: ContributionView }): JSX.Element => {
  const active = () => props.view.rows.filter((row) => !row.idle);
  const idle = (): string[] => props.view.rows.filter((row) => row.idle).map((row) => row.name);
  return (
    <>
      <Show when={active().some((row) => row.whole !== undefined)}>
        <p class="card-note" data-testid="whole-leftover">
          <Show when={props.view.wholeLeftover}>
            {(leftover) => (
              <>
                Con participaciones enteras sobrarían <Amount value={leftover()} /> en total.{" "}
              </>
            )}
          </Show>
          Es solo una ayuda: los fondos admiten fracciones y la propuesta en euros es la que vale.
        </p>
      </Show>
      <Show when={idle().length > 0}>
        <p class="card-note">{idle().join(", ")}: nada este mes.</p>
      </Show>
      <Show when={props.view.surplusDistributed}>
        <p class="card-note">
          La aportación cubre el déficit de todos los activos: el sobrante se reparte por pesos
          objetivo.
        </p>
      </Show>
      <p class="note-line">
        <Icon name="info" class="icon-sm" />
        <span>
          Es una propuesta y nada se ha registrado: da las órdenes a mano en tu plataforma y
          regístralas después desde <A href="/registrar">Registrar</A>.
        </span>
      </p>
    </>
  );
};
