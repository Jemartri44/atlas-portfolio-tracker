// **The only place an amount or a quantity is painted.** Everything sensitive
// goes through here: `format/money.ts` may not be imported anywhere else, and
// the architecture test fails if it is (decision (d), prompt §3.4).
//
// Q6: the mask covers amounts **and** quantities. Percentages, weights and
// deviations stay visible and are painted by `Figure`, which is not gated.
//
// Three rules it enforces on its own, so no screen can forget them:
//   1. `undefined` is "sin dato", never a zero (constitution V).
//   2. The sign and a label carry the meaning too, never colour alone.
//   3. The mask has a fixed width, so turning privacy on does not reflow the page.

import type { Money, Quantity } from "@atlas/domain";
import { type JSX, Show } from "solid-js";
import { formatMoney, formatQuantity, formatUnitValue, MASK, NO_DATA } from "../format/money.js";
import { usePrivacy } from "../ledger/state.js";

interface CommonProps {
  /** Extra classes for the caller's layout; the semantics stay here. */
  class?: string | undefined;
  /** Show the sign even when positive: a gain reads as a gain without colour. */
  signed?: boolean | undefined;
  /** Colour and label by sign. Off by default: most amounts are not results. */
  coloured?: boolean | undefined;
  /** What is missing, when there is no data: it goes in the title. */
  missingReason?: string | undefined;
}

interface MoneyProps extends CommonProps {
  value: Money | undefined;
  /** Decimals; two by default (the cent). */
  decimals?: number | undefined;
  /** Hide the currency (a column that already says EUR in its header). */
  currency?: boolean | undefined;
  /** A unit value, four decimals. */
  unit?: boolean | undefined;
  quantity?: never;
}

interface QuantityProps extends CommonProps {
  quantity: Quantity | undefined;
  value?: never;
  decimals?: number | undefined;
}

export type AmountProps = MoneyProps | QuantityProps;

const isQuantity = (props: AmountProps): props is QuantityProps => "quantity" in props;

/** Sign of what is being shown, for the class and the accessible label. */
const signOfValue = (props: AmountProps): "positive" | "negative" | "zero" => {
  const raw = isQuantity(props) ? props.quantity?.toString() : props.value?.amount.toString();
  if (raw === undefined || /^-?0(\.0*)?$/.test(raw)) {
    return "zero";
  }
  return raw.startsWith("-") ? "negative" : "positive";
};

export const Amount = (props: AmountProps): JSX.Element => {
  const privacy = usePrivacy();
  const missing = (): boolean =>
    isQuantity(props) ? props.quantity === undefined : props.value === undefined;

  const shown = (): string => {
    if (isQuantity(props)) {
      return formatQuantity(props.quantity as Quantity, props.decimals);
    }
    const money = props.value as Money;
    return props.unit === true
      ? formatUnitValue(money, props.decimals)
      : formatMoney(money, {
          ...(props.decimals === undefined ? {} : { decimals: props.decimals }),
          ...(props.signed === undefined ? {} : { signed: props.signed }),
          ...(props.currency === undefined ? {} : { currency: props.currency }),
        });
  };

  const sign = (): string => (props.coloured === true ? signOfValue(props) : "");
  const label = (): string => {
    const kind = isQuantity(props) ? "cantidad" : "importe";
    if (missing()) {
      return `${kind} sin dato${props.missingReason === undefined ? "" : `: ${props.missingReason}`}`;
    }
    return privacy() ? `${kind} oculto` : "";
  };

  return (
    <Show
      when={!missing()}
      fallback={
        <span class={`num nodata ${props.class ?? ""}`} title={label()}>
          {NO_DATA}
        </span>
      }
    >
      <Show
        when={!privacy()}
        fallback={
          <span class={`num mask ${props.class ?? ""}`} title={label()}>
            <span aria-hidden="true">{MASK}</span>
            <span class="sr-only">{label()}</span>
          </span>
        }
      >
        <span class={`num ${sign()} ${props.class ?? ""}`.trimEnd()}>{shown()}</span>
      </Show>
    </Show>
  );
};
