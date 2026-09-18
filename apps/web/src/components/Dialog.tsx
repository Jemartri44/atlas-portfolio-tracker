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
