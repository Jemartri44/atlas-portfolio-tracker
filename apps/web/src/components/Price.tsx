// The unit price of an asset, in the two shapes the screens need it.
//
// It exists because **a price is an amount**: `cantidad × precio` is the figure
// the privacy mode is there to hide, so a price goes through `Amount` exactly
// like a balance does. Núcleo and Cubo both paint one, and before this they each
// interpolated `{row.unitValue} {row.currency}` into the markup — the same forty
// lines twice, walking past the mask in both.
//
// Having it once is not only less code: it is the reason there is one place to
// get this right instead of two places to get it wrong.

import type { Money } from "@atlas/domain";
import { type JSX, Show } from "solid-js";
import { formatDate } from "../format/date.js";
import { countOf } from "../format/number.js";
import { Amount } from "./Amount.jsx";

export interface PriceInfo {
  /** The price in its own currency; absent means the ledger has none. */
  unitValue?: Money | undefined;
  /** The date of the valuation it comes from. */
  priceDate?: string | undefined;
  /** Days from that valuation to the date asked. */
  ageDays?: number | undefined;
  /** Older than `stale_price_days`: shown, with its age, never hidden. */
  stale: boolean;
}

/** Just the figure, for a cell of a dense table. */
export const Price = (props: { price: PriceInfo }): JSX.Element => (
  <Amount value={props.price.unitValue} unit missingReason="no hay precio registrado a esa fecha" />
);

/**
 * The figure with where it comes from, for a card, where there is room to say
 * that a price is three weeks old. The age is **always** shown next to a stale
 * price: degrading visibly is the point (constitution V).
 */
export const PriceDetail = (props: { price: PriceInfo; withAge?: boolean }): JSX.Element => (
  <Show
    when={props.price.unitValue !== undefined}
    fallback={<span class="nodata">sin precio</span>}
  >
    <span>
      <Price price={props.price} />
      <Show when={props.price.priceDate}>{(date) => <> · {formatDate(date())}</>}</Show>
      <Show when={props.withAge === true && props.price.ageDays !== undefined}>
        {" "}
        ({countOf(props.price.ageDays ?? 0, "día", "días")}
        {props.price.stale ? ", caducado" : ""})
      </Show>
      <Show when={props.withAge !== true && props.price.stale}> (caducado)</Show>
    </span>
  </Show>
);
