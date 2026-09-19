// The bottom of a form: what went wrong, why the button cannot be pressed yet,
// and the button — **together**, where the user is looking.
//
// The bar is sticky at the bottom of the screen. Its reason used to be a
// paragraph after the form, 1.000 px below the button it explained, and a
// refusal of the domain was a callout at the very top of the page, 667 px above
// it: pressing "Ver el efecto" with a bad amount did, visibly, nothing. Now a
// problem that is not about one field is painted right above the bar and
// scrolled into view, and the reason travels inside the bar.

import { createEffect, type JSX, Show } from "solid-js";
import { ErrorView, Notice } from "../../components/index.js";
import type { AppError } from "../../ledger/state.js";

/** Brings an element to the middle of the screen, where it cannot be missed. */
export const reveal = (element: Element | null | undefined): void => {
  element?.scrollIntoView?.({ block: "center" });
};

/**
 * Brings the first field with an error into view and moves the focus to it,
 * unfolding «Más datos» first when that is where it waits.
 */
export const revealField = (id: string): void => {
  const control = document.getElementById(id);
  const folded = control?.closest("details");
  if (folded instanceof HTMLDetailsElement) {
    folded.open = true;
  }
  reveal(control?.closest(".field") ?? control);
  control?.focus({ preventScroll: true });
};

interface FormActionsProps {
  /** A refusal that is about no field in particular, already in Spanish. */
  problem?: string | undefined;
  /** The whole error of a failed write, with the action that fixes it. */
  failure?: AppError | undefined;
  /** Heading of the failure; the default suits a write of the ledger. */
  failureTitle?: string | undefined;
  /** Why the button is disabled, or nothing when it is not. */
  blocked?: string | undefined;
  children: JSX.Element;
}

export const FormActions = (props: FormActionsProps): JSX.Element => {
  let problems: HTMLDivElement | undefined;
  // Every new problem is scrolled to: pressing a button and seeing nothing
  // change is the defect this component exists to end.
  createEffect(() => {
    if (props.problem !== undefined || props.failure !== undefined) {
      reveal(problems);
    }
  });
  return (
    <>
      <div ref={problems}>
        <Show when={props.problem}>
          {(problem) => (
            <Notice severity="danger" title="No se puede registrar así">
              {problem()}
            </Notice>
          )}
        </Show>
        <Show when={props.failure}>
          {(failure) => (
            <ErrorView
              error={failure()}
              title={props.failureTitle ?? "No se ha podido registrar"}
            />
          )}
        </Show>
      </div>
      <div class="actions-bar">
        <Show when={props.blocked}>{(reason) => <p class="reason">{reason()}</p>}</Show>
        {props.children}
      </div>
    </>
  );
};
