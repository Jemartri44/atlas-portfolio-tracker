// A sentence made of words and figures, the way a movement is told: the words
// as they are, each figure through `Amount`, so the privacy mode masks it inside
// the sentence and keeps its unit (D2).

import { For, type JSX, Match, Switch } from "solid-js";
import type { Part } from "../view-models/structured.js";
import { Amount } from "./Amount.jsx";

/**
 * A sentence made of text and figures; each figure goes through the gate.
 * `revealed`: which fields of a form were typed, so their figures are not
 * masked back at the user who just typed them.
 */
export const Parts = (props: {
  parts: readonly Part[];
  revealed?: (field: string) => boolean;
}): JSX.Element => {
  const shown = (field: string | undefined): boolean =>
    field !== undefined && (props.revealed?.(field) ?? false);
  return (
    <For each={props.parts}>
      {(part) => (
        <Switch>
          <Match when={"amount" in part && part}>
            {(figure) => (
              <Amount
                value={figure().amount}
                decimals={figure().decimals}
                revealed={shown(figure().field)}
              />
            )}
          </Match>
          <Match when={"quantity" in part && part}>
            {(figure) => (
              <Amount
                quantity={figure().quantity}
                of={figure().of}
                revealed={shown(figure().field)}
              />
            )}
          </Match>
          <Match when={"text" in part && part}>{(words) => words().text}</Match>
        </Switch>
      )}
    </For>
  );
};
