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
//   3. The mask is always the same four dots in a box of fixed width, so it
//      measures the same whatever it hides; its **unit** stays — "•••• €",
//      "•••• part." — because it says what kind of figure is hidden and never
//      how big it is (D2 of docs/design/system.md).
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
  currencyUnit,
  formatMoneyNumber,
  formatQuantity,
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
  /**
   * The user typed this figure on this very screen: masking it back at them
   * hides nothing from anyone looking over their shoulder that the field did
   * not already show. Only a form sets it, and only for what was typed.
   */
  revealed?: boolean | undefined;
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
  /** What the units are, when it is known: "part.", "acc.", "uds.". */
  of?: string | undefined;
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
    return formatMoneyNumber(money, {
      decimals: props.decimals ?? (props.unit === true ? 4 : 2),
      ...(props.signed === undefined ? {} : { signed: props.signed }),
    });
  };

  /** The unit written after the figure, which the mask keeps. */
  const unit = (): string | undefined => {
    if (isQuantity(props)) {
      return props.of;
    }
    return props.value === undefined ? undefined : currencyUnit(props.value.currency);
  };

  // Everything this component decides is decided by `amountDisplay`, in the
  // gated module: here there is only markup left (decision (d), prompt §3.4).
  const display = createMemo<AmountDisplay>(() =>
    amountDisplay({
      formatted: missing() ? undefined : shown(),
      unit: unit(),
      privacy: privacy() && props.revealed !== true,
      kind: isQuantity(props) ? "cantidad" : "importe",
      ...(props.coloured === true ? { sign: signOfValue(props) } : {}),
      ...(props.class === undefined ? {} : { extra: props.class }),
      ...(props.missingReason === undefined ? {} : { missingReason: props.missingReason }),
    }),
  );

  return (
    <span class={display().class} title={display().label === "" ? undefined : display().label}>
      <Show
        when={display().state === "masked"}
        fallback={
          <>
            {display().text}
            <Show when={display().unit !== ""}>
              <span class="unit">{`\u00a0${display().unit}`}</span>
            </Show>
          </>
        }
      >
        <span class="dots" aria-hidden="true">
          {display().text}
        </span>
        <Show when={display().unit !== ""}>
          <span class="unit" aria-hidden="true">
            {display().unit}
          </span>
        </Show>
        <span class="sr-only">{display().label}</span>
      </Show>
    </span>
  );
};
