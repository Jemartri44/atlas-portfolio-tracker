// Builds the synthetic ledger event by event, the way `recordEvent` would: the
// clock moves to the business date, `completeDraft` fills envelope and
// fingerprint (validating the shape), and the ledger so far can be projected
// to read positions — picos, "sell everything", year-end quantities — from the
// same code that will interpret the file.

import type { CivilDate } from "../dates/civil-date.js";
import { createUlidGenerator, type UlidGenerator } from "../ids/ulid.js";
import { Decimal } from "../money/decimal.js";
import type { Money } from "../money/money.js";
import type { Quantity } from "../money/quantity.js";
import { Ratio } from "../money/ratio.js";
import type { Clock } from "../ports/clock.js";
import type { RandomSource } from "../ports/random.js";
import { positionOf } from "../projections/positions.js";
import { projectLedger } from "../projections/project-ledger.js";
import { cashKey, type LedgerState } from "../projections/state.js";
import type { AccountId, AssetId, Draft, LedgerEvent, SupportedEvent } from "../schema/events.js";
import { completeDraft } from "../usecases/record-event.js";
import { SyntheticClock } from "./clock.js";
import type { Prng } from "./random.js";

export interface Pico {
  account_id: AccountId;
  /** Fractional part left in the account after scaling, as a decimal string. */
  quantity: string;
}

const integerPart = (value: Decimal): Decimal =>
  Decimal.parse(value.toString().split(".")[0] as string);

export class ScenarioBuilder {
  readonly events: LedgerEvent[] = [];
  /** Warning codes the scenario provokes on purpose (Q1: e.g. the ETC held in two accounts). */
  readonly expectedWarnings = new Set<string>();
  private readonly deps: { clock: Clock; random: RandomSource };
  private readonly ids: UlidGenerator;
  private cached: LedgerState | undefined;

  constructor(
    readonly rng: Prng,
    private readonly clock = new SyntheticClock(),
  ) {
    this.deps = { clock, random: (target) => rng.fill(target) };
    this.ids = createUlidGenerator(this.deps);
  }

  /** Records `draft` as of business date `date`: the clock moves there, envelope and fingerprint are completed. */
  record<E extends SupportedEvent>(date: CivilDate, draft: Draft<E>): E {
    this.clock.at(date);
    const event = completeDraft<E>(this.deps, draft, this.ids.next());
    this.events.push(event);
    this.cached = undefined;
    return event;
  }

  /** Projection of everything recorded so far (memoised until the next record). */
  state(): LedgerState {
    if (this.cached === undefined) {
      this.cached = projectLedger(this.events);
    }
    return this.cached;
  }

  position(accountId: AccountId, assetId: AssetId): Quantity {
    return positionOf(this.state(), accountId, assetId);
  }

  cash(accountId: AccountId, currency: string): Money | undefined {
    return this.state().cash.get(cashKey(accountId, currency));
  }

  expectWarning(code: string): void {
    this.expectedWarnings.add(code);
  }

  /** Random day of month in [1, 5], the jitter every block of the scenario uses. */
  day(): number {
    return this.rng.int(1, 5);
  }

  /** Per account holding `assetId`, the fractional share left after scaling its position by `ratio`. */
  picos(assetId: AssetId, ratio: string): Pico[] {
    const parsed = Ratio.parse(ratio);
    const result: Pico[] = [];
    for (const [key, quantity] of this.state().positions) {
      const [account_id, asset] = key.split("|") as [AccountId, AssetId];
      if (asset !== assetId || !quantity.isPositive()) {
        continue;
      }
      const scaled = parsed.apply(quantity).value;
      const fraction = scaled.sub(integerPart(scaled));
      if (fraction.isPositive()) {
        result.push({ account_id, quantity: fraction.toString() });
      }
    }
    return result;
  }

  /** `amount / price` rounded to `scale` decimals: the units a fund subscription buys. */
  unitsFor(amount: string, price: string, scale = 4): string {
    return Decimal.parse(amount).div(Decimal.parse(price)).round(scale).toString();
  }
}
