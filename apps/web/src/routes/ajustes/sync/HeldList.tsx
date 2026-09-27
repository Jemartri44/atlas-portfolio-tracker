// What the sync holds back, in the card of the sync (feature 015, E4): each
// unit with its reason, its operations — the type, the date and any amount
// through `Amount`, which the privacy mode masks; never a raw line — and the
// resolutions it offers. And the plan of a redo, shown before recording it.

import { For, type JSX, Show } from "solid-js";
import { Amount, Notice } from "../../../components/index.js";
import { eventLabel } from "../../../format/labels.js";
import { displayName, nameIndex } from "../../../format/names.js";
import { store } from "../../../ledger/state.js";
import type { HeldItem } from "../../../sync/engine-held.js";
import type { PendingRedo } from "./sync-controller.js";
import { dateOf, figuresOf, RESOLUTION, said } from "./sync-texts.js";

type Shown = Readonly<Record<string, unknown>>;

/**
 * One operation of what is held: its type, its asset, its date and its
 * figures — the quantity, the amount and the price per unit, each through
 * `Amount`, which the privacy mode masks (review of PR #97, correctness B2).
 * Never a raw line.
 */
const Operation = (props: { event: Shown | undefined }): JSX.Element => (
  <li>
    <Show when={props.event} fallback={<span>Una operación que no se puede leer</span>}>
      {(event) => {
        const figures = () => figuresOf(event());
        const names = () => nameIndex(store.snapshot()?.state);
        return (
          <>
            <span>{eventLabel(String(event().type))}</span>
            <Show when={event().asset_id}>
              {(asset) => <span> · {displayName(names(), asset())}</span>}
            </Show>
            <Show when={dateOf(event())}>{(date) => <span class="meta"> · {date()}</span>}</Show>
            <Show when={figures().quantity}>
              {(quantity) => (
                <>
                  {" · "}
                  <Amount quantity={quantity()} />
                </>
              )}
            </Show>
            <Show when={figures().unit}>
              {(unit) => (
                <>
                  {" a "}
                  <Amount value={unit()} unit />
                </>
              )}
            </Show>
            <Show when={figures().amount}>
              {(money) => (
                <>
                  {" · "}
                  <Amount value={money()} />
                </>
              )}
            </Show>
          </>
        );
      }}
    </Show>
  </li>
);

export const HeldList = (props: {
  readonly items: readonly HeldItem[];
  readonly busy: boolean;
  readonly onResolve: (item: HeldItem, resolution: string) => void;
}): JSX.Element => (
  <Show when={props.items.length > 0}>
    <h4 class="block-title">Retenidas</h4>
    <ul class="stack">
      <For each={props.items}>
        {(item) => (
          <li class="stack">
            <p>{said(item.reason.code, item.reason.details)}</p>
            <ul>
              <For each={item.events}>
                {(event) => <Operation event={event as Shown | undefined} />}
              </For>
            </ul>
            <div class="button-row">
              <For each={item.resolutions}>
                {(resolution) => (
                  <button
                    type="button"
                    class="secondary"
                    disabled={props.busy}
                    onClick={() => props.onResolve(item, resolution)}
                  >
                    {RESOLUTION[resolution]}
                  </button>
                )}
              </For>
            </div>
          </li>
        )}
      </For>
    </ul>
  </Show>
);

const PLANNED: Readonly<Record<string, string>> = {
  correct: "Se registrará la corrección, con su anulación:",
  reverse: "Se registrará la anulación:",
  record: "Se registrará de nuevo:",
};

/** The plan of a redo, with its ids already sealed: recorded only on a yes. */
export const RedoConfirm = (props: {
  readonly redo: PendingRedo;
  readonly busy: boolean;
  readonly onRecord: () => void;
  readonly onCancel: () => void;
}): JSX.Element => (
  <Notice
    severity="caution"
    title="¿Registrarla así, sobre tus datos actuales?"
    action={
      <div class="button-row">
        <button type="button" disabled={props.busy} onClick={() => props.onRecord()}>
          {props.redo.duplicate ? "Registrarla aunque parezca repetida" : "Registrar"}
        </button>
        <button
          type="button"
          class="secondary"
          disabled={props.busy}
          onClick={() => props.onCancel()}
        >
          Cancelar
        </button>
      </div>
    }
  >
    <p>{PLANNED[props.redo.plan.kind]}</p>
    <ul>
      <Operation event={props.redo.plan.draft as unknown as Shown} />
    </ul>
    <p class="meta">
      Si no la registras, lo retenido sigue donde estaba; para registrar otra cosa, descártalo.
    </p>
  </Notice>
);
