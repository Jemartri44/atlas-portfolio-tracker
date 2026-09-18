// The wash-sale rule, computed (data-schema.md §8.4, business-rules.md §5.4,
// fiscal criteria #2, #2b, #14, #15 and #18–#21).
//
// Until feature 009 the rule only warned. Here it decides: which part of a loss
// is not computable this year, which lots carry it, how it travels through
// transfers, conversions and carve-outs, and in which year it comes back.
//
// **There is no second FIFO here.** The projection writes down, in order, what
// the single lot engine did to every lot (`state.lotJournal`); this walks that
// record and carries one more magnitude along it, the deferred loss. Which lots
// a sale consumed is never decided again: it is read.
//
// The rules the document leaves open are the ones the direction numbered on
// 2026-09-18 (feature 009, Q1):
//
// - #18: an acquisition inside the window only counts for the units still held
//   after the loss-making transmission (not the ones that same sale consumed,
//   nor the ones already gone): without a lot to carry it, a deferral has no
//   place to travel and no moment to come back.
// - #19: each acquired unit defers at most one transmitted unit, and losses are
//   served in chronological order.
// - #20: the rule looks at the net result of the transmission, not lot by lot.
// - #21: a released deferral adds to the result of the transmission that
//   releases it, and the rule applies again to the total.

import { type CivilDate, daysBetween, yearOf } from "../dates/civil-date.js";
import type { Ulid } from "../ids/ulid.js";
import type { Decimal } from "../money/decimal.js";
import { Money } from "../money/money.js";
import { Quantity } from "../money/quantity.js";
import type { LedgerState, LotJournalEntry, RealizedGain } from "../projections/state.js";
import type { AssetId, AssetType } from "../schema/events.js";
import {
  type IncomeCategory,
  incomeCategoryOf,
  type WashSaleWindow,
} from "../settings/settings.js";
import { washSaleWindowEnd, washSaleWindowOf, washSaleWindowStart } from "../settings/wash-sale.js";

const EUR = "EUR";

/** A part of a deferred loss sitting on a lot, with the transmission it came from. */
interface Share {
  /** Index of the loss-making transmission in `state.gains`. */
  origin: number;
  /** Negative: it is a loss. Exact, never rounded. */
  amount: Money;
  /** It left the lot it was attached to through a transfer, a conversion or a carve-out (#15). */
  travelled: boolean;
}

/** An acquisition that absorbed part of a loss. */
export interface DeferralCandidate {
  event_id: Ulid;
  asset_id: AssetId;
  fiscal_date: CivilDate;
  /** Units of this acquisition used to defer the loss. */
  units: Quantity;
  amount_eur: Money;
  /** Before the loss in pass B (its lots existed) or after it. */
  timing: "prior" | "posterior";
  /** The acquisition is a transfer in (#2b). */
  via_transfer: boolean;
}

/** What a loss-making transmission deferred. */
export interface Deferral {
  origin: number;
  event_id: Ulid;
  asset_id: AssetId;
  fiscal_date: CivilDate;
  year: number;
  /** Negative, exact. */
  amount_eur: Money;
  units: Quantity;
  sold: Quantity;
  candidates: DeferralCandidate[];
}

/** Part of a deferred loss that a transmission brought back. */
export interface Release {
  origin: number;
  lot_id: string;
  /** Negative, exact. */
  amount_eur: Money;
  travelled: boolean;
}

export interface WindowSpan {
  window: WashSaleWindow;
  start: CivilDate;
  end: CivilDate;
}

