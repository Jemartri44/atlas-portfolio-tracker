// **One place that paints an `AppError`**, with the three things an error owes
// the reader: what happened, what to do about it, and — folded away — the
// technical code, for the day the "what to do" is not enough.
//
// It exists because the screens that write were throwing away the most useful
// half of the error. `toAppError` has carried an `action` since the 006 (the
// button that exports the ledger when the storage is full, the one that reopens
// it when the permission is gone), and only `RequireLedger` painted it: the
// configuration screen and the event form showed `failure.error.message` and
// dropped the button, so the user read what to do and had nowhere to press
// (inventory V6 of `specs/006-web-shell/questions.md`).

import { A } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import type { AppError } from "../ledger/state.js";
import { Callout } from "./Callout.jsx";

interface ErrorViewProps {
  error: AppError;
  /** Heading of the callout; the default suits a write that did not happen. */
  title?: string | undefined;
  /** An extra action of the screen, beside the one the error carries. */
  children?: JSX.Element | undefined;
}

/**
 * The code is shown, but folded: it is what makes a report actionable and what
 * makes a message unreadable, so it is one click away and never in the way.
 */
const Technical = (props: { error: AppError }): JSX.Element => (
  <details class="technical">
    <summary class="tiny">Detalle técnico</summary>
    <p class="tiny flush">
      <code>{props.error.code}</code>
      <Show when={props.error.line !== undefined}> · línea {props.error.line}</Show>
    </p>
  </details>
);

export const ErrorView = (props: ErrorViewProps): JSX.Element => (
  <Callout
    tone="error"
    title={props.title ?? "No se ha podido completar"}
    action={
      <Show when={props.error.action ?? props.children !== undefined}>
        <div class="row wrap">
          <Show when={props.error.action}>
            {(action) => (
              <A href={action().to} role="button">
                {action().label}
              </A>
            )}
          </Show>
          {props.children}
        </div>
      </Show>
    }
  >
    {props.error.message}
    <Technical error={props.error} />
  </Callout>
);
