// **The** notice (docs/design/system.md §5.6; brief §13: "un único componente
// de aviso"). It used to be drawn three ways — a bordered card in Atención, a
// coloured callout in the forms, a plain paragraph in Cubo — and now it is one
// component with one look, in a list or on its own:
//
// - its gravity is an icon with its own **shape** (triangle, octagon, circle),
//   never a colour alone;
// - only a danger notice has a background: red is for real trouble;
// - it says what happens and leads to where it is fixed.

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { Disclosure } from "./Disclosure.jsx";
import { Icon, type IconName } from "./Icon.jsx";

export type Severity = "danger" | "caution" | "info";

const ICONS: Record<Severity, IconName> = {
  danger: "danger",
  caution: "caution",
  info: "info",
};

interface NoticeProps {
  severity: Severity;
  /** A short heading, when the sentence needs one. */
  title?: string | undefined;
  children: JSX.Element;
  /** What to do about it: a button or a link, under the sentence. */
  action?: JSX.Element | undefined;
}

/** A notice on its own, boxed, inside a screen or a form. */
export const Notice = (props: NoticeProps): JSX.Element => (
  <div
    class={`notice is-boxed is-${props.severity}`}
    role={props.severity === "danger" ? "alert" : "status"}
  >
    <Icon name={ICONS[props.severity]} class="notice-icon" />
    <div class="notice-body">
      <Show when={props.title !== undefined}>
        <p class="notice-title">{props.title}</p>
      </Show>
      <div class="notice-text">{props.children}</div>
      <Show when={props.action !== undefined}>
        <div class="notice-actions">{props.action}</div>
      </Show>
    </div>
  </div>
);

export interface NoticeItem {
  severity: Severity;
  message: JSX.Element;
  /**
   * Where it is fixed; the whole notice is the link. Absent when that place is
   * the screen already open: a link to itself fixes nothing.
   */
  action?: { label: string; to: string } | undefined;
  /** How many warnings of the same kind it stands for. */
  count?: number | undefined;
}

const Body = (props: { item: NoticeItem }): JSX.Element => (
  <>
    <Icon name={ICONS[props.item.severity]} class="notice-icon" />
    <span class="notice-body">
      <span class="notice-text">
        {props.item.message}
        <Show when={(props.item.count ?? 1) > 1}>
          {" "}
          <span class="tag">{props.item.count} iguales</span>
        </Show>
      </span>
      <Show when={props.item.action}>
        {(action) => (
          <span class="notice-action">
            {action().label}
            <Icon name="arrow" class="icon-sm" />
          </span>
        )}
      </Show>
    </span>
  </>
);

const Item = (props: { item: NoticeItem }): JSX.Element => (
  <li>
    <Show
      when={props.item.action}
      fallback={
        <div class={`notice is-${props.item.severity}`}>
          <Body item={props.item} />
        </div>
      }
    >
      {(action) => (
        <A href={action().to} class={`notice is-${props.item.severity}`}>
          <Body item={props.item} />
        </A>
      )}
    </Show>
  </li>
);

interface NoticeListProps {
  items: readonly NoticeItem[];
  /** How many are shown before "Ver N avisos más"; the rest wait folded. */
  limit?: number | undefined;
  label: string;
}

/**
 * A list of notices, the most important first (the caller orders them). Only
 * the first few are shown: with two years of use the list reached 27, and the
 * summary measured six phone screens. The rest are one tap away.
 */
export const NoticeList = (props: NoticeListProps): JSX.Element => {
  const limit = (): number => props.limit ?? 4;
  const rest = (): readonly NoticeItem[] => props.items.slice(limit());
  return (
    <>
      <ul class="notices" aria-label={props.label}>
        <For each={props.items.slice(0, limit())}>{(item) => <Item item={item} />}</For>
      </ul>
      <Show when={rest().length > 0}>
        <Disclosure
          class="more"
          label={rest().length === 1 ? "Ver 1 aviso más" : `Ver ${rest().length} avisos más`}
        >
          <ul class="notices">
            <For each={rest()}>{(item) => <Item item={item} />}</For>
          </ul>
        </Disclosure>
      </Show>
    </>
  );
};
