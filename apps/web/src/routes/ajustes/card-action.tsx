// What the cards of Ajustes that run an action share: one at a time (`busy`), what it said when it
// ended — information, a caution, or the error — and where that is painted. A failure is kept as
// the error, not as its text: the text follows the privacy mode while it is on screen.

import { createSignal, type JSX, Show } from "solid-js";
import { Notice } from "../../components/index.js";
import { toAppError } from "../../ledger/errors.js";
import type { AppError } from "../../ledger/state.js";

export type Said =
  | { readonly tone: "info" | "danger" | "caution"; readonly text: string }
  | { readonly tone: "danger"; readonly error: AppError };

export const saidText = (said: Said): string => ("error" in said ? said.error.message : said.text);

/**
 * Runs actions one at a time. What an action returns is what is said: a sentence is information,
 * a `Said` is said as it is, nothing says nothing, and a failure is said as the error. `settled`
 * runs when it ends, whatever the outcome.
 */
export const useCardAction = (
  settled: () => void,
): {
  busy: () => boolean;
  said: () => Said | undefined;
  run: (action: () => Promise<string | Said | undefined>) => Promise<void>;
} => {
  const [busy, setBusy] = createSignal(false);
  const [said, setSaid] = createSignal<Said>();
  const run = async (action: () => Promise<string | Said | undefined>): Promise<void> => {
    setBusy(true);
    setSaid(undefined);
    try {
      const outcome = await action();
      if (outcome !== undefined) {
        setSaid(typeof outcome === "string" ? { tone: "info", text: outcome } : outcome);
      }
    } catch (failure) {
      setSaid({ tone: "danger", error: toAppError(failure) });
    } finally {
      setBusy(false);
      settled();
    }
  };
  return { busy, said, run };
};

export const SaidNotice = (props: { said: Said | undefined }): JSX.Element => (
  <Show when={props.said}>
    {(message) => <Notice severity={message().tone}>{saidText(message())}</Notice>}
  </Show>
);
