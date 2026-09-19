// One movement as a row in two lines (docs/design/system.md §5.3): the glyph of
// its type, what it is about with the type and the account under it, and on the
// right its figure with the date under it. The whole row leads to the detail.
//
// It is the row of the summary's recent movements and of the movements list on
// a phone: one drawing of a movement, wherever it appears.

import { A } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import { Amount, Icon, type IconName, Tag } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import type { MovementRow } from "../../view-models/index.js";

/** The glyph of each type; a type missing here gets the generic list glyph. */
const GLYPHS: Record<string, IconName> = {
  buy: "buy",
  sell: "sell",
  dividend: "dividend",
  interest: "dividend",
  valuation: "valuation",
  cash_deposit: "cash",
  cash_withdrawal: "cash",
  standalone_fee: "cash",
  fx_exchange: "globe",
  transfer: "transfer",
  transfer_requested: "transfer",
  transfer_request_updated: "transfer",
  swap: "transfer",
  order_placed: "order",
  order_updated: "order",
  corporate_action: "corporate",
  thesis_opened: "flask",
  thesis_closed: "flask",
  account_created: "catalogue",
  account_updated: "catalogue",
  asset_created: "catalogue",
  asset_updated: "catalogue",
  settings_changed: "settings",
  reversal: "reversed",
};

export const movementGlyph = (type: string): IconName => GLYPHS[type] ?? "movements";

/** The figure of a movement: its amount, or its quantity when it has no amount. */
export const MovementFigure = (props: { row: MovementRow }): JSX.Element => (
  <Show
    when={props.row.amount !== undefined}
    fallback={
      <Show when={props.row.quantity !== undefined} fallback={<span class="meta">—</span>}>
        <Amount quantity={props.row.quantity} of={props.row.units} />
      </Show>
    }
  >
    <Amount value={props.row.amount} />
  </Show>
);

/** What is not the normal state, and only then: "anulado", "inválido". */
export const MovementState = (props: { row: MovementRow }): JSX.Element => (
  <>
    <Show when={props.row.status !== "current"}>
      <Tag icon={props.row.status === "reversed" ? "reversed" : undefined}>
        {props.row.statusLabel}
      </Tag>
    </Show>
    <Show when={props.row.invalidReason !== undefined}>
      <Tag tone="danger" title={props.row.invalidReason}>
        inválido
      </Tag>
    </Show>
  </>
);

export const MovementLine = (props: { row: MovementRow }): JSX.Element => (
  <A
    href={`/movimientos/${props.row.id}`}
    class={props.row.status === "reversed" ? "row has-lead is-reversed" : "row has-lead"}
  >
    <span class="lead" aria-hidden="true">
      <Icon name={movementGlyph(props.row.type)} />
    </span>
    <span class="main">
      <span class="title truncate" title={props.row.subject}>
        {props.row.subject}
      </span>
      <span class="sub">
        <Show when={props.row.context !== ""}>
          <span class="truncate" title={props.row.context}>
            {props.row.context}
          </span>
        </Show>
        <MovementState row={props.row} />
      </span>
    </span>
    <span class="figs">
      <span class="fig">
        <MovementFigure row={props.row} />
      </span>
      <span class="fig-sub num">{formatDate(props.row.date)}</span>
    </span>
  </A>
);
