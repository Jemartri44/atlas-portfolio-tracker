// Composing a corporate action: from a handful of parameters to the `effects[]`
// the event carries (data-schema.md §6.5 and §8.5, ADR-0011).
//
// It lived in `apps/cli/src/commands/corporate-actions.ts`, where nine wizards
// turned flags into effects. Most of that is composition, but one piece is not:
// the **fractional shares of a reverse split**. Working out that an account is
// left with `position − ⌊position⌋` shares, and that exactly those are sold,
// decides how much gain is realised and in which account — a fiscal
// consequence. A rule like that cannot live in an interface (ADR-0007,
// decision (h) of prompt 006, Q4 of prompt 007), because the second interface
// would have to write it again and the two would drift in silence.
//
// It is **pure**: it projects the ledger with the main effects to see the
// resulting positions, which needs no clock, no identifier and no I/O. The
// envelope of that throw-away candidate is a fixed placeholder; it is never
// written anywhere.

import type { CivilDate } from "../dates/civil-date.js";
import { ValidationError } from "../errors.js";
import { Decimal, type DecimalString } from "../money/decimal.js";
import type { Currency } from "../money/money.js";
import { Quantity } from "../money/quantity.js";
import type {
  AccountId,
  AssetId,
  CorporateActionEvent,
  CorporateActionKind,
  Draft,
  Effect,
  ForcedSaleEntry,
  LedgerEvent,
  RatioString,
} from "../schema/events.js";
import { CURRENT_LEDGER_SCHEMA } from "../schema/migrations/index.js";
import { physicalPositions } from "./positions.js";
import { projectLedger } from "./project-ledger.js";
import type { LedgerState } from "./state.js";

/** Cash settlement of the fractions, or of the whole position in a liquidation. */
export interface CashSettlement {
  unit_price: DecimalString;
  currency: Currency;
  fx_rate: DecimalString;
  fx_rate_date: CivilDate;
}

export interface CorporateActionParams {
  kind: CorporateActionKind;
  asset_id: AssetId;
  effective_date: CivilDate;
  /** Issuer's URL or document key. Never empty (data-schema.md §6.5). */
  source_document: string;
  notes?: string;
  /** Destination of a conversion or a carve-out. */
  to_asset_id?: AssetId;
  ratio?: RatioString;
  /** Carve-out: share of each origin lot's cost that moves, in [0, 1]. */
  cost_share?: DecimalString;
  /**
   * Cash for the leftovers. Present on a reverse split, a merger or a spin-off
   * means "settle the fractions"; on a liquidation it is the price of the whole
   * position. Absent means no forced sale is generated.
   */
  cash?: CashSettlement;
  /** Fee the broker charged, per account taking part in the forced sale. */
  fees?: Readonly<Record<AccountId, DecimalString>>;
  /** Only for the escape hatch: effects given verbatim, composed by nobody. */
  effects?: readonly Effect[];
}

export interface FractionRow {
  account_id: AccountId;
  quantity: DecimalString;
}

export interface CorporateActionDraft {
  draft: Draft<CorporateActionEvent>;
  /** Accounts left with fractions and how much is sold in each; empty when none. */
  fractional: FractionRow[];
  /**
   * A cash settlement was asked for and **nobody** was left with a fraction, so
   * no `forced_sale` was generated. Said out loud rather than silently skipped.
   */
  no_fractions: boolean;
}

const fail = (code: string, message: string, details: Record<string, unknown>): never => {
  throw new ValidationError(code, message, details);
};

const required = <T>(value: T | undefined, parameter: string, kind: CorporateActionKind): T => {
  if (value === undefined || value === "") {
    fail("missing_effect_parameter", `a ${kind} needs ${parameter}`, { parameter, kind });
  }
  return value as T;
};

const requireAsset = (state: LedgerState, assetId: AssetId, role: string): AssetId => {
  if (!state.assets.has(assetId)) {
    fail("unknown_asset", `asset ${assetId} does not exist`, { asset_id: assetId, role });
  }
  return assetId;
};

/** The whole part of a quantity: what survives a reverse split in whole shares. */
const floorOf = (quantity: Quantity): Decimal =>
  Decimal.parse(quantity.toString().split(".")[0] as string);

