// Doubles of the two ports of prices, for the use cases of `quotes/`. The
// store is a map of texts with a lock that says whether it is held, so a test
// can prove that no source is ever called with the lock taken.

import type { CivilDate } from "../../src/dates/civil-date.js";
import type { DailyClose, PriceSource, SourceResult } from "../../src/ports/price-source.js";
import type { PriceStore, PriceTransaction } from "../../src/ports/price-store.js";
import type { QuoteSource } from "../../src/projections/prices.js";

export class MemoryPriceStore implements PriceStore {
  readonly files = new Map<string, string>();
  locked = false;
  transactions = 0;
  /** Runs inside every transaction, after its reads and before its writes: a second console. */
  interleave: (() => Promise<void>) | undefined;

  config = async () => this.files.get("config.json");
  symbols = async () => this.files.get("symbols.json");
  status = async () => this.files.get("_status.json");
  closes = async (assetId: string) => this.files.get(`${assetId}.jsonl`);

  private queue: Promise<unknown> = Promise.resolve();

  /** Like the lock of the folder with a short wait: one transaction at a time, the others wait. */
  transact<T>(work: (tx: PriceTransaction) => Promise<T>): Promise<T> {
    const run = this.queue.then(() => this.run(work));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async run<T>(work: (tx: PriceTransaction) => Promise<T>): Promise<T> {
    if (this.locked) {
      throw new Error("the lock is already held");
    }
    this.locked = true;
    this.transactions += 1;
    try {
      const tx: PriceTransaction = {
        config: this.config,
        symbols: this.symbols,
        status: this.status,
        closes: this.closes,
        appendCloses: async (assetId, lines) => {
          const before = this.files.get(`${assetId}.jsonl`) ?? "";
          this.files.set(
            `${assetId}.jsonl`,
            `${before}${lines.map((line) => `${line}\n`).join("")}`,
          );
        },
        writeStatus: async (text) => {
          this.files.set("_status.json", text);
        },
        writeSymbols: async (text) => {
          this.files.set("symbols.json", text);
        },
      };
      return await work(tx);
    } finally {
      this.locked = false;
    }
  }
}

export type Answer = SourceResult<DailyClose[]> | Error;

/** A source that answers from a script, and records every call and whether the lock was held. */
export class FakeSource implements PriceSource {
  readonly calls: { symbol: string; from: CivilDate; to: CivilDate; locked: boolean }[] = [];
  readonly currencyCalls: string[] = [];

  constructor(
    readonly name: QuoteSource,
    private readonly answer: (symbol: string, from: CivilDate, to: CivilDate) => Answer,
    private readonly store?: MemoryPriceStore,
    private readonly currency: (
      symbol: string,
    ) => SourceResult<string | undefined> | Error = () => ({
      ok: true,
      value: undefined,
    }),
  ) {}

  async dailyCloses(symbol: string, from: CivilDate, to: CivilDate) {
    this.calls.push({ symbol, from, to, locked: this.store?.locked === true });
    const answer = this.answer(symbol, from, to);
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  }

  async currencyOf(symbol: string) {
    this.currencyCalls.push(symbol);
    const answer = this.currency(symbol);
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  }
}

export const closes = (...pairs: [CivilDate, string][]): SourceResult<DailyClose[]> => ({
  ok: true,
  value: pairs.map(([date, close]) => ({ date, close })),
});

export const symbolsFile = (assets: Record<string, Record<string, unknown>>): string =>
  JSON.stringify({
    symbols_format: 1,
    assets: Object.fromEntries(
      Object.entries(assets).map(([id, entry]) => [
        id,
        {
          confirmed_at: "2027-01-01T00:00:00.000Z",
          // Contrasted with every source it names, unless the test says otherwise.
          currency_check: Object.fromEntries(
            ["eodhd", "alpha_vantage"]
              .filter((source) => entry[source] !== undefined)
              .map((source) => [source, { at: "2027-01-01T00:00:00.000Z" }]),
          ),
          ...entry,
        },
      ]),
    ),
  });
