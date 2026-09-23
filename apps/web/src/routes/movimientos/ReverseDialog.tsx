// The question that annuls a movement, with what it moves said before it.
//
// It lives apart from the detail screen for the reason the line ceiling of the
// web exists: the screen already holds the whole reading of a movement and the
// two ways of rectifying it. What the dialog needs from it is state, so it
// takes it as props and decides nothing: **when** the warning is computed is
// the screen's business (before opening, never after), and this only paints it.

import type { ClosedYearImpact } from "@atlas/domain/fiscal";
import { type JSX, Show } from "solid-js";
import { ClosedYearNotice, Dialog, Field, Notice } from "../../components/index.js";
import { store } from "../../ledger/state.js";

export const ReverseDialog = (props: {
  open: boolean;
  /** Which filed returns the annulment reaches, already computed. */
  impacts: readonly ClosedYearImpact[];
  /** The impact could not be computed at all: said, never skipped in silence. */
  failed: boolean;
  reason: string;
  onReason: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}): JSX.Element => (
  <Dialog
    open={props.open}
    title="Anular el movimiento"
    onClose={() => props.onClose()}
    actions={
      <>
        <button type="button" class="secondary" onClick={() => props.onClose()}>
          Cancelar
        </button>
        <button
          type="button"
          class="danger solid"
          disabled={props.reason.trim() === "" || store.writing()}
          onClick={() => props.onConfirm()}
        >
          Anular
        </button>
      </>
    }
  >
    <p>
      No se borra nada: se registra una anulación que deja este movimiento sin efecto. El original
      sigue en tus datos, marcado como anulado.
    </p>
    <ClosedYearNotice impacts={props.impacts} />
    <Show when={props.failed}>
      <Notice
        severity="caution"
        title="No se ha podido comprobar si esto toca un ejercicio que ya declaraste"
      >
        No se han podido leer tus datos para calcularlo. Cierra esto y vuelve a intentarlo; si sigue
        fallando, mira la verificación antes de anular.
      </Notice>
    </Show>
    <Field
      id="reverse-reason"
      kind="text"
      label="Motivo"
      required
      hint="Queda registrado junto a la anulación."
      value={props.reason}
      onInput={(value) => props.onReason(value)}
    />
  </Dialog>
);
