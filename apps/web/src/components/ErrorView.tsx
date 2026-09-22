// **One place that paints an `AppError`**, with the three things an error owes
// the reader: what happened, what to do about it, and — folded away — the
// technical code, for the day the "what to do" is not enough.
//
// It is the notice of the design system in its danger gravity: the same
// component every other warning uses, so an error never looks like a
// different application. What cannot be computed **yet** is not an error and
// is painted by `Pending` instead.

import { A } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import { type AppError, messageWithLine } from "../ledger/state.js";
import { Disclosure } from "./Disclosure.jsx";
import { Notice } from "./Notice.jsx";

interface ErrorViewProps {
  error: AppError;
  /** Heading of the notice; the default suits a write that did not happen. */
  title?: string | undefined;
  /** An extra action of the screen, beside the one the error carries. */
  children?: JSX.Element | undefined;
}

export const ErrorView = (props: ErrorViewProps): JSX.Element => (
  <Notice
    severity="danger"
    title={props.title ?? "No se ha podido completar"}
    action={
      <Show when={props.error.action ?? props.children !== undefined}>
        <div class="button-row">
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
    <p>{messageWithLine(props.error)}</p>
    <Disclosure label="Detalle técnico">
      <p class="meta">
        <code>{props.error.code}</code>
        <Show when={props.error.line !== undefined}> · línea {props.error.line}</Show>
      </p>
    </Disclosure>
  </Notice>
);
