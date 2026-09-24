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
import { Icon } from "./Icon.jsx";

export interface PriceInfo {
  /** The price in its own currency; absent means the ledger has none. */
  unitValue?: Money | undefined;
  /** The date of the valuation it comes from. */
  priceDate?: string | undefined;
  /** Days from that valuation to the date asked. */
  ageDays?: number | undefined;
  /** Older than `stale_price_days`: shown, with its age, never hidden. */
  stale: boolean;
  /** «manual», or the source of an automatic close (feature 013). */
  priceOrigin?: string | undefined;
  /** An approximation through the reference ETF: marked wherever it is shown (P3). */
  approximate?: boolean | undefined;
  /** Why the quote has no value in euros; it is then never added up in euros. */
  eurMissing?: string | undefined;
}

/**
 * Just the figure, for a cell of a dense table; with `marked`, a stale one
 * carries the clock and its age in words for a screen reader and on hover —
 * the table is where the portfolio says it, not a notice under the cards.
 */
export const Price = (props: { price: PriceInfo; marked?: boolean }): JSX.Element => (
  <>
    <Amount
      value={props.price.unitValue}
      unit
      missingReason="no hay precio registrado a esa fecha"
    />
    <Show when={props.price.approximate === true}>
      <span class="stale-mark" title="Aproximado con el movimiento de su ETF de referencia">
        ≈<span class="sr-only"> aproximado</span>
      </span>
    </Show>
    <Show when={props.price.eurMissing}>
      {(reason) => (
        <span class="stale-mark" title={`Sin valor en euros: ${reason()}`}>
          <Icon name="caution" class="icon-sm" />
          <span class="sr-only">sin valor en euros</span>
        </span>
      )}
    </Show>
    <Show when={props.marked === true && props.price.stale}>
      <span
        class="stale-mark"
        title={`Precio caducado: ${countOf(props.price.ageDays ?? 0, "día", "días")}`}
      >
        <Icon name="clock" class="icon-sm" />
        <span class="sr-only">caducado</span>
      </span>
    </Show>
  </>
);

/**
 * The figure with where it comes from, for a card, where there is room to say
 * that a price is three weeks old. The age is **always** shown next to a stale
 * price: degrading visibly is the point (constitution V).
 *
 * With no price it says nothing: the figure of the same row already reads «sin
 * dato», and the card says which prices are missing. The row read «sin precio
 * sin dato», the same thing twice (second pass of the review of 2026-09-19).
 */
export const PriceDetail = (props: { price: PriceInfo; withAge?: boolean }): JSX.Element => (
  <Show when={props.price.unitValue !== undefined}>
    <span>
      <Price price={props.price} />
      <Show when={props.price.priceDate}>{(date) => <> · {formatDate(date())}</>}</Show>
      <Show when={props.withAge === true && props.price.ageDays !== undefined}>
        {" "}
        ({countOf(props.price.ageDays ?? 0, "día", "días")}
        {props.price.stale ? ", caducado" : ""})
      </Show>
      <Show when={props.withAge !== true && props.price.stale}> (caducado)</Show>
      <Show when={props.price.priceOrigin}>{(origin) => <> · {origin()}</>}</Show>
      <Show when={props.price.approximate === true}> · aproximado con su ETF de referencia</Show>
      <Show when={props.price.eurMissing}>
        {(reason) => <> · falta su valor en euros ({reason()})</>}
      </Show>
    </span>
  </Show>
);
