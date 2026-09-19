// Whether a media query matches, as a signal. The one place the shell reads the
// width in script: the **order** of the navigation has to follow what the eye
// sees (Registrar in the middle of the bottom bar, at the end of the top bar),
// and CSS can move a box but not the order the keyboard walks through it.

import { type Accessor, createSignal, onCleanup, onMount } from "solid-js";

export const mediaQuery = (query: string): Accessor<boolean> => {
  const list = typeof window.matchMedia === "function" ? window.matchMedia(query) : undefined;
  const [matches, setMatches] = createSignal(list?.matches ?? false);
  onMount(() => {
    if (list === undefined) {
      return;
    }
    const update = (): void => {
      setMatches(list.matches);
    };
    list.addEventListener("change", update);
    onCleanup(() => list.removeEventListener("change", update));
  });
  return matches;
};

/** Where the shell turns from the bottom bar into the top bar (styles/layout.css). */
export const TOP_BAR = "(min-width: 75rem)";

/** Where the content grid gains its columns (styles/layout.css). */
export const GRID = "(min-width: 64rem)";
