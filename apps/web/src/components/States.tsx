// The states that are not a list of data (docs/design/system.md §5.7–5.8,
// §5.16): what cannot be computed **yet**, what is empty, and what is loading.
// None of them is ever a blank page (FR-019), and none of them wears the tone
// of an error: a price that has not been recorded is the normal state of a
// ledger priced by hand.

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { Icon, type IconName } from "./Icon.jsx";

interface PendingProps {
  /** One sentence: what is missing to be able to compute it. */
  children: JSX.Element;
  /** The one action that fixes it. */
  action?: { label: string; to: string } | undefined;
}

/** "No se puede calcular todavía": a well, a clock, a sentence and one action. */
export const Pending = (props: PendingProps): JSX.Element => (
  <div class="pending" role="status">
    <Icon name="clock" />
    <div class="pending-body">
      <p class="pending-text">{props.children}</p>
      <Show when={props.action}>
        {(action) => (
          <A href={action().to} role="button" class="quiet">
            {action().label}
            <Icon name="arrow" class="icon-sm" />
          </A>
        )}
      </Show>
    </div>
  </div>
);

interface EmptyStateProps {
  /** What is empty, in one line. */
  what: string;
  /** One sentence about it, and nothing else. */
  why?: JSX.Element | undefined;
  glyph?: IconName | undefined;
  /** The next step: a button or a link. */
  children?: JSX.Element | undefined;
}

/** One message and the next step, never a scaffold of empty blocks. */
export const EmptyState = (props: EmptyStateProps): JSX.Element => (
  <div class="empty">
    <span class="glyph" aria-hidden="true">
      <Icon name={props.glyph ?? "info"} />
    </span>
    <p class="what">{props.what}</p>
    <Show when={props.why !== undefined}>
      <p class="why">{props.why}</p>
    </Show>
    <Show when={props.children !== undefined}>
      <div class="empty-actions">{props.children}</div>
    </Show>
  </div>
);

interface SkeletonProps {
  /** Lines of text coming, sized like the content. */
  lines?: number | undefined;
  /** The first line is a figure. */
  tall?: boolean | undefined;
}

/** The shape of what is coming, without any shimmer: nothing moves on screen. */
export const Skeleton = (props: SkeletonProps): JSX.Element => (
  <div class="card" role="status" aria-busy="true" aria-label="Cargando">
    <div class="skel-lines" aria-hidden="true">
      <Show when={props.tall === true}>
        <span class="skel is-figure" />
      </Show>
      <For each={Array.from({ length: props.lines ?? 3 }, (_, index) => index)}>
        {(index) => (
          <span
            class={index % 4 === 3 ? "skel w-50" : index % 2 === 1 ? "skel w-70" : "skel w-90"}
          />
        )}
      </For>
    </div>
  </div>
);