/** The rule applied to one transmission (one entry of `state.gains`). */
export interface WashSaleOutcome {
  gain_index: number;
  /** The gain of the transmission itself, exact (`RealizedGain.gain_eur`). */
  own_eur: Money;
  released: Release[];
  released_eur: Money;
  /**
   * Releases of a loss of the **other** income category: they are integrated
   * where the loss came from (FR-015) and stay out of what the rule looks at.
   * Only possible when a conversion joins two asset types of different category.
   */
  foreign_released: Release[];
  /** `own + released`: what the rule looks at (#21). */
  total_eur: Money;
  /** Present when the total was a loss and the window was looked at. */
  window?: WindowSpan;
  /** Negative or zero, exact. */
  deferred_eur: Money;
  deferral?: Deferral;
  /** `total − deferred`, exact. Rounded once per operation by the caller. */
  computable_eur: Money;
  /** The window after the loss is still open on the date of the query. */
  provisional_until?: CivilDate;
  /** Candidates excluded because their units are no longer held (#18). */
  not_held: boolean;
  /** Candidates whose units were already used by an earlier loss (#19). */
  used_before: boolean;
  /** The lots of the transmission had results of different sign (#20). */
  mixed_lots: boolean;
  /** The release changed what the rule looked at (#21). */
  reapplied: boolean;
  /** An acquisition was left out because a scale happened between it and the loss (A12). */
  scale_excluded: boolean;
  /** Deferral with the alternative reading minus the current one, per criterion. */
  alternatives: { "18": Money; "19": Money; "21": Money };
}

/** A deferred loss still sitting on a lot after the whole ledger. */
export interface PendingDeferral {
  origin: number;
  lot_id: string;
  asset_id: AssetId;
  amount_eur: Money;
  travelled: boolean;
}

export interface WashSaleResult {
  outcomes: WashSaleOutcome[];
  deferrals: Deferral[];
  /** Deferred losses still on lots after the whole ledger. */
  pending: PendingDeferral[];
  /** The same, at the cutoff: before the first entry the caller says is after it. */
  pendingAtCutoff: PendingDeferral[];
}

interface Acquired {
  key: string;
  event_id: Ulid;
  asset_id: AssetId;
  fiscal_date: CivilDate;
  quantity: Quantity;
  via_transfer: boolean;
}

interface Pending {
  origin: number;
  amount: Money;
  units: Quantity;
}

const keyOf = (eventId: string, assetId: string): string => `${eventId}|${assetId}`;

const zero = (): Money => Money.zero(EUR);

const minZero = (money: Money): Money => (money.isNegative() ? money : zero());

/** `total × part / whole`, exact when the part is the whole. */
const share = (total: Money, part: Quantity, whole: Quantity): Money =>
  part.eq(whole) ? total : total.mul(part.value).div(whole.value);

/** The same rule for units. */
const unitShare = (total: Quantity, part: Quantity, whole: Quantity): Quantity =>
  part.eq(whole) ? total : Quantity.of(total.value.mul(part.value).div(whole.value));

class Walker {
  private readonly quantity = new Map<string, Quantity>();
  private readonly assetOf = new Map<string, AssetId>();
  private readonly shares = new Map<string, Share[]>();
  /** Fraction of a lot's units already used to defer a loss (#19). */
  private readonly used = new Map<string, Decimal>();
  /** Units that left a lot since it was opened (#18). */
  private readonly consumed = new Map<string, Quantity>();
  private readonly lotsOfKey = new Map<string, string[]>();
  private readonly transit = new Map<string, Share[]>();
  private readonly pendingOf = new Map<string, Pending[]>();
  private readonly toOpen = new Map<string, Quantity>();
  private releasing: Release[] = [];
  readonly outcomes: WashSaleOutcome[] = [];
  readonly deferrals: Deferral[] = [];
  atCutoff: PendingDeferral[] | undefined;

  constructor(
    private readonly state: LedgerState,
    private readonly today: CivilDate,
    private readonly acquired: Map<AssetId, Acquired[]>,
    private readonly firstOpen: Map<string, number>,
    private readonly scales: Map<AssetId, number[]>,
    private readonly afterCutoff: (eventId: Ulid) => boolean,
  ) {
    for (const list of acquired.values()) {
      for (const entry of list) {
        this.toOpen.set(entry.key, entry.quantity);
      }
    }
  }

  walk(): void {
    this.state.lotJournal.forEach((entry, index) => {
      if (this.atCutoff === undefined && this.afterCutoff(this.eventOf(entry))) {
        this.atCutoff = this.pending();
      }
      this.apply(entry, index);
    });
    this.atCutoff ??= this.pending();
  }

