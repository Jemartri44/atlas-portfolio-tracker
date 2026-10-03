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

/** Where the notice of the tax side goes among the visible ones: at the end of them. */
const VISIBLE = 4;

export const AttentionBlock = (props: {
  items: readonly AttentionItem[];
  /**
   * The notice of the 720 and the 721 out of the season (feature 020, M2):
   * a row kept for it while the tax engine answers, then the notice or
   * nothing. It counts among the four in sight.
   */
  fiscal?: (() => "reserved" | NoticeItem | undefined) | undefined;
}): JSX.Element => {
  const fiscal = (): "reserved" | NoticeItem | undefined => props.fiscal?.();
  const notices = (): NoticeItem[] => {
    const all = props.items.map(noticeOf);
    const item = fiscal();
    if (item === undefined || item === "reserved") {
      return all;
    }
    const at = Math.min(VISIBLE - 1, all.length);
    return [...all.slice(0, at), item, ...all.slice(at)];
  };
  const count = (): number => notices().length;
  return (
    <section class="card span-7 summary-attention" aria-label="Lo que reclama atención">
      <div class="card-head">
        <h2>Atención</h2>
        <Show when={count() > 0}>
          <span class="aside">
            {count()} {count() === 1 ? "aviso" : "avisos"}
          </span>
        </Show>
      </div>

      <Show
        when={count() > 0 || fiscal() === "reserved"}
        fallback={
          <p class="calm">
            <Icon name="check" class="icon-sm" />
            Nada que hacer.
          </p>
        }
      >
        <NoticeList
          items={notices()}
          label="Avisos"
          limit={VISIBLE}
          reserve={fiscal() === "reserved"}
        />
      </Show>
    </section>
  );
};
