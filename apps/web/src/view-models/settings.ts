// The arithmetic of the configuration screen, out of the screen.
//
// The target weights are a **business decimal**, so they are added with the
// decimal of the domain and never with `Number.parseFloat`, which is precisely
// the door ADR-0005 closes (trap 3 of `CLAUDE.md`). And the rule "do they add
// up to 100?" lives here, where a test reaches it, instead of inside a `.tsx`
// where nothing could (decision (c)).

import { Decimal, isDecimalString } from "@atlas/domain";

/** What the weights of the core have to add up to (rule 3 of the plan). */
const HUNDRED = Decimal.parse("100");

export interface WeightTotal {
  /** The exact sum of what is written, as a decimal string; the screen rounds it. */
  total: string;
  /** Whether it adds up to 100 to the cent, which is what the screen states. */
  addsUp: boolean;
}

/**
 * Adds the weights as they are being typed, accepting the comma of a Spanish
 * keyboard.
 *
 * An empty field is **not** a zero: it is a weight that has not been declared
 * yet, so it stays out of the sum. Anything that is not a decimal — a
 * half-typed number — stays out too **and** makes the total not add up: a sum
 * that ignores what it cannot read must never claim to be 100.
 */
export const targetWeightTotal = (weights: Record<string, string>): WeightTotal => {
  let total = Decimal.ZERO;
  let readable = true;
  for (const raw of Object.values(weights)) {
    const text = raw.trim().replace(",", ".");
    if (text === "") {
      continue;
    }
    if (!isDecimalString(text)) {
      readable = false;
      continue;
    }
    total = total.add(Decimal.parse(text));
  }
  // Compared on the rounded value, so the verdict and the printed figure never
  // contradict each other.
  return { total: total.toString(), addsUp: readable && total.round(2).eq(HUNDRED) };
};
