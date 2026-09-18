// The native `<dialog>`: focus trap and `Esc` come for free, which is exactly
// why ADR-0017 starts without a component library. No `use:` directive
// anywhere (ADR-0017): the element is opened and closed from a `createEffect`
// over the `open` signal, in this one file.

import { createEffect, type JSX, Show } from "solid-js";

interface DialogProps {
  open: boolean;
  title: string;
  /**
   * Called on Esc and on the cancel button. Clicking the backdrop does **not**
   * close it: half of these dialogs sit on top of a form that took a while to
   * fill in, and losing it to a stray tap is worse than one extra click.
   */
  onClose: () => void;
  children: JSX.Element;
  /** Buttons; the confirming one goes last, as the platform expects. */
  actions: JSX.Element;
}

export const Dialog = (props: DialogProps): JSX.Element => {
  let element: HTMLDialogElement | undefined;

  createEffect(() => {
    const dialog = element;
    if (dialog === undefined) {
      return;
    }
    if (props.open && !dialog.open) {
      dialog.showModal();
    } else if (!props.open && dialog.open) {
      dialog.close();
    }
  });

  return (
    <dialog
      ref={element}
      aria-label={props.title}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
    >
      <Show when={props.open}>
        <article>
          <header>
            <h2>{props.title}</h2>
          </header>
          {props.children}
          <div class="dialog-actions">{props.actions}</div>
        </article>
      </Show>
    </dialog>
  );
};

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What the confirming button says; the cancel one always says "Cancelar". */
  confirm: string;
  onConfirm: () => void;
  onClose: () => void;
  children: JSX.Element;
}

/**
 * The shape every "this is expensive, are you sure?" takes: one explanation,
 * cancel, and the action spelled out. Three of them were written by hand in the
 * configuration screen, each with its own pair of buttons (review of
 * 2026-09-18); a fourth would have been a fourth copy.
 */
export const ConfirmDialog = (props: ConfirmDialogProps): JSX.Element => (
  <Dialog
    open={props.open}
    title={props.title}
    onClose={props.onClose}
    actions={
      <>
        <button type="button" class="secondary" onClick={() => props.onClose()}>
          Cancelar
        </button>
        <button type="button" onClick={() => props.onConfirm()}>
          {props.confirm}
        </button>
      </>
    }
  >
    {props.children}
  </Dialog>
);
