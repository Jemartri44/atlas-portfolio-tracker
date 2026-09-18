// atlas add buy|sell|transfer|dividend|interest|fx|cash-in|cash-out|fee|valuation

import { bucketStats, DomainError, settingsAt, todayInMadrid } from "@atlas/domain";
import type { Flags } from "../args.js";
import { UsageError } from "../args.js";
import { type Context, describeWarnings } from "../context.js";
import { confirmAndRecord, type DraftSpec, draftFromFlags, previewCandidate } from "./shared.js";

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
    flags: [...COMMON, "asset", "quantity", "unit-price", "amount", "order", "thesis"],
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
const tradeNotes = async (ctx: Context, draft: Record<string, unknown>): Promise<string[]> => {
  const assetId = draft.asset_id as string;
  try {
    const { warnings, state, events } = await previewCandidate(ctx, draft, [assetId]);
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
  const draft = draftFromFlags(spec, flags);
  const notes = name === "buy" || name === "sell" ? await tradeNotes(ctx, draft) : [];
  await confirmAndRecord(ctx, draft, notes);
  return 0;
};
