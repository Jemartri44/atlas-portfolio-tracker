// Runs the CLI in-process against an in-memory ledger with a fixed clock.

import { MemoryLedgerStore } from "@atlas/adapters";
import type { LedgerEvent, UseCaseDeps } from "@atlas/domain";
import type { Io } from "../src/context.js";
import { run } from "../src/main.js";

export interface Harness {
  store: MemoryLedgerStore;
  out: string[];
  err: string[];
  /** Runs one command; `argv` is already split. Returns the exit code. */
  exec(argv: string[]): Promise<number>;
  text(): string;
  reset(): void;
}

export interface HarnessOptions {
  events?: LedgerEvent[];
  /** Answer given to confirmations; `undefined` simulates a non-interactive terminal. */
  confirm?: boolean;
  instant?: string;
}

export const harness = (options: HarnessOptions = {}): Harness => {
  const store = MemoryLedgerStore.fromEvents(options.events ?? []);
  const out: string[] = [];
  const err: string[] = [];
  let counter = 0;
  const deps: UseCaseDeps = {
    store,
    clock: { now: () => new Date(options.instant ?? "2027-08-30T10:00:00.000Z") },
    random: (target) => {
      counter += 1;
      target.fill(counter % 256);
    },
  };
  const io: Io = {
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    confirm: async () => options.confirm,
  };
  return {
    store,
    out,
    err,
    exec: (argv) => run(argv, io, () => deps),
    text: () => [...out, ...err].join("\n"),
    reset: () => {
      out.length = 0;
      err.length = 0;
    },
  };
};

const envelope = (id: string, type: LedgerEvent["type"]) => ({
  schema_version: 1,
  id,
  recorded_at: "2026-09-01T18:00:00.000Z",
  type,
});

/** Two core accounts and three assets, as in the quickstart. */
export const seed = (): LedgerEvent[] => [
  {
    ...envelope("01ARYZ6S41TSV4RRFFQ6900000", "account_created"),
    type: "account_created",
    account_id: "acc_fund",
    name: "Fondos",
    platform: "myinvestor",
    book: "core",
    base_currency: "EUR",
    country: "ES",
    active: true,
  },
  {
    ...envelope("01ARYZ6S41TSV4RRFFQ6900001", "account_created"),
    type: "account_created",
    account_id: "acc_etf",
    name: "ETC",
    platform: "ibkr",
    book: "core",
    base_currency: "EUR",
    country: "IE",
    active: true,
  },
  {
    ...envelope("01ARYZ6S41TSV4RRFFQ6900002", "asset_created"),
    type: "asset_created",
    asset_id: "ast_world",
    asset_type: "fund",
    book: "core",
    asset_class: "equity",
    isin: "XX0000000001",
    name: "World Index",
    currency: "EUR",
    transferable: true,
    active: true,
  },
  {
    ...envelope("01ARYZ6S41TSV4RRFFQ6900003", "asset_created"),
    type: "asset_created",
    asset_id: "ast_bonds",
    asset_type: "fund",
    book: "core",
    asset_class: "fixed_income",
    isin: "XX0000000003",
    name: "Bond Index",
    currency: "EUR",
    transferable: true,
    active: true,
  },
  {
    ...envelope("01ARYZ6S41TSV4RRFFQ6900004", "asset_created"),
    type: "asset_created",
    asset_id: "ast_gold",
    asset_type: "etc",
    book: "core",
    asset_class: "gold",
    isin: "XX0000000002",
    name: "Gold ETC",
    currency: "USD",
    transferable: false,
    active: true,
  },
];

/** The seed plus a bucket account and a bucket asset, for thesis tests. */
export const bucketSeed = (): LedgerEvent[] => [
  ...seed(),
  {
    ...envelope("01ARYZ6S41TSV4RRFFQ6900005", "account_created"),
    type: "account_created",
    account_id: "acc_bucket",
    name: "Cubo",
    platform: "ibkr",
    book: "bucket",
    base_currency: "EUR",
    country: "IE",
    active: true,
  },
  {
    ...envelope("01ARYZ6S41TSV4RRFFQ6900006", "asset_created"),
    type: "asset_created",
    asset_id: "ast_spec",
    asset_type: "stock",
    book: "bucket",
    ticker: "SPEC",
    name: "Spec Inc",
    currency: "USD",
    transferable: false,
    active: true,
  },
];

export const BUY_WORLD = [
  "add",
  "buy",
  "--account",
  "acc_fund",
  "--asset",
  "ast_world",
  "--trade-date",
  "2026-09-01",
  "--value-date",
  "2026-09-02",
  "--quantity",
  "10.123456",
  "--amount",
  "1000",
  "--currency",
  "EUR",
  "--fx-rate",
  "1",
  "--fx-rate-date",
  "2026-09-02",
  "--yes",
];

export const BUY_GOLD = [
  "add",
  "buy",
  "--account",
  "acc_etf",
  "--asset",
  "ast_gold",
  "--trade-date",
  "2026-12-30",
  "--value-date",
  "2027-01-02",
  "--quantity",
  "5",
  "--unit-price",
  "200",
  "--fee",
  "1.5",
  "--currency",
  "USD",
  "--fx-rate",
  "1.0850",
  "--fx-rate-date",
  "2026-12-30",
  "--yes",
];

export const SELL_GOLD = [
  "add",
  "sell",
  "--account",
  "acc_etf",
  "--asset",
  "ast_gold",
  "--trade-date",
  "2026-12-31",
  "--value-date",
  "2027-01-04",
  "--quantity",
  "2",
  "--unit-price",
  "210",
  "--fee",
  "1",
  "--currency",
  "USD",
  "--fx-rate",
  "1.0900",
  "--fx-rate-date",
  "2026-12-31",
  "--yes",
];

/** Id of the n-th event in the store (0-based). */
export const idAt = async (store: MemoryLedgerStore, index: number): Promise<string> =>
  ((await store.load()).events[index] as LedgerEvent).id;
