// atlas add buy|sell|transfer|dividend|interest|fx|cash-in|cash-out|fee|valuation

import type { Flags } from "../args.js";
import { UsageError } from "../args.js";
import type { Context } from "../context.js";
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
const CASH = ["account", "value-date", "amount", "currency", "fx-rate", "notes"];

export const ADD_SPECS: Record<string, DraftSpec> = {
  buy: {
    type: "buy",
    flags: [...COMMON, "asset", "quantity", "unit-price", "amount", "order"],
    defaults: { fee: "0", source: "manual" },
  },
  sell: {
    type: "sell",
    flags: [...COMMON, "asset", "quantity", "unit-price", "amount", "order", "withholding"],
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
      "fee",
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
    flags: ["account", "value-date", "amount", "currency", "fx-rate", "description"],
  },
  valuation: {
    type: "valuation",
    flags: ["account", "asset", "date", "quantity", "unit-value", "currency", "fx-rate", "source"],
    defaults: { source: "manual" },
  },
};

export const addCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const spec = ADD_SPECS[positionals[1] ?? ""];
  if (spec === undefined) {
    throw new UsageError(`uso: atlas add ${Object.keys(ADD_SPECS).join("|")} …`);
  }
  await confirmAndRecord(ctx, draftFromFlags(spec, flags));
  return 0;
};
