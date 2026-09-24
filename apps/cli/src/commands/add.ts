// atlas add buy|sell|transfer|dividend|interest|fx|cash-in|cash-out|fee|valuation

import {
  bucketStats,
  DomainError,
  type Draft,
  previewEvent,
  settingsAt,
  todayInMadrid,
} from "@atlas/domain";
import type { Flags } from "../args.js";
import { UsageError } from "../args.js";
import { type Context, describeWarnings, EXIT } from "../context.js";
import { confirmRates, rateDraft } from "./rates.js";
import { confirmAndRecord, type DraftSpec, draftFromFlags } from "./shared.js";

const COMMON = [
  "account",
  "trade-date",
  "value-date",
  "currency",
  "fx-rate",
  "fx-rate-date",
  "fee",
  "broker-ref",
  "source",
  "notes",
];
const CASH = ["account", "value-date", "amount", "currency", "fx-rate", "fx-rate-date", "notes"];

export const ADD_SPECS: Record<string, DraftSpec> = {
  buy: {
    type: "buy",
    flags: [
      ...COMMON,
      "asset",
      "quantity",
      "unit-price",
      "amount",
      "order",
      "thesis",
      "broker-settled-eur",
    ],
    defaults: { fee: "0", source: "manual" },
  },
  sell: {
    type: "sell",
    flags: [
      ...COMMON,
      "asset",
      "quantity",
      "unit-price",
      "amount",
      "order",
      "withholding",
      "thesis",
      "broker-settled-eur",
    ],
    defaults: { fee: "0", source: "manual" },
  },
  transfer: {
    type: "transfer",
    flags: [
      "request",
      "from-account",
      "from-asset",
      "quantity-out",
      "nav-out",
      "value-date-out",
      "to-account",
      "to-asset",
      "quantity-in",
      "nav-in",
      "value-date-in",
      "notes",
    ],
  },
  dividend: {
    type: "dividend",
    flags: [
      "account",
      "asset",
      "value-date",
      "gross",
      "withholding-origin",
      "withholding-spain",
      "currency",
      "fx-rate",
      "fx-rate-date",
      "source-country",
      "per-unit",
      "broker-ref",
      "notes",
      "broker-settled-eur",
    ],
    defaults: { withholding_origin: "0", withholding_spain: "0" },
  },
  interest: {
    type: "interest",
    flags: [
      "account",
      "value-date",
      "gross",
      "withholding-spain",
      "currency",
      "fx-rate",
      "fx-rate-date",
      "broker-ref",
      "notes",
      "broker-settled-eur",
    ],
    defaults: { withholding_spain: "0" },
  },
  fx: {
    type: "fx_exchange",
    flags: [
      "account",
      "value-date",
      "sold-amount",
      "sold-currency",
      "bought-amount",
      "bought-currency",
      "fee",
      "fee-currency",
      "fx-rate-sold",
      "fx-rate-bought",
      "fx-rate-date",
      "broker-ref",
      "notes",
    ],
    defaults: { fee: "0" },
  },
  // A swap is neither a buy nor a transfer, and the flags say so: two market
  // values, because article 37.1.h takes the greater of the two (ADR-0021).
  swap: {
    type: "swap",
    flags: [
      "account",
      "trade-date",
      "value-date",
      "from-asset",
      "quantity-out",
      "market-value-out",
      "to-asset",
      "quantity-in",
      "market-value-in",
      "currency",
      "fx-rate",
      "fx-rate-date",
      "fee",
      "thesis",
      "broker-ref",
      "source",
      "notes",
    ],
    defaults: { fee: "0", source: "manual" },
  },
  "cash-in": { type: "cash_deposit", flags: CASH },
  "cash-out": { type: "cash_withdrawal", flags: CASH },
  fee: {
    type: "standalone_fee",
    flags: [
      "account",
      "value-date",
      "amount",
      "currency",
      "fx-rate",
      "fx-rate-date",
      "description",
      "fee-kind",
      "broker-settled-eur",
    ],
  },
  valuation: {
    type: "valuation",
    flags: [
      "account",
      "asset",
      "date",
      "quantity",
      "unit-value",
      "currency",
      "fx-rate",
      "fx-rate-date",
      "source",
    ],
    defaults: { source: "manual" },
  },
};

/**
 * What the user has to see **before** confirming a trade: the warnings the event
 * itself raises — above all the wash-sale one, which is the most expensive
 * mistake in active trading — and, on a bucket account, the stop-loss rule.
 *
 * Best effort on purpose: if projecting the candidate fails, nothing is printed
 * and `recordEvent` raises the same error right after, with its own message.
 * A preview must never turn into a worse error than the one that follows.
 */
/** The assets an operation touches: one for a buy or a sell, two for a swap. */
const assetsOf = (draft: Record<string, unknown>): string[] =>
  [draft.asset_id, draft.from_asset_id, draft.to_asset_id].filter(
    (value): value is string => typeof value === "string",
  );

const tradeNotes = async (ctx: Context, draft: Record<string, unknown>): Promise<string[]> => {
  try {
    const { warnings, state, events } = await previewEvent(ctx.deps, draft as unknown as Draft, {
      assets: assetsOf(draft),
    });
    const notes = describeWarnings(warnings);
    const account = state.accounts.get(draft.account_id as string);
    if (account?.book === "bucket") {
      const date = todayInMadrid(ctx.deps.clock);
      const { controls } = bucketStats(state, events, date, settingsAt(state, date).settings);
      notes.push(
        ...describeWarnings(
          controls.warnings.filter((warning) => warning.code === "bucket_stop_loss_reached"),
        ),
      );
    }
    return notes;
  } catch (error) {
    if (error instanceof DomainError) {
      return [];
    }
    throw error;
  }
};

export const addCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const name = positionals[1] ?? "";
  const spec = ADD_SPECS[name];
  if (spec === undefined) {
    throw new UsageError(`uso: atlas add ${Object.keys(ADD_SPECS).join("|")} …`);
  }
  if (name === "transfer" && flags.has("fee")) {
    throw new UsageError(
      "un traspaso no lleva comisión: registra el cargo del depositario con `atlas add fee` (standalone_fee)",
    );
  }
  const rated = await rateDraft(ctx, draftFromFlags(spec, flags));
  const draft = rated.draft;
  if (rated.waiting) {
    for (const note of rated.notes) {
      ctx.io.out(note);
    }
    return EXIT.domain;
  }
  // A swap shows them too: it is a disposal and an acquisition at once, so both
  // halves of the wash-sale rule can fire and the user has to see them before
  // saying yes, which is the only moment the warning is still useful.
  const notes =
    name === "buy" || name === "sell" || name === "swap" ? await tradeNotes(ctx, draft) : [];
  if (!(await confirmRates(ctx, rated.mismatches))) {
    ctx.io.out("Cancelado.");
    return 0;
  }
  await confirmAndRecord(ctx, draft, [...rated.notes, ...notes]);
  return 0;
};
