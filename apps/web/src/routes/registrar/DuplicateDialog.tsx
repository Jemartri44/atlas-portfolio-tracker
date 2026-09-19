// "Ya existe un evento igual": the confirmation the ledger asks for when a
// candidate carries a fingerprint another event already has (ADR-0012).
//
// Deciding whether a repetition is legitimate is the user's call — two identical
// contributions on the same day happen — so the domain **returns** the
// duplicates instead of refusing, and this is where the question gets asked.

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { Dialog } from "../../components/index.js";
import { eventReferences } from "../../format/events.js";
import { nameIndex } from "../../format/names.js";
import { store } from "../../ledger/state.js";

interface DuplicateDialogProps {
  duplicates: readonly string[] | undefined;
  onCancel: () => void;
  onConfirm: () => void;
  /** An extra line when repeating is worse than usual. */
  children?: JSX.Element | undefined;
}

/** The events of the ledger as it is loaded, to name a duplicate instead of printing its id. */
const references = () =>
  eventReferences(store.snapshot()?.events ?? [], nameIndex(store.snapshot()?.state));

export const DuplicateDialog = (props: DuplicateDialogProps): JSX.Element => (
  <Dialog
    open={props.duplicates !== undefined}
    title="Ya existe un movimiento igual"
    onClose={props.onCancel}
    actions={
      <>
        <button type="button" class="secondary" onClick={() => props.onCancel()}>
          Cancelar
        </button>
        <button type="button" disabled={store.writing()} onClick={() => props.onConfirm()}>
          Registrar de todas formas
        </button>
      </>
    }
  >
    <p>
      Tus datos ya tienen un movimiento con los mismos datos:{" "}
      <For each={props.duplicates ?? []}>
        {(id, index) => (
          <>
            <Show when={index() > 0}>, </Show>
            <A href={`/movimientos/${id}`}>{references()(id)}</A>
          </>
        )}
      </For>
      .
    </p>
    <Show
      when={props.children !== undefined}
      fallback={
        <p>Si es una repetición legítima —dos aportaciones idénticas el mismo día— confírmalo.</p>
      }
    >
      {props.children}
    </Show>
  </Dialog>
);
