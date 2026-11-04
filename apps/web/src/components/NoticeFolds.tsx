// A list of notices by their titles (docs/design/system.md §5.6): what *Atención* shows. Each one
// opens where it is and says what happens, with what it enumerates one per line, and the way to
// where it is fixed goes inside. A native `<details>`: it folds without script.

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import type { WarningParts } from "../format/messages/warnings.js";
import { Disclosure } from "./Disclosure.jsx";
import { Icon } from "./Icon.jsx";
import { ICONS, type NoticeItem } from "./Notice.jsx";

export interface FoldedNotice extends NoticeItem {
  /** The name on the row: without it the row would be an icon and nothing else. */
  title: string;
  parts?: WarningParts | undefined;
}

const Told = (props: { item: FoldedNotice }): JSX.Element => (
  <Show when={props.item.parts} fallback={<p>{props.item.message}</p>}>
    {(parts) => (
      <>
        <p>{parts().lead}</p>
        <ul class="notice-lines">
          <For each={parts().lines}>
            {(line) => (
              <li>
                <span>{line.label}</span>
                <span class="value">{line.value}</span>
              </li>
            )}
          </For>
        </ul>
        <Show when={parts().tail}>{(tail) => <p>{tail()}</p>}</Show>
      </>
    )}
  </Show>
);

const Fold = (props: { item: FoldedNotice }): JSX.Element => (
  <li>
    <details class={`notice-fold is-${props.item.severity}`}>
      <summary>
        <Icon name={ICONS[props.item.severity]} class="notice-icon" />
        <span class="notice-title">{props.item.title}</span>
        <Show when={(props.item.count ?? 1) > 1}>
          <span class="tag">{props.item.count} iguales</span>
        </Show>
        <Icon name="chevdown" class="icon-sm chev" />
      </summary>
      <div class="notice-open">
        <Told item={props.item} />
        <Show when={props.item.action}>
          {(action) => (
            <A href={action().to} class="notice-action">
              {action().label}
              <Icon name="arrow" class="icon-sm" />
            </A>
          )}
        </Show>
      </div>
    </details>
  </li>
);

export const NoticeFolds = (props: {
  items: readonly FoldedNotice[];
  /** How many are shown before "Ver N avisos más"; the rest wait folded. */
  limit: number;
  label: string;
  /** A row kept for a notice that arrives after the first paint; it counts among those in sight. */
  reserve?: boolean | undefined;
}): JSX.Element => {
  const limit = (): number => props.limit - (props.reserve === true ? 1 : 0);
  const rest = (): readonly FoldedNotice[] => props.items.slice(limit());
  return (
    <>
      <ul class="notice-folds" aria-label={props.label}>
        <For each={props.items.slice(0, limit())}>{(item) => <Fold item={item} />}</For>
        <Show when={props.reserve === true}>
          <li class="notice-reserved" aria-hidden="true">
            <span class="skel w-90" />
          </li>
        </Show>
      </ul>
      <Show when={rest().length > 0}>
        <Disclosure
          class="more"
          label={rest().length === 1 ? "Ver 1 aviso más" : `Ver ${rest().length} avisos más`}
        >
          <ul class="notice-folds">
            <For each={rest()}>{(item) => <Fold item={item} />}</For>
          </ul>
        </Disclosure>
      </Show>
    </>
  );
};