const priceOf = (
  cash: CashSettlement,
): Omit<Extract<Effect, { op: "forced_sale" }>, "op" | "per_account" | "asset_id"> => ({
  unit_price: cash.unit_price,
  currency: cash.currency,
  fx_rate: cash.fx_rate,
  fx_rate_date: cash.fx_rate_date,
});

/** Attaches the fee of each account taking part in the sale. */
const withFees = (
  entries: readonly ForcedSaleEntry[],
  fees: Readonly<Record<AccountId, DecimalString>> | undefined,
): ForcedSaleEntry[] => {
  if (fees === undefined) {
    return [...entries];
  }
  return entries.map((entry) =>
    fees[entry.account_id] === undefined
      ? entry
      : { ...entry, fee: fees[entry.account_id] as DecimalString },
  );
};

/** Accounts that end up selling something in the composed sequence. */
const sellingAccounts = (effects: readonly Effect[]): AccountId[] =>
  effects.flatMap((effect) =>
    effect.op === "forced_sale" ? effect.per_account.map((entry) => entry.account_id) : [],
  );

/**
 * A fee that lands nowhere is **refused**, never dropped.
 *
 * It is checked against the sequence that was actually composed, not inside the
 * branch that builds the sale, because the ways of ending up with no sale are
 * several and each of them used to swallow the fee in silence: a split with no
 * cash settlement, a reverse split where nobody was left with a fraction, an
 * escape hatch with hand-written effects. The fee is a cost of a disposal
 * (`docs/business-rules.md`); losing it overstates the gain, and the ledger is
 * append-only, so the mistake is expensive to undo years later.
 */
const checkFees = (
  selling: readonly AccountId[],
  fees: Readonly<Record<AccountId, DecimalString>> | undefined,
): void => {
  if (fees === undefined) {
    return;
  }
  const set = new Set(selling);
  for (const account of Object.keys(fees)) {
    if (!set.has(account)) {
      fail("fee_account_not_selling", `account ${account} takes no part in the forced sale`, {
        account_id: account,
        selling: [...set],
      });
    }
  }
};

const eventOf = (
  params: CorporateActionParams,
  effects: readonly Effect[],
): Draft<CorporateActionEvent> =>
  ({
    type: "corporate_action",
    kind: params.kind,
    asset_id: params.asset_id,
    effective_date: params.effective_date,
    source_document: params.source_document,
    effects: [...effects],
    ...(params.notes === undefined ? {} : { notes: params.notes }),
  }) as Draft<CorporateActionEvent>;

/**
 * A throw-away candidate, only to project it and read the positions it leaves.
 * The envelope is a fixed placeholder that no real identifier can collide with
 * (a generated ULID starts with a timestamp, never with zeros), and neither it
 * nor its fingerprint ever leaves this function: the probe is discarded with
 * the projection it produced.
 */
const PROBE = {
  schema_version: CURRENT_LEDGER_SCHEMA,
  id: "00000000000000000000000000",
  recorded_at: "1970-01-01T00:00:00.000Z",
  fingerprint: "probe",
} as const;

const positionsAfter = (
  events: readonly LedgerEvent[],
  params: CorporateActionParams,
  effects: readonly Effect[],
): ReturnType<typeof physicalPositions> => {
  const probe = { ...PROBE, ...eventOf(params, effects) } as unknown as CorporateActionEvent;
  return physicalPositions(projectLedger([...events, probe]));
};

/**
 * Fractions left in each account once `main` is applied. This is the piece that
 * is a business rule and not a convenience: what is sold, and in which account.
 */
const fractionsOf = (
  events: readonly LedgerEvent[],
  params: CorporateActionParams,
  main: readonly Effect[],
  asset: AssetId,
): FractionRow[] =>
  positionsAfter(events, params, main)
    .filter((row) => row.asset_id === asset)
    .map((row) => ({
      account_id: row.account_id,
      fraction: row.quantity.sub(Quantity.of(floorOf(row.quantity))),
    }))
    .filter((row) => row.fraction.isPositive())
    .map((row) => ({ account_id: row.account_id, quantity: row.fraction.toString() }));

