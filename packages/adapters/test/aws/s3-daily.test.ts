// Feature 016, E2 (R22, R23, R31, R32; mutants 12, 13, 19 and 20): the stores
// of `reference/ecb/` and `prices/` in the bucket, with a conditional write
// per object and no lock: a cut between two writes of an activation of the
// ECB is never read as if it matched, and the next run undoes it; a conflict
// stops the run without retrying; a call reserved is never given back; the
// cloud never writes `symbols.json` nor purges.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type DownloadedHistory, updateEcbHistory } from "@atlas/domain/ecb";
import { cloudPriceConfigText } from "@atlas/domain/jobs";
import { type PriceSource, parseStatus, updatePrices } from "@atlas/domain/quotes";
import { describe, expect, it } from "vitest";
import type { ObjectStore } from "../../src/aws/object-store.js";
import { PriceKeyInvalid, priceKeyParameters, readPriceKeys } from "../../src/aws/price-keys.js";
import { EcbStoreConflict, S3EcbHistoryStore } from "../../src/aws/s3-ecb-store.js";
import {
  PriceStoreConflict,
  PriceStoreRefused,
  S3PriceStore,
} from "../../src/aws/s3-price-store.js";
import { SimulatedPriceSource } from "../../src/aws/simulated-prices.js";
import { EcbHistoryDamaged } from "../../src/ecb/history-store.js";
import { TestOnlyFakeS3 } from "./test-only-fake-s3.js";
import { TestOnlyFakeSsm } from "./test-only-fake-ssm.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../tests/fixtures/ecb");
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const download = (
  bytes: Uint8Array,
  source: "zip" | "api" = "zip",
  at = "2026-10-01T15:30:00.000Z",
): DownloadedHistory => ({
  source,
  bytes,
  url: source === "zip" ? "https://ecb.example/zip" : "https://ecb.example/api",
  fetched_at: at,
});

/** A history of the ZIP with one more day on top, the same rates below. */
const withNewDay = (csv: string, date = "2026-04-01"): Uint8Array => {
  const [header, first, ...rest] = csv.split("\n");
  const day = (first as string).replace(/^\d{4}-\d{2}-\d{2}/, date);
  return new TextEncoder().encode([header, day, first, ...rest].join("\n"));
};

const load = async () => new Uint8Array(await readFile(join(fixtures, "eurofxref-hist.csv")));