  private eventOf(entry: LotJournalEntry): Ulid {
    return entry.kind === "gain"
      ? (this.state.gains[entry.gain_index] as RealizedGain).event_id
      : entry.event_id;
  }

  private apply(entry: LotJournalEntry, index: number): void {
    switch (entry.kind) {
      case "open":
        this.open(
          entry.lot_id,
          entry.asset_id,
          entry.event_id,
          entry.quantity,
          entry.source_lot_id,
        );
        return;
      case "consume":
        this.consume(entry.lot_id, entry.quantity, entry.quantity_before, entry.purpose);
        return;
      case "carve":
        this.carve(entry.lot_id, entry.into_lot_id, entry.cost_share);
        return;
      case "scale":
        this.quantity.set(entry.lot_id, entry.quantity_after);
        return;
      case "gain":
        this.gain(entry.gain_index, index);
        return;
    }
  }

  private sharesOf(lotId: string): Share[] {
    let list = this.shares.get(lotId);
    if (list === undefined) {
      list = [];
      this.shares.set(lotId, list);
    }
    return list;
  }

  private open(
    lotId: string,
    assetId: AssetId,
    eventId: Ulid,
    quantity: Quantity,
    source?: string,
  ): void {
    this.quantity.set(lotId, quantity);
    this.assetOf.set(lotId, assetId);
    const key = keyOf(eventId, assetId);
    this.lotsOfKey.set(key, [...(this.lotsOfKey.get(key) ?? []), lotId]);
    const inherited = source === undefined ? undefined : this.transit.get(source);
    if (inherited !== undefined) {
      this.sharesOf(lotId).push(...inherited);
      this.transit.delete(source as string);
    }
    const pending = this.pendingOf.get(key);
    const remaining = this.toOpen.get(key);
    if (pending === undefined || remaining === undefined) {
      return;
    }
    let usedUnits = Quantity.ZERO;
    for (const entry of pending) {
      const amount = share(entry.amount, quantity, remaining);
      const units = unitShare(entry.units, quantity, remaining);
      entry.amount = entry.amount.sub(amount);
      entry.units = entry.units.sub(units);
      usedUnits = usedUnits.add(units);
      this.sharesOf(lotId).push({ origin: entry.origin, amount, travelled: false });
    }
    this.used.set(lotId, usedUnits.value.div(quantity.value));
    this.toOpen.set(key, remaining.sub(quantity));
  }

  private consume(
    lotId: string,
    quantity: Quantity,
    before: Quantity,
    purpose: "transmission" | "transfer" | "convert",
  ): void {
    this.quantity.set(lotId, before.sub(quantity));
    this.consumed.set(lotId, (this.consumed.get(lotId) ?? Quantity.ZERO).add(quantity));
    const moving: Share[] = [];
    for (const held of this.shares.get(lotId) ?? []) {
      const part = share(held.amount, quantity, before);
      held.amount = held.amount.sub(part);
      if (!part.isZero()) {
        moving.push({ origin: held.origin, amount: part, travelled: held.travelled });
      }
    }
    if (purpose === "transmission") {
      this.releasing.push(
        ...moving.map((part) => ({
          origin: part.origin,
          lot_id: lotId,
          amount_eur: part.amount,
          travelled: part.travelled,
        })),
      );
      return;
    }
    if (moving.length > 0) {
      this.transit.set(
        lotId,
        moving.map((part) => ({ ...part, travelled: true })),
      );
    }
  }

  private carve(lotId: string, into: string, costShare: Decimal): void {
    for (const held of this.shares.get(lotId) ?? []) {
      const part = held.amount.mul(costShare);
      held.amount = held.amount.sub(part);
      if (!part.isZero()) {
        this.sharesOf(into).push({ origin: held.origin, amount: part, travelled: true });
      }
    }
  }