/** Adds the forced sale of the leftovers, when a cash settlement was given. */
const withFractionalSale = (
  events: readonly LedgerEvent[],
  params: CorporateActionParams,
  main: readonly Effect[],
  asset: AssetId,
): CorporateActionDraft => {
  if (params.cash === undefined) {
    return { draft: eventOf(params, main), fractional: [], no_fractions: false };
  }
  const fractional = fractionsOf(events, params, main, asset);
  if (fractional.length === 0) {
    return { draft: eventOf(params, main), fractional: [], no_fractions: true };
  }
  const effects: Effect[] = [
    ...main,
    {
      op: "forced_sale",
      ...(asset === params.asset_id ? {} : { asset_id: asset }),
      per_account: withFees(fractional, params.fees),
      ...priceOf(params.cash),
    },
  ];
  return { draft: eventOf(params, effects), fractional, no_fractions: false };
};

/** Every account holding the asset: a liquidation sells all of it, everywhere. */
const holdersOf = (state: LedgerState, assetId: AssetId): AccountId[] =>
  physicalPositions(state)
    .filter((row) => row.asset_id === assetId)
    .map((row) => row.account_id);

const plain = (
  params: CorporateActionParams,
  effects: readonly Effect[],
): CorporateActionDraft => ({
  draft: eventOf(params, effects),
  fractional: [],
  no_fractions: false,
});

/**
 * The draft of a corporate action, with its effects composed from the
 * parameters and the fractions worked out against the real ledger.
 *
 * It does **not** validate the sequence against the `kind` — `projectLedger`
 * already does that with `checkEffectsAgainstKind`, and doing it twice would be
 * two places to keep in step. What it does guarantee is that the sequence it
 * builds is the one that `kind` admits.
 */
export const corporateActionDraft = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  params: CorporateActionParams,
): CorporateActionDraft => {
  const composed = compose(state, events, params);
  checkFees(sellingAccounts(composed.draft.effects), params.fees);
  return composed;
};

const compose = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  params: CorporateActionParams,
): CorporateActionDraft => {
  if (params.source_document.trim() === "") {
    fail("missing_source_document", "a corporate action needs its issuer document", {
      kind: params.kind,
    });
  }
  requireAsset(state, params.asset_id, "affected");
  const kind = params.kind;

  if (params.effects !== undefined) {
    return plain(params, params.effects);
  }

  const destination = (): AssetId =>
    requireAsset(state, required(params.to_asset_id, "to_asset_id", kind), "destination");
  const ratio = (): RatioString => required(params.ratio, "ratio", kind);

  switch (kind) {
    case "split":
      return plain(params, [{ op: "scale", ratio: ratio() }]);
    case "reverse_split":
      return withFractionalSale(events, params, [{ op: "scale", ratio: ratio() }], params.asset_id);
    case "merger": {
      const to = destination();
      return withFractionalSale(
        events,
        params,
        [{ op: "convert", to_asset_id: to, ratio: ratio() }],
        to,
      );
    }
    case "spin_off": {
      const to = destination();
      return withFractionalSale(
        events,
        params,
        [
          {
            op: "carve_out",
            to_asset_id: to,
            ratio: ratio(),
            cost_share: required(params.cost_share, "cost_share", kind),
          },
        ],
        to,
      );
    }
    case "fund_merger":
    case "share_class_change":
      return plain(params, [{ op: "convert", to_asset_id: destination(), ratio: ratio() }]);
    case "fund_liquidation":
    case "issuer_liquidation": {
      const cash = required(params.cash, "cash", kind);
      const entries: ForcedSaleEntry[] = holdersOf(state, params.asset_id).map((account_id) => ({
        account_id,
        quantity: "all",
      }));
      return plain(params, [
        { op: "forced_sale", per_account: withFees(entries, params.fees), ...priceOf(cash) },
      ]);
    }
    case "delisting":
      return plain(params, []);
    default:
      // `stock_dividend`, `crypto_fork`, `token_migration` and
      // `issuer_restructuring` have no wizard of their own: their sequences are
      // free enough that describing them with three parameters would be a
      // guess. They are composed by hand and passed in `effects`.
      return fail(
        "no_wizard_for_kind",
        `${kind} has no parameter form: pass its effects explicitly`,
        { kind },
      );
  }
};
