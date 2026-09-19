// A state in a word, plus an icon when one helps (docs/design/system.md §5.5).
// The colour is never the only carrier: "parcial", "anulado", "fuera de
// umbral" are written out. "Parcial" is neutral on purpose — a missing price
// is the normal state of a ledger priced by hand, not an alarm.

import { type JSX, Show } from "solid-js";
import { Icon, type IconName } from "./Icon.jsx";

export type TagTone = "neutral" | "accent" | "caution" | "danger" | "done";

interface TagProps {
  children: JSX.Element;
  tone?: TagTone | undefined;
  icon?: IconName | undefined;
  title?: string | undefined;
}

export const Tag = (props: TagProps): JSX.Element => (
  <span
    class={`tag${props.tone === undefined || props.tone === "neutral" ? "" : ` is-${props.tone}`}`}
    title={props.title}
  >
    <Show when={props.icon}>{(name) => <Icon name={name()} />}</Show>
    {props.children}
  </span>
);