  private gain(gainIndex: number, journalIndex: number): void {
    const gain = this.state.gains[gainIndex] as RealizedGain;
    const category = this.categoryOf(gain.asset_id);
    const released = this.releasing.filter(
      (part) =>
        this.categoryOf((this.state.gains[part.origin] as RealizedGain).asset_id) === category,
    );
    const foreign = this.releasing.filter((part) => !released.includes(part));
    this.releasing = [];
    const releasedEur = released.reduce((sum, part) => sum.add(part.amount_eur), zero());
    const total = gain.gain_eur.add(releasedEur);
    const signs = new Set(
      gain.by_lot.filter((lot) => !lot.gain_eur.isZero()).map((lot) => lot.gain_eur.isNegative()),
    );
    const outcome: WashSaleOutcome = {
      gain_index: gainIndex,
      own_eur: gain.gain_eur,
      released,
      released_eur: releasedEur,
      foreign_released: foreign,
      total_eur: total,
      deferred_eur: zero(),
      computable_eur: total,
      not_held: false,
      used_before: false,
      mixed_lots: signs.size > 1,
      reapplied: false,
      scale_excluded: false,
      alternatives: { "18": zero(), "19": zero(), "21": zero() },
    };
    this.outcomes.push(outcome);
    if (total.isNegative()) {
      this.evaluate(gain, outcome, journalIndex);
    }
  }

  private assetType(assetId: AssetId): AssetType {
    return (this.state.assets.get(assetId) as { asset_type: AssetType }).asset_type;
  }

  private categoryOf(assetId: AssetId): IncomeCategory {
    return incomeCategoryOf(this.state.fiscalSettings, this.assetType(assetId));
  }

  private evaluate(gain: RealizedGain, outcome: WashSaleOutcome, journalIndex: number): void {
    const window = washSaleWindowOf(this.state.fiscalSettings, this.assetType(gain.asset_id));
    const start = washSaleWindowStart(gain.fiscal_date, window);
    const end = washSaleWindowEnd(gain.fiscal_date, window);
    outcome.window = { window, start, end };
    if (end > this.today) {
      outcome.provisional_until = end;
    }
    const sold = gain.quantity;
    const candidates = this.candidates(gain, start, end, journalIndex, outcome);
    const available = candidates.reduce((sum, c) => sum.add(c.available), Quantity.ZERO);
    const units = available.gt(sold) ? sold : available;
    const deferred = units.isZero() ? zero() : share(outcome.total_eur, units, sold);
    const alternative = (extra: Quantity): Money => {
      const all = available.add(extra);
      const altUnits = all.gt(sold) ? sold : all;
      return share(outcome.total_eur, altUnits, sold).sub(deferred);
    };
    outcome.alternatives["18"] = alternative(
      candidates.reduce((sum, c) => sum.add(c.notHeld), Quantity.ZERO),
    );
    outcome.alternatives["19"] = alternative(
      candidates.reduce((sum, c) => sum.add(c.usedBefore), Quantity.ZERO),
    );
    // #21: the alternative looks only at the transmission's own result. A
    // release is never zero, so it always changes what the rule looks at.
    if (!outcome.released_eur.isZero()) {
      outcome.reapplied = true;
      const own = minZero(outcome.own_eur);
      const ownDeferred = units.isZero() ? zero() : share(own, units, sold);
      outcome.alternatives["21"] = ownDeferred.sub(deferred);
    }
    if (units.isZero()) {
      return;
    }
    outcome.deferred_eur = deferred;
    outcome.computable_eur = outcome.total_eur.sub(deferred);
    const deferral: Deferral = {
      origin: outcome.gain_index,
      event_id: gain.event_id,
      asset_id: gain.asset_id,
      fiscal_date: gain.fiscal_date,
      year: yearOf(gain.fiscal_date),
      amount_eur: deferred,
      units,
      sold,
      candidates: [],
    };
    this.allocate(deferral, candidates, units, deferred);
    this.deferrals.push(deferral);
    outcome.deferral = deferral;
  }

