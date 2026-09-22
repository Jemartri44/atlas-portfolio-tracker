// "¿Hay algo que hacer?" — every active warning, ordered by importance, each
// one saying what happens and leading to where it is fixed (FR-034). When there
// is nothing, it says so calmly instead of inventing a card.
//
// The order and the grouping are decided in `view-models/attention.ts`; here
// they are only painted, with the one notice of the whole application and its
// four first groups in sight (docs/design/system.md §5.6).

import { type JSX, Show } from "solid-js";
import { Icon, type NoticeItem, NoticeList, type Severity } from "../../components/index.js";
import type { AttentionItem, AttentionSeverity } from "../../view-models/index.js";

const SEVERITY: Record<AttentionSeverity, Severity> = {
  error: "danger",
  warning: "caution",
  info: "info",
};

export const noticeOf = (item: AttentionItem): NoticeItem => ({
  severity: SEVERITY[item.severity],
  message: item.message,
  action: item.action,
  count: item.count,
});

export const AttentionBlock = (props: { items: readonly AttentionItem[] }): JSX.Element => (
  <section class="card span-7" aria-label="Lo que reclama atención">
    <div class="card-head">
      <h2>Atención</h2>
      <Show when={props.items.length > 0}>
        <span class="aside">
          {props.items.length} {props.items.length === 1 ? "aviso" : "avisos"}
        </span>
      </Show>
    </div>

    <Show
      when={props.items.length > 0}
      fallback={
        <p class="calm">
          <Icon name="check" class="icon-sm" />
          Nada que hacer.
        </p>
      }
    >
      <NoticeList items={props.items.map(noticeOf)} label="Avisos" />
    </Show>
  </section>
);
