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
//   4. An amount always carries its currency: there is no way to ask for a bare
//      figure. Tables used to drop it where the header "said EUR" — on a phone
//      the header is not there, and "coste 199,49" is not an amount.
//
// The three live in `format/money.ts` as `amountDisplay`, a pure function with
// its own tests: inside this JSX they were unreachable, and three mutations of
// them passed the whole suite (review of 2026-09-18).

import type { Money, Quantity } from "@atlas/domain";
import { createMemo, type JSX, Show } from "solid-js";
import {
  type AmountDisplay,
  amountDisplay,
  formatMoney,
  formatQuantity,
  formatUnitValue,
} from "../format/money.js";
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
        });
  };

  // Everything this component decides is decided by `amountDisplay`, in the
  // gated module: here there is only markup left (decision (d), prompt §3.4).
  const display = createMemo<AmountDisplay>(() =>
    amountDisplay({
      formatted: missing() ? undefined : shown(),
      privacy: privacy(),
      kind: isQuantity(props) ? "cantidad" : "importe",
      ...(props.coloured === true ? { sign: signOfValue(props) } : {}),
      ...(props.class === undefined ? {} : { extra: props.class }),
      ...(props.missingReason === undefined ? {} : { missingReason: props.missingReason }),
    }),
  );

  return (
    <span class={display().class} title={display().label === "" ? undefined : display().label}>
      <Show when={display().state === "masked"} fallback={display().text}>
        <span aria-hidden="true">{display().text}</span>
        <span class="sr-only">{display().label}</span>
      </Show>
    </span>
  );
};
