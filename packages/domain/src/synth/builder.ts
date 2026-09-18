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
import { deriveSeed, Prng } from "./random.js";

export interface Pico {
  account_id: AccountId;
  /** Fractional part left in the account after scaling, as a decimal string. */
  quantity: string;
}

const integerPart = (value: Decimal): Decimal =>
  Decimal.parse(value.toString().split(".")[0] as string);

/**
 * A side stream of the scenario (feature 005, prompt §3.8): it records into the
 * same ledger but with **its own dice, its own ULID generator and its own
 * clock**, so a block added here does not move a single byte of what the main
 * stream already recorded.
 *
 * The three are needed. The dice alone are not enough: the random part of every
 * ULID is drawn from the same stream as the amounts, and the shared clock
 * advances one second per event recorded on the same day, so an interleaved
 * event would shift the `recorded_at` of its neighbours. Before this, adding
 * any event reshuffled the ids and figures of everything after it: the feature
 * 004 regeneration changed 116 of 160 ids and left the diff unreadable.
 */
export class ScenarioStream {
  private readonly deps: { clock: Clock; random: RandomSource };
  private readonly ids: UlidGenerator;

  constructor(
    private readonly owner: ScenarioBuilder,
    readonly rng: Prng,
    private readonly clock = new SyntheticClock(),
  ) {
    this.deps = { clock, random: (target) => rng.fill(target) };
    this.ids = createUlidGenerator(this.deps);
  }

  /** Records `draft` as of business date `date`, at the end of the file. */
  record<E extends SupportedEvent>(date: CivilDate, draft: Draft<E>): E {
    this.clock.at(date);
    const event = completeDraft<E>(this.deps, draft, this.ids.next());
    this.owner.append(event);
    return event;
  }

  /** Random day of month in [1, 5], drawn from this stream. */
  day(): number {
    return this.rng.int(1, 5);
  }
}

export class ScenarioBuilder {
  readonly events: LedgerEvent[] = [];
  /** Warning codes the scenario provokes on purpose (Q1: e.g. the ETC held in two accounts). */
  readonly expectedWarnings = new Set<string>();
  private readonly deps: { clock: Clock; random: RandomSource };
  private readonly ids: UlidGenerator;
  private cached: LedgerState | undefined;

  constructor(
    readonly rng: Prng,
    private readonly seed = 0,
    private readonly clock = new SyntheticClock(),
  ) {
    this.deps = { clock, random: (target) => rng.fill(target) };
    this.ids = createUlidGenerator(this.deps);
  }

  /** A side stream with its own dice, ids and clock, derived from the seed and the label. */
  stream(label: string): ScenarioStream {
    return new ScenarioStream(this, new Prng(deriveSeed(this.seed, label)));
  }

  /** Appends an event recorded elsewhere (a side stream) and invalidates the memo. */
  append(event: LedgerEvent): void {
    this.events.push(event);
    this.cached = undefined;
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

  /**
   * The ledger recorded so far, cut at a date (ADR-0016): what a side stream
   * needs to write the quantity a valuation had **then**, not the one it has at
   * the end of the file.
   */
  stateAsOf(date: CivilDate): LedgerState {
    return projectLedger(this.events, { asOf: date });
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