  private candidates(
    gain: RealizedGain,
    start: CivilDate,
    end: CivilDate,
    journalIndex: number,
    outcome: WashSaleOutcome,
  ): Candidate[] {
    const assetId = gain.asset_id;
    const found: Candidate[] = [];
    for (const acquisition of this.acquired.get(assetId) ?? []) {
      if (acquisition.fiscal_date < start || acquisition.fiscal_date > end) {
        continue;
      }
      const position = this.firstOpen.get(acquisition.key) as number;
      const lots = this.lotsOfKey.get(acquisition.key);
      if (lots === undefined) {
        // After the loss: its lots do not exist yet. A scale in between makes
        // the units of the purchase and of the sale incomparable (A12).
        const scaled = (this.scales.get(assetId) ?? []).some(
          (at) => at > journalIndex && at < position,
        );
        if (scaled) {
          outcome.scale_excluded = true;
          continue;
        }
        // Its units matched to earlier losses (#19) are the ones still pending.
        const usedBefore = (this.pendingOf.get(acquisition.key) ?? []).reduce(
          (sum, entry) => sum.add(entry.units),
          Quantity.ZERO,
        );
        found.push({
          acquisition,
          position,
          timing: "posterior",
          available: acquisition.quantity.sub(usedBefore),
          notHeld: Quantity.ZERO,
          usedBefore,
          lots: [],
        });
        continue;
      }
      let free = Quantity.ZERO;
      let usedBefore = Quantity.ZERO;
      let notHeld = Quantity.ZERO;
      const lotAvailability: { lot: string; available: Quantity }[] = [];
      for (const lot of lots) {
        const held = this.quantity.get(lot) as Quantity;
        const usedFraction = this.used.get(lot);
        const usedUnits =
          usedFraction === undefined ? Quantity.ZERO : Quantity.of(held.value.mul(usedFraction));
        const available = held.sub(usedUnits);
        free = free.add(available);
        usedBefore = usedBefore.add(usedUnits);
        notHeld = notHeld.add(this.consumed.get(lot) ?? Quantity.ZERO);
        if (available.isPositive()) {
          lotAvailability.push({ lot, available });
        }
      }
      found.push({
        acquisition,
        position,
        timing: "prior",
        available: free,
        notHeld,
        usedBefore,
        lots: lotAvailability,
      });
    }
    if (found.some((c) => c.notHeld.isPositive())) {
      outcome.not_held = true;
    }
    if (found.some((c) => c.usedBefore.isPositive())) {
      outcome.used_before = true;
    }
    // The closest in date first (data-schema.md §8.4); at equal distance, the
    // order of pass B.
    const distance = (candidate: Candidate): number =>
      Math.abs(daysBetween(gain.fiscal_date, candidate.acquisition.fiscal_date));
    return found.sort((a, b) => distance(a) - distance(b) || a.position - b.position);
  }

  private allocate(
    deferral: Deferral,
    candidates: readonly Candidate[],
    units: Quantity,
    deferred: Money,
  ): void {
    let remainingUnits = units;
    let remainingAmount = deferred;
    for (const candidate of candidates) {
      if (!remainingUnits.isPositive()) {
        break;
      }
      if (!candidate.available.isPositive()) {
        continue;
      }
      const taken = candidate.available.gt(remainingUnits) ? remainingUnits : candidate.available;
      const amount = taken.eq(remainingUnits)
        ? remainingAmount
        : deferred.mul(taken.value).div(units.value);
      remainingUnits = remainingUnits.sub(taken);
      remainingAmount = remainingAmount.sub(amount);
      deferral.candidates.push({
        event_id: candidate.acquisition.event_id,
        asset_id: candidate.acquisition.asset_id,
        fiscal_date: candidate.acquisition.fiscal_date,
        units: taken,
        amount_eur: amount,
        timing: candidate.timing,
        via_transfer: candidate.acquisition.via_transfer,
      });
      if (candidate.timing === "posterior") {
        const key = candidate.acquisition.key;
        this.pendingOf.set(key, [
          ...(this.pendingOf.get(key) ?? []),
          { origin: deferral.origin, amount, units: taken },
        ]);
        continue;
      }
      this.attach(deferral.origin, candidate, taken, amount);
    }
  }

