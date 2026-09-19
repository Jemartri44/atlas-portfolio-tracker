// A callout, a badge, an empty state and a loading skeleton: the four pieces
// every screen needs so that no state is ever a blank page (FR-019).

import { type JSX, Show } from "solid-js";

export type Tone = "error" | "warning" | "info";

interface CalloutProps {
  tone: Tone;
  title?: string | undefined;
  children: JSX.Element;
  /** A single action, when there is somewhere to go. */
  action?: JSX.Element | undefined;
}

export const Callout = (props: CalloutProps): JSX.Element => (
  <div class={`callout is-${props.tone}`} role={props.tone === "error" ? "alert" : "status"}>
    <Show when={props.title !== undefined}>
      <span class="title">{props.title}</span>
    </Show>
    <div>{props.children}</div>
    <Show when={props.action !== undefined}>
      <div>{props.action}</div>
    </Show>
  </div>
);

interface EmptyStateProps {
  /** What is empty, in one line. */
  what: string;
  /** What to do next, and the link that does it. */
  children?: JSX.Element | undefined;
}

export const EmptyState = (props: EmptyStateProps): JSX.Element => (
  <div class="empty">
    <span class="what">{props.what}</span>
    <Show when={props.children !== undefined}>{props.children}</Show>
  </div>
);

interface SkeletonProps {
  /** Number of lines, sized like the content that is coming. */
  lines?: number | undefined;
  tall?: boolean | undefined;
}

export const Skeleton = (props: SkeletonProps): JSX.Element => (
  <div class="stack" aria-hidden="true">
    {Array.from({ length: props.lines ?? 3 }, (_, index) => (
      <div class={`skeleton${props.tall === true && index === 0 ? " tall" : ""}`} />
    ))}
  </div>
);
