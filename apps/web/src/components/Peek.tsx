// A list seen up to a point (docs/design/system.md §5.11): the first rows, and a button that opens
// the rest in place. For lists of like things; an explanation goes in a `Disclosure`. It cuts at a
// whole row, so nothing is half read.

import { createSignal, For, type JSX, Show } from "solid-js";

export const Peek = <T,>(props: {
  items: readonly T[];
  limit: number;
  /** The label of the button, with how many there are. */
  more: (total: number) => string;
  children: (item: T) => JSX.Element;
}): JSX.Element => {
  const [open, setOpen] = createSignal(false);
  const shown = (): readonly T[] => (open() ? props.items : props.items.slice(0, props.limit));
  return (
    <>
      <For each={shown()}>{(item) => props.children(item)}</For>
      <Show when={props.items.length > props.limit}>
        <button
          type="button"
          class="peek-more"
          aria-expanded={open()}
          onClick={() => setOpen(!open())}
        >
          {open() ? "Ver menos" : props.more(props.items.length)}
        </button>
      </Show>
    </>
  );
};
