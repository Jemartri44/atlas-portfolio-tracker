// Updating the stored history (ADR-0029, points 1-3 and 6), over doubles of
// the two ports. Fail safe: nothing is written before the download reads.

import { describe, expect, it } from "vitest";
import { firstRateDateOf } from "../../src/ecb/ledger-rates.js";
import { updateEcbHistory } from "../../src/ecb/update-history.js";
import { ValidationError } from "../../src/errors.js";
import type {
  DownloadedHistory,
  EcbHistoryStore,
  StoredHistory,
  StoredHistoryMeta,
} from "../../src/ports/fx-rate-source.js";
import { ecbFixture } from "../fixtures-path.js";
import { SAMPLES } from "../samples.js";

const encoder = new TextEncoder();
const text = ecbFixture("eurofxref-hist.csv");

const download = (content: string, extra: Partial<DownloadedHistory> = {}): DownloadedHistory => ({
  source: "zip",
  bytes: encoder.encode(content),
  url: "https://example.invalid/hist.zip",
  fetched_at: "2026-09-24T10:00:00.000Z",
  ...extra,
});

class MemoryHistoryStore implements EcbHistoryStore {
  current: StoredHistory | undefined;
  readonly rejected: DownloadedHistory[] = [];
  writes = 0;

  constructor(initial?: string) {
    this.current =
      initial === undefined ? undefined : { meta: this.metaOf(download(initial)), text: initial };
  }

  private metaOf(next: DownloadedHistory): StoredHistoryMeta {
    return {
      file: "eurofxref-hist.csv",
      source: next.source,
      url: next.url,
      fetched_at: next.fetched_at,
      sha256: "x",
    };
  }

  async active(): Promise<StoredHistory | undefined> {
    return this.current;
  }

  async activate(next: DownloadedHistory): Promise<StoredHistoryMeta> {
    this.writes += 1;
    this.current = { meta: this.metaOf(next), text: new TextDecoder().decode(next.bytes) };
    return this.current.meta;
  }

  async keepRejected(next: DownloadedHistory): Promise<StoredHistoryMeta> {
    this.writes += 1;
    this.rejected.push(next);
    return { ...this.metaOf(next), file: "rejected.csv" };
  }
}

const options = { firstRateDate: undefined, today: "2026-03-31" };

describe("updateEcbHistory", () => {
  it("stores the first download and says how many days and until when", async () => {
    const store = new MemoryHistoryStore();
    const result = await updateEcbHistory(
      { source: { download: async () => download(text) }, store },
      options,
    );
    expect(result).toMatchObject({
      kind: "accepted",
      newDays: 127,
      latest: "2026-03-31",
      calendar: [],
    });
    expect(store.current?.text).toBe(text);
  });

  it("says why the ZIP was not used when the API was", async () => {
    const store = new MemoryHistoryStore();
    const api = ecbFixture("api-exr.csv");
    const result = await updateEcbHistory(
      {
        source: { download: async () => download(api, { source: "api", zip_failure: "HTTP 503" }) },
        store,
      },
      options,
    );
    expect(result).toMatchObject({ kind: "accepted", zip_failure: "HTTP 503" });
    expect(store.current?.meta.source).toBe("api");
  });

  it("keeps apart a download that changes a published rate, and the previous stays in force (mutant 21)", async () => {
    const store = new MemoryHistoryStore(text);
    const before = store.current;
    const changed = text.replace(",0.8595,", ",0.8596,");
    const result = await updateEcbHistory(
      { source: { download: async () => download(changed) }, store },
      options,
    );
    expect(result).toMatchObject({
      kind: "rejected",
      total: 1,
      active: before?.meta,
      kept: { file: "rejected.csv" },
    });
    expect(store.current).toBe(before);
    expect(store.rejected).toHaveLength(1);
  });

  it("writes nothing when the download fails or does not read as a history", async () => {
    const store = new MemoryHistoryStore(text);
    await expect(
      updateEcbHistory(
        { source: { download: async () => Promise.reject(new Error("sin red")) }, store },
        options,
      ),
    ).rejects.toThrow("sin red");
    await expect(
      updateEcbHistory(
        { source: { download: async () => download("<html>no</html>") }, store },
        options,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.writes).toBe(0);
    expect(store.current?.text).toBe(text);
  });

  it("warns, never blocks, where the calendar disagrees in the years of the ledger", async () => {
    const store = new MemoryHistoryStore();
    const missing = text.replace(/^2026-01-05.*\n/m, "");
    const result = await updateEcbHistory(
      { source: { download: async () => download(missing) }, store },
      { firstRateDate: "2026-01-02", today: "2026-03-31" },
    );
    expect(result).toMatchObject({
      kind: "accepted",
      calendar: [{ date: "2026-01-05", kind: "working_day_without_publication" }],
    });
    expect(store.current?.text).toBe(missing);
  });
});

describe("firstRateDateOf", () => {
  it("finds the earliest ECB rate date of the ledger through the schema's enumeration", () => {
    expect(firstRateDateOf([])).toBeUndefined();
    const events = [
      { ...SAMPLES.buy, fx_rate_date: "2027-03-01" },
      { ...SAMPLES.valuation, fx_rate_date: "2026-12-31" },
      SAMPLES.account_created,
      { ...SAMPLES.fx_exchange, fx_rate_date: "2027-01-04" },
    ];
    expect(firstRateDateOf(events as never)).toBe("2026-12-31");
  });
});
