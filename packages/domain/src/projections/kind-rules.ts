// Composition table of corporate actions (data-schema.md §8.5, ADR-0011): which
// ordered sequences of primitives each `kind` admits, and on which asset each
// step acts. Data, not code: a new kind is a row.

import { ProjectionError } from "../errors.js";
import type { AssetId, CorporateActionKind, Effect, EffectOp } from "../schema/events.js";

/** Which asset a step must act on: the event's, the target of the previous step, or any. */
export type Target = "event" | "previous" | "any";

export interface Step {
  op: EffectOp;
  asset: Target;
}

export type KindRule =
  | {
      /** Admitted sequences, matched exactly (length, ops and targets). */
      sequences: readonly (readonly Step[])[];
      /** `forced_sale` must sell `"all"` in exactly the accounts holding the asset. */
      liquidation?: true;
    }
  | {
      /** Any non-empty sequence of these ops, on any asset. */
      anyOf: readonly EffectOp[];
    };

/** An effect whose `asset_id` has been resolved (defaults to the event's). */
export type ResolvedEffect = Effect & { asset_id: AssetId };

const onEvent = (op: EffectOp): Step => ({ op, asset: "event" });
const onPrevious = (op: EffectOp): Step => ({ op, asset: "previous" });
const onAny = (op: EffectOp): Step => ({ op, asset: "any" });

export const KIND_RULES: Record<CorporateActionKind, KindRule> = {
  split: { sequences: [[onEvent("scale")]] },
  reverse_split: {
    sequences: [[onEvent("scale")], [onEvent("scale"), onEvent("forced_sale")]],
  },
  stock_dividend: {
    sequences: [[onEvent("scale")], [onAny("grant")], [onAny("grant"), onPrevious("forced_sale")]],
  },
  merger: {
    sequences: [
      [onEvent("convert")],
      [onEvent("forced_sale"), onEvent("convert")],
      [onEvent("convert"), onPrevious("forced_sale")],
    ],
  },
  spin_off: {
    sequences: [[onEvent("carve_out")], [onEvent("carve_out"), onPrevious("forced_sale")]],
  },
  fund_merger: { sequences: [[onEvent("convert")]] },
  share_class_change: { sequences: [[onEvent("convert")]] },
  fund_liquidation: { sequences: [[onEvent("forced_sale")]], liquidation: true },
  issuer_liquidation: { sequences: [[onEvent("forced_sale")]], liquidation: true },
  delisting: { sequences: [[]] },
  crypto_fork: { sequences: [[onAny("grant")]] },
  token_migration: { sequences: [[onEvent("convert")]] },
  issuer_restructuring: { anyOf: ["convert", "forced_sale"] },
};

/** Asset a step leaves behind for the next one: the destination of a conversion, else its own. */
export const targetOf = (effect: ResolvedEffect): AssetId =>
  effect.op === "convert" || effect.op === "carve_out" ? effect.to_asset_id : effect.asset_id;

const stepMatches = (
  step: Step,
  effects: readonly ResolvedEffect[],
  index: number,
  eventAssetId: AssetId,
): boolean => {
  const effect = effects[index] as ResolvedEffect;
  if (effect.op !== step.op) {
    return false;
  }
  switch (step.asset) {
    case "event":
      return effect.asset_id === eventAssetId;
    case "previous":
      return effect.asset_id === targetOf(effects[index - 1] as ResolvedEffect);
    case "any":
      return true;
  }
};

const sequenceMatches = (
  sequence: readonly Step[],
  effects: readonly ResolvedEffect[],
  eventAssetId: AssetId,
): boolean =>
  sequence.length === effects.length &&
  sequence.every((step, index) => stepMatches(step, effects, index, eventAssetId));

const describe = (rule: KindRule): string[] =>
  "anyOf" in rule
    ? [`one or more of ${rule.anyOf.join("|")}`]
    : rule.sequences.map((sequence) =>
        sequence.length === 0
          ? "(no effects)"
          : sequence.map((step) => `${step.op}@${step.asset}`).join(", "),
      );

export const isLiquidation = (kind: CorporateActionKind): boolean => {
  const rule = KIND_RULES[kind];
  return "liquidation" in rule && rule.liquidation === true;
};

/** Throws `effects_not_allowed_for_kind` when the sequence does not fit the kind's row. */
export const checkEffectsAgainstKind = (
  kind: CorporateActionKind,
  effects: readonly ResolvedEffect[],
  eventAssetId: AssetId,
  eventId: string,
): void => {
  const rule = KIND_RULES[kind];
  const allowed =
    "anyOf" in rule
      ? effects.length > 0 && effects.every((effect) => rule.anyOf.includes(effect.op))
      : rule.sequences.some((sequence) => sequenceMatches(sequence, effects, eventAssetId));
  if (!allowed) {
    throw new ProjectionError(
      "effects_not_allowed_for_kind",
      eventId,
      `${kind} does not admit the effect sequence [${effects.map((effect) => effect.op).join(", ")}]`,
      {
        kind,
        effects: effects.map((effect) => `${effect.op}@${effect.asset_id}`),
        allowed: describe(rule),
      },
    );
  }
};