  /** Spreads a prior candidate's part over its lots, in proportion to what each one had free. */
  private attach(origin: number, candidate: Candidate, taken: Quantity, amount: Money): void {
    let leftUnits = taken;
    let leftAmount = amount;
    candidate.lots.forEach((entry, index) => {
      const last = index === candidate.lots.length - 1;
      const units = last
        ? leftUnits
        : Quantity.of(taken.value.mul(entry.available.value).div(candidate.available.value));
      const part = last ? leftAmount : amount.mul(units.value).div(taken.value);
      leftUnits = leftUnits.sub(units);
      leftAmount = leftAmount.sub(part);
      const held = this.quantity.get(entry.lot) as Quantity;
      const before = this.used.get(entry.lot);
      const usedUnits = (
        before === undefined ? Quantity.ZERO : Quantity.of(held.value.mul(before))
      ).add(units);
      this.used.set(entry.lot, usedUnits.value.div(held.value));
      this.sharesOf(entry.lot).push({ origin, amount: part, travelled: false });
    });
  }

  pending(): PendingDeferral[] {
    const result: PendingDeferral[] = [];
    for (const [lotId, list] of this.shares) {
      for (const held of list) {
        if (!held.amount.isZero()) {
          result.push({
            origin: held.origin,
            lot_id: lotId,
            asset_id: this.assetOf.get(lotId) as AssetId,
            amount_eur: held.amount,
            travelled: held.travelled,
          });
        }
      }
    }
    return result;
  }
}

interface Candidate {
  acquisition: Acquired;
  /** Journal index where its first lot opens: the tie-break at equal distance. */
  position: number;
  timing: "prior" | "posterior";
  available: Quantity;
  notHeld: Quantity;
  usedBefore: Quantity;
  lots: { lot: string; available: Quantity }[];
}

/** Acquisitions per asset, one per (event, asset), with its whole quantity. */
const acquisitionsOf = (
  state: LedgerState,
  eventTypes: Map<Ulid, string>,
): Map<AssetId, Acquired[]> => {
  const result = new Map<AssetId, Acquired[]>();
  for (const [assetId, list] of state.acquisitions) {
    const byKey = new Map<string, Acquired>();
    for (const entry of list) {
      const key = keyOf(entry.event_id, assetId);
      const known = byKey.get(key);
      if (known === undefined) {
        byKey.set(key, {
          key,
          event_id: entry.event_id,
          asset_id: assetId,
          fiscal_date: entry.fiscal_date,
          quantity: entry.quantity,
          via_transfer: eventTypes.get(entry.event_id) === "transfer",
        });
      } else {
        known.quantity = known.quantity.add(entry.quantity);
      }
    }
    result.set(assetId, [...byKey.values()]);
  }
  return result;
};

/**
 * Walks the lot journal and applies the rule to every transmission of the
 * ledger, in the order the projection applied them. `today` only decides what
 * is provisional: a loss whose window is still open can still be deferred by a
 * purchase that has not happened yet.
 */
export const walkWashSales = (
  state: LedgerState,
  today: CivilDate,
  eventTypes: Map<Ulid, string>,
  afterCutoff: (eventId: Ulid) => boolean = () => false,
): WashSaleResult => {
  const firstOpen = new Map<string, number>();
  const scales = new Map<AssetId, number[]>();
  const assetOfLot = new Map<string, AssetId>();
  state.lotJournal.forEach((entry, index) => {
    if (entry.kind === "open") {
      assetOfLot.set(entry.lot_id, entry.asset_id);
      const key = keyOf(entry.event_id, entry.asset_id);
      if (!firstOpen.has(key)) {
        firstOpen.set(key, index);
      }
    }
    if (entry.kind === "scale") {
      const assetId = assetOfLot.get(entry.lot_id) as AssetId;
      scales.set(assetId, [...(scales.get(assetId) ?? []), index]);
    }
  });
  const walker = new Walker(
    state,
    today,
    acquisitionsOf(state, eventTypes),
    firstOpen,
    scales,
    afterCutoff,
  );
  walker.walk();
  return {
    outcomes: walker.outcomes,
    deferrals: walker.deferrals,
    pending: walker.pending(),
    pendingAtCutoff: walker.atCutoff as PendingDeferral[],
  };
};