describe("reference/ecb/ in the bucket (R31)", () => {
  it("activates the first history with its manifest, and reads it back matched", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new S3EcbHistoryStore(s3);
    const bytes = await load();
    const meta = await store.activate(download(bytes));
    expect(meta).toMatchObject({ file: "eurofxref-hist.csv", source: "zip", sha256: sha(bytes) });
    expect(s3.keys().sort()).toEqual([
      "reference/ecb/eurofxref-hist.csv",
      "reference/ecb/manifest.json",
    ]);
    expect((await store.active())?.meta.sha256).toBe(sha(bytes));
    expect(s3.conditions.filter((c) => c.ifNoneMatch === "*").map((c) => c.key)).toEqual([
      "reference/ecb/eurofxref-hist.csv",
      "reference/ecb/manifest.json",
    ]);
  });

  it("keeps the history in force in previous/ before replacing it, and names it in the manifest", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new S3EcbHistoryStore(s3);
    const old = await load();
    await store.activate(download(old));
    const next = withNewDay(new TextDecoder().decode(old));
    await store.activate(download(next, "zip", "2026-10-02T15:30:00.000Z"));
    expect(s3.text("reference/ecb/previous/eurofxref-hist.csv")).toBe(
      new TextDecoder().decode(old),
    );
    const manifest = JSON.parse(s3.text("reference/ecb/manifest.json") as string);
    expect(manifest.previous).toMatchObject({
      file: "previous/eurofxref-hist.csv",
      sha256: sha(old),
    });
    expect(manifest.active.sha256).toBe(sha(next));
  });

  it("is never read as matching when cut between the file and the manifest, and the next run undoes it (mutant 19)", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new S3EcbHistoryStore(s3);
    const old = await load();
    await store.activate(download(old));
    s3.beforePut = (key) => {
      if (key === "reference/ecb/manifest.json") {
        throw new Error("the Lambda died here");
      }
    };
    await expect(
      store.activate(download(withNewDay(new TextDecoder().decode(old)))),
    ).rejects.toThrow("died");
    s3.beforePut = undefined;
    await expect(store.active()).rejects.toBeInstanceOf(EcbHistoryDamaged);
    expect(await store.recover()).toBe("undone");
    expect((await store.active())?.meta.sha256).toBe(sha(old));
    expect(await store.recover()).toBe("none");
  });

  it("leaves the history in force when cut after the backup, or with an orphan of another source", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new S3EcbHistoryStore(s3);
    const old = await load();
    await store.activate(download(old));
    s3.beforePut = (key) => {
      if (key === "reference/ecb/api-exr.csv") {
        throw new Error("cut after the backup");
      }
    };
    await expect(store.activate(download(new TextEncoder().encode("api"), "api"))).rejects.toThrow(
      "cut",
    );
    expect((await store.active())?.meta.sha256).toBe(sha(old));
    expect(await store.recover()).toBe("none");
  });

  it("says a history damaged beyond undoing, and writes nothing", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new S3EcbHistoryStore(s3);
    await store.activate(download(await load()));
    s3.seed("reference/ecb/eurofxref-hist.csv", "Date,USD,\n");
    const writes = s3.conditions.length;
    expect(await store.recover()).toBe("damaged");
    expect(s3.conditions.length).toBe(writes);
    s3.seed("reference/ecb/manifest.json", "not a manifest");
    expect(await store.recover()).toBe("damaged");
    await expect(store.active()).rejects.toBeInstanceOf(EcbHistoryDamaged);
    s3.seedBytes("reference/ecb/manifest.json", new Uint8Array([0xff]));
    await expect(store.active()).rejects.toBeInstanceOf(EcbHistoryDamaged);
  });

  it("keeps a rejected download apart, without touching the history in force", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new S3EcbHistoryStore(s3);
    const old = await load();
    await store.activate(download(old));
    const meta = await store.keepRejected(download(new TextEncoder().encode("bad"), "api"));
    expect(meta.file).toBe("rejected/2026-10-01T15-30-00-000Z-api-exr.csv");
    expect(s3.text(`reference/ecb/${meta.file}`)).toBe("bad");
    expect((await store.active())?.meta.sha256).toBe(sha(old));
    expect(JSON.parse(s3.text("reference/ecb/manifest.json") as string).rejected).toHaveLength(1);
    await expect(
      new S3EcbHistoryStore(new TestOnlyFakeS3()).keepRejected(download(old)),
    ).rejects.toBeInstanceOf(EcbHistoryDamaged);
  });

  it("stops at a conflict, never retrying: another writer wins (mutant 20)", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new S3EcbHistoryStore(s3);
    await store.activate(download(await load()));
    s3.conflictNext();
    await expect(
      store.activate(download(await load(), "zip", "2026-10-02T15:30:00.000Z")),
    ).rejects.toBeInstanceOf(EcbStoreConflict);
    const puts = s3.calls.filter((call) => call.startsWith("put"));
    expect(puts.at(-1)).toBe("putIfNoneMatch reference/ecb/previous/eurofxref-hist.csv");
    expect(s3.keys()).not.toContain("reference/ecb/previous/eurofxref-hist.csv");
  });

  it("lets one of two runs that verified the same history win, and never mixes them (review of PR #106, B1)", async () => {
    const s3 = new TestOnlyFakeS3();
    const old = await load();
    await new S3EcbHistoryStore(s3).activate(download(old));
    const text = new TextDecoder().decode(old);
    const nextA = withNewDay(text);
    const nextB = withNewDay(text, "2026-04-02");
    expect(sha(nextB)).not.toBe(sha(nextA));
    const deferred = () => {
      let open = () => {};
      const opened = new Promise<void>((resolve) => {
        open = resolve;
      });
      return { opened, open };
    };
    const aWroteFile = deferred();
    const bWroteFile = deferred();
    const aDone = deferred();
    /** The same bucket, with the pauses a test asks for before a read or a write. */
    const gated = (pause: {
      get?: (nth: number) => Promise<void>;
      put?: (key: string) => Promise<void>;
    }): ObjectStore => {
      let reads = 0;
      return {
        get: async (key) => {
          await pause.get?.(reads++);
          return s3.get(key);
        },
        list: (prefix) => s3.list(prefix),
        putIfNoneMatch: async (key, body) => {
          await pause.put?.(key);
          return s3.putIfNoneMatch(key, body);
        },
        putIfMatch: async (key, body, etag) => {
          await pause.put?.(key);
          return s3.putIfMatch(key, body, etag);
        },
      };
    };
    // The reviewer's order: A and B read M0 and verify the file in force; A
    // writes previous/ and its file; B reads again and writes its own; A
    // writes the manifest; B writes its own.
    const b = new S3EcbHistoryStore(
      gated({
        get: async (nth) => {
          if (nth >= 2) {
            await aWroteFile.opened;
          }
        },
        put: async (key) => {
          if (key === "reference/ecb/manifest.json") {
            bWroteFile.open();
            await aDone.opened;
          }
        },
      }),
    ).activate(download(nextB, "zip", "2026-10-02T15:31:00.000Z"));
    const settledB = b.then(
      () => "written",
      (error: unknown) => error,
    );
    void settledB.then(() => bWroteFile.open());
    const a = new S3EcbHistoryStore(
      gated({
        put: async (key) => {
          if (key === "reference/ecb/manifest.json") {
            aWroteFile.open();
            await bWroteFile.opened;
          }
        },
      }),
    ).activate(download(nextA, "zip", "2026-10-02T15:30:00.000Z"));
    const settledA = a.then(
      () => "written",
      (error: unknown) => error,
    );
    void settledA.then(() => aDone.open());
    const [resultA, resultB] = await Promise.all([settledA, settledB]);
    expect(resultA).toBe("written");
    expect(resultB).toBeInstanceOf(EcbStoreConflict);
    // What is in force is A's, whole: the file matches its manifest.
    const store = new S3EcbHistoryStore(s3);
    expect((await store.active())?.meta.sha256).toBe(sha(nextA));
    expect(await store.recover()).toBe("none");
  });

  it("rebuilds a damaged history from a new download, and only a damaged one (review of PR #106, B1 (b))", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new S3EcbHistoryStore(s3);
    const old = await load();
    const text = new TextDecoder().decode(old);
    await store.activate(download(old));
    await store.keepRejected(download(new TextEncoder().encode("bad"), "api"));
    // Not damaged: a rebuild is refused and writes nothing.
    const writes = s3.conditions.length;
    await expect(store.rebuild(download(old))).rejects.toBeInstanceOf(EcbStoreConflict);
    expect(s3.conditions.length).toBe(writes);
    // The reviewer's mixed state: the manifest records A, the file holds B,
    // previous/ holds the history before both.
    await store.activate(download(withNewDay(text), "zip", "2026-10-02T15:30:00.000Z"));
    s3.seed(
      "reference/ecb/eurofxref-hist.csv",
      new TextDecoder().decode(withNewDay(text, "2026-04-02")),
    );
    expect(await store.recover()).toBe("damaged");
    const zip = withNewDay(text, "2026-04-03");
    const meta = await store.rebuild(download(zip, "zip", "2026-10-03T07:00:00.000Z"));
    expect(meta).toMatchObject({ file: "eurofxref-hist.csv", source: "zip", sha256: sha(zip) });
    expect((await store.active())?.meta.sha256).toBe(sha(zip));
    expect(await store.recover()).toBe("none");
    const manifest = JSON.parse(s3.text("reference/ecb/manifest.json") as string);
    // A new generation: nothing of the damaged one is named as previous, and
    // the rejected downloads are still said.
    expect(manifest.previous).toBeUndefined();
    expect(manifest.rejected).toHaveLength(1);
  });

  it("gives the generations left to compare with, newest first (review of PR #106, R2-N1)", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new S3EcbHistoryStore(s3);
    expect(await store.generations()).toEqual([]);
    const old = await load();
    await store.activate(download(old));
    await store.activate(
      download(withNewDay(new TextDecoder().decode(old)), "zip", "2026-10-02T15:30:00.000Z"),
    );
    s3.seed("reference/ecb/eurofxref-hist.csv", "damaged");
    expect(await store.generations()).toEqual([
      { text: "damaged", source: "zip" },
      { text: new TextDecoder().decode(old), source: "zip" },
    ]);
    // With no manifest that reads: both names of both, the API's as such.
    s3.seed("reference/ecb/manifest.json", "not a manifest");
    s3.seed("reference/ecb/api-exr.csv", "api");
    expect((await store.generations()).map((generation) => generation.source)).toEqual([
      "zip",
      "api",
      "zip",
    ]);
  });

  it("rebuilds over a manifest that does not read, and stops at another writer", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new S3EcbHistoryStore(s3);
    const old = await load();
    await store.activate(download(old));
    s3.seed("reference/ecb/manifest.json", "not a manifest");
    s3.conflictNext();
    await expect(store.rebuild(download(old))).rejects.toBeInstanceOf(EcbStoreConflict);
    expect(await store.recover()).toBe("damaged");
    await store.rebuild(download(old));
    expect((await store.active())?.meta.sha256).toBe(sha(old));
    expect(JSON.parse(s3.text("reference/ecb/manifest.json") as string).rejected).toEqual([]);
  });

  it("runs the update of the domain: accepts the same history, never overwrites a published rate", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new S3EcbHistoryStore(s3);
    const old = await load();
    const accepted = await updateEcbHistory(
      { source: { download: async () => download(old) }, store },
      { firstRateDate: undefined, today: "2026-10-01" },
    );
    expect(accepted.kind).toBe("accepted");
    const changed = new TextDecoder()
      .decode(old)
      .replace(/^(\d{4}-\d{2}-\d{2}),1\.1091,/m, "$1,1.2000,");
    const rejected = await updateEcbHistory(
      {
        source: {
          download: async () =>
            download(new TextEncoder().encode(changed), "zip", "2026-10-02T15:30:00.000Z"),
        },
        store,
      },
      { firstRateDate: undefined, today: "2026-10-02" },
    );
    expect(rejected).toMatchObject({ kind: "rejected", total: 1 });
    expect((await store.active())?.meta.sha256).toBe(sha(old));
  });
});

