// "¿Hay algo que hacer?" — every active warning, ordered by importance: a list of short titles, each
// one opening on what happens and the way to where it is fixed. When there is nothing, it says so calmly instead of
// inventing a card.
//
// The order and the grouping are decided in `view-models/attention.ts`; here
// they are only painted, with its four first groups in sight (docs/design/system.md §5.6).

import { type JSX, Show } from "solid-js";
import { type FoldedNotice, Icon, NoticeFolds, type Severity } from "../../components/index.js";
import type { AttentionItem, AttentionSeverity } from "../../view-models/index.js";

const SEVERITY: Record<AttentionSeverity, Severity> = {
  error: "danger",
  warning: "caution",
  info: "info",
};

const noticeOf = (item: AttentionItem): FoldedNotice => ({
  severity: SEVERITY[item.severity],
  title: item.title,
  message: item.message,
  parts: item.parts,
  action: item.action,
  count: item.count,
});

/** Where the notice of the tax side goes among the visible ones: at the end of them. */
const VISIBLE = 4;

export const AttentionBlock = (props: {
  items: readonly AttentionItem[];
  /**
   * The notice of the 720 and the 721 out of the season:
   * a row kept for it while the tax engine answers, then the notice or
   * nothing. It counts among the four in sight.
   */
  fiscal?: (() => "reserved" | FoldedNotice | undefined) | undefined;
  /** A scheduled task that stopped running: it arrives after the first paint, and in sight. */
  jobs?: (() => FoldedNotice | undefined) | undefined;
}): JSX.Element => {
  const fiscal = (): "reserved" | FoldedNotice | undefined => props.fiscal?.();
  const notices = (): FoldedNotice[] => {
    const all = props.items.map(noticeOf);
    const item = fiscal();
    const extra = [
      ...(item === undefined || item === "reserved" ? [] : [item]),
      ...(props.jobs?.() === undefined ? [] : [props.jobs?.() as FoldedNotice]),
    ];
    const at = Math.max(0, Math.min(VISIBLE - extra.length, all.length));
    return [...all.slice(0, at), ...extra, ...all.slice(at)];
  };
  const count = (): number => notices().length;
  return (
    <section class="card summary-attention" aria-label="Lo que reclama atención">
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
        <NoticeFolds
          items={notices()}
          label="Avisos"
          limit={VISIBLE}
          reserve={fiscal() === "reserved"}
        />
      </Show>
    </section>
  );
};
