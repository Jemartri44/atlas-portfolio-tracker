// A card that, on a phone, waits folded under its title with one line that says what is inside
// (the figure, or the warning: a notice or a missing datum is never hidden by the fold). From the
// grid breakpoint it is the plain `Section`, unchanged. Native `<details>`: it folds without script.

import { createUniqueId, type JSX, Show } from "solid-js";
import "./fold-section.css";
import { GRID, mediaQuery } from "../shell/media.js";
import { Icon } from "./Icon.jsx";
import { Section } from "./Section.jsx";

interface FoldSectionProps {
  title: string;
  /** The line under the title while folded: the main figure or the warning. */
  summary: JSX.Element;
  aside?: JSX.Element | undefined;
  class?: string | undefined;
  children: JSX.Element;
}

export const FoldSection = (props: FoldSectionProps): JSX.Element => {
  const wide = mediaQuery(GRID);
  const id = createUniqueId();
  return (
    <Show
      when={!wide()}
      fallback={
        <Section title={props.title} aside={props.aside} class={props.class}>
          {props.children}
        </Section>
      }
    >
      <section class={`card fold-card ${props.class ?? ""}`.trimEnd()} aria-labelledby={`h-${id}`}>
        {/* The wrapper keeps the card's own rules for a disclosure (a row edge to edge) off it. */}
        <div>
          <details class="disclosure">
            <summary>
              <h2 id={`h-${id}`}>{props.title}</h2>
              <span class="fold-summary">{props.summary}</span>
              <Icon name="chevdown" class="icon-sm chev" />
            </summary>
            <div class="disclosure-body">
              <Show when={props.aside !== undefined}>
                <div class="aside">{props.aside}</div>
              </Show>
              {props.children}
            </div>
          </details>
        </div>
      </section>
    </Show>
  );
};