const CONFIG = cloudPriceConfigText({
  sources: ["eodhd"],
  dailyCalls: { eodhd: 2, alpha_vantage: 0 },
  failureThreshold: 3,
});

describe("prices/ in the bucket (R22, R23, R32)", () => {
  it("gives the configuration of the function, never a config.json of the bucket (mutant 13)", async () => {
    const s3 = new TestOnlyFakeS3();
    s3.seed("prices/config.json", '{"daily_calls":{"eodhd":20}}');
    const store = new S3PriceStore(s3, CONFIG);
    expect(await store.config()).toBe(CONFIG);
    expect(s3.calls.filter((call) => call.includes("config.json"))).toEqual([]);
  });

  it("reads and writes each file under prices/, the closes by their encoded name", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new S3PriceStore(s3, CONFIG);
    expect(await store.symbols()).toBeUndefined();
    await store.transact(async (tx) => {
      await tx.appendCloses("a/b", ['{"x":1}']);
      await tx.writeStatus('{"status_format":1}');
    });
    expect(s3.text("prices/a%2Fb.jsonl")).toBe('{"x":1}\n');
    expect(await store.closes("a/b")).toBe('{"x":1}\n');
    expect(await store.status()).toBe('{"status_format":1}');
    s3.seed("prices/ast.jsonl", '{"y":1}');
    await store.transact((tx) => tx.appendCloses("ast", ['{"y":2}']));
    expect(s3.text("prices/ast.jsonl")).toBe('{"y":1}\n{"y":2}\n');
  });

  it("writes each file over what the same transaction read: another writer in between is a conflict", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new S3PriceStore(s3, CONFIG);
    s3.seed("prices/_status.json", "{}");
    await expect(
      store.transact(async (tx) => {
        await tx.status();
        s3.seed("prices/_status.json", '{"other":true}');
        await tx.writeStatus('{"mine":true}');
      }),
    ).rejects.toBeInstanceOf(PriceStoreConflict);
    expect(s3.text("prices/_status.json")).toBe('{"other":true}');
    await expect(
      store.transact(async (tx) => {
        await tx.writeStatus('{"first":true}');
        s3.seed("prices/_status.json", '{"other":true}');
        await tx.writeStatus('{"second":true}');
      }),
    ).rejects.toBeInstanceOf(PriceStoreConflict);
    await store.transact(async (tx) => {
      await tx.writeStatus('{"first":true}');
      await tx.writeStatus('{"second":true}');
    });
    expect(s3.text("prices/_status.json")).toBe('{"second":true}');
  });

  it("never writes symbols.json nor purges a file (Q1, mutant 13)", async () => {
    const s3 = new TestOnlyFakeS3();
    const store = new S3PriceStore(s3, CONFIG);
    await expect(store.transact((tx) => tx.writeSymbols("{}"))).rejects.toEqual(
      new PriceStoreRefused("cloud_symbols_read_only"),
    );
    await expect(store.transact((tx) => tx.rewriteCloses("ast", []))).rejects.toEqual(
      new PriceStoreRefused("cloud_purge_refused"),
    );
    expect(s3.keys()).toEqual([]);
  });

  it("keeps a call reserved when the run stops at a conflict: never fewer than were made (mutant 12)", async () => {
    const { generateLedger, projectLedger, settingsAt } = await import("@atlas/domain");
    const { downloadPlan, priceFileName } = await import("@atlas/domain/quotes");
    const state = projectLedger(generateLedger({ seed: 7 }), { asOf: "2026-10-01" });
    const settings = settingsAt(state, "2026-10-01").settings;
    const [first] = downloadPlan(state, settings);
    const assetId = (first as { asset_id: string }).asset_id;
    const s3 = new TestOnlyFakeS3();
    const store = new S3PriceStore(s3, CONFIG);
    s3.seed(
      "prices/symbols.json",
      JSON.stringify({
        symbols_format: 2,
        assets: {
          [assetId]: {
            eodhd: "ASSET.XETRA",
            currencies: { eodhd: "EUR" },
            confirmed_at: "2026-09-01T00:00:00.000Z",
            currency_check: { eodhd: { at: "2026-09-01T00:00:00.000Z" } },
          },
        },
      }),
    );
    const called: string[] = [];
    const source: PriceSource = {
      name: "eodhd",
      dailyCloses: async (symbol) => {
        called.push(symbol);
        return { ok: true, value: [{ date: "2026-09-30", close: "100" }] };
      },
      currencyOf: async () => ({ ok: true, value: undefined }),
    };
    // Another run writes the file of closes at the moment this one does (a 409).
    s3.beforePut = (key) => {
      if (key === `prices/${priceFileName(assetId)}`) {
        s3.conflictNext();
      }
    };
    await expect(
      updatePrices({
        state,
        settings,
        today: "2026-10-01",
        now: () => new Date(Date.parse("2026-10-01T05:00:00.000Z")),
        store,
        sources: { eodhd: source },
        symbols: "read_only",
      }),
    ).rejects.toBeInstanceOf(PriceStoreConflict);
    expect(called).toEqual(["ASSET.XETRA"]);
    expect(parseStatus(s3.text("prices/_status.json")).sources.eodhd?.calls_at).toHaveLength(1);
    expect(s3.text(`prices/${priceFileName(assetId)}`)).toBeUndefined();
  });

  it("gives the simulated source of dev a close of 100 for every weekday asked, and calls nothing", async () => {
    const source = new SimulatedPriceSource();
    expect(source.name).toBe("eodhd");
    expect(await source.dailyCloses("X", "2026-10-02", "2026-10-06")).toEqual({
      ok: true,
      value: [
        { date: "2026-10-02", close: "100" },
        { date: "2026-10-05", close: "100" },
        { date: "2026-10-06", close: "100" },
      ],
    });
    expect(await source.currencyOf()).toEqual({ ok: true, value: undefined });
  });
});

describe("the keys of the sources in SSM", () => {
  it("reads the two SecureString, a missing one as no key, and says an invalid one by its source only", async () => {
    const ssm = new TestOnlyFakeSsm();
    const names = priceKeyParameters("/atlas/prod/");
    expect(names).toEqual({
      eodhd: "/atlas/prod/prices/eodhd-key",
      alpha_vantage: "/atlas/prod/prices/alpha-vantage-key",
    });
    expect(await readPriceKeys(ssm, "/atlas/prod/")).toEqual({});
    ssm.set(names.eodhd, "sentinel-key-of-eodhd");
    expect(await readPriceKeys(ssm, "/atlas/prod/")).toEqual({ eodhd: "sentinel-key-of-eodhd" });
    ssm.set(names.alpha_vantage, "a key with spaces");
    const error = await readPriceKeys(ssm, "/atlas/prod/").catch((e) => e);
    expect(error).toBeInstanceOf(PriceKeyInvalid);
    expect(error.source).toBe("alpha_vantage");
    expect(String(error.message)).not.toContain("spaces");
  });
});
