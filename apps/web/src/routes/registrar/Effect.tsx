// The effect of a record, before it is written (FR-044): what changes and the
// button that writes it. On a phone it replaces the form and offers the way
// back; from 1024px it sits beside the form, and while there is nothing to show
// yet it says where the effect will appear (docs/design/system.md §7.4).

import type { EventPreview } from "@atlas/domain";
import { type JSX, Show } from "solid-js";
import { Pending } from "../../components/index.js";
import type { NameIndex } from "../../format/names.js";
import { type AppError, store } from "../../ledger/state.js";
import { FormActions } from "./FormActions.jsx";
import { Preview } from "./Preview.jsx";

interface EffectProps {
  /** The effect to show; absent while the form has not been sent to see it. */
  preview: EventPreview | undefined;
  names: NameIndex;
  wide: boolean;
  problem: string | undefined;
  failure: AppError | undefined;
  confirmLabel: string;
  onBack: () => void;
  onConfirm: () => void;
}

export const Effect = (props: EffectProps): JSX.Element => (
  <Show
    when={props.preview}
    fallback={
      <Show when={props.wide}>
        <aside class="effect" aria-label="El efecto">
          <Pending>
            El efecto aparece aquí al pulsar «Ver el efecto»: nada se escribe hasta que lo
            confirmes.
          </Pending>
        </aside>
      </Show>
    }
  >
    {(preview) => (
      <section class="effect" aria-label="El efecto">
        <Preview preview={preview()} names={props.names} />
        <FormActions problem={props.problem} failure={props.failure}>
          <Show when={!props.wide}>
            <button type="button" class="secondary" onClick={() => props.onBack()}>
              Volver a los datos
            </button>
          </Show>
          <button type="button" disabled={store.writing()} onClick={() => props.onConfirm()}>
            {props.confirmLabel}
          </button>
        </FormActions>
      </section>
    )}
  </Show>
);
