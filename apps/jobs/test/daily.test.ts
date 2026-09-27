// Feature 016, E2 (R21-R33; mutants 11-21): the daily tasks of the cloud end
// to end over the doubles — the ECB and the closes into the bucket, with
// the network of the sources simulated address by address — and their
// findings sent by the mail function only, once per streak.

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { encodeLine } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeS3 } from "../../../packages/adapters/test/aws/test-only-fake-s3.js";
import { TestOnlyFakeSsm } from "../../../packages/adapters/test/aws/test-only-fake-ssm.js";
import { catalogue, LedgerBuilder } from "../../../packages/domain/test/ledger-builder.js";
import { MAIL_ENV, RECIPIENT, sentinelLedger, setupJobs } from "./harness.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/ecb");
const KEY = "sentinel-key-of-eodhd";

const ECB_ENV = {
  ATLAS_ENV: "prod",
  ATLAS_DATA_BUCKET: "atlas-prod-data-test",
  ATLAS_JOBS: "ecb_update",
  ATLAS_JOB_MAX_RUN_SECONDS: "300",
};
const PRICES_ENV = {
  ATLAS_ENV: "prod",
  ATLAS_DATA_BUCKET: "atlas-prod-data-test",
  ATLAS_JOBS: "prices_update",
  ATLAS_JOB_MAX_RUN_SECONDS: "900",
  ATLAS_PRICE_SOURCES: "eodhd,alpha_vantage",
  ATLAS_PRICES_EODHD_DAILY_CALLS: "18",
  ATLAS_PRICES_ALPHA_VANTAGE_DAILY_CALLS: "23",
  ATLAS_PRICES_FAILURE_THRESHOLD: "3",
};

const text = (body: string, status = 200) => Promise.resolve(new Response(body, { status }));

/** The ECB: the ZIP is down, the API answers `csv`. */
const ecbNetwork = (csv: string) => (url: string) =>
  url.includes("eurofxref-hist.zip") ? text("gone", 503) : text(csv);

const SYMBOLS = JSON.stringify({
  symbols_format: 2,
  assets: {
    ast_world: {
      eodhd: "WORLD.XETRA",
      currencies: { eodhd: "EUR" },
      confirmed_at: "2026-09-01T00:00:00.000Z",
      currency_check: { eodhd: { at: "2026-09-01T00:00:00.000Z" } },
    },
    ast_bonds: {
      eodhd: "BONDS.XETRA",
      currencies: { eodhd: "EUR" },
      confirmed_at: "2026-09-01T00:00:00.000Z",
    },
    // In the correspondence and not in the ledger: never downloaded (R33, mutant 21).
    ast_stranger: {
      eodhd: "STRANGER.XETRA",
      currencies: { eodhd: "EUR" },
      confirmed_at: "2026-09-01T00:00:00.000Z",
      currency_check: { eodhd: { at: "2026-09-01T00:00:00.000Z" } },
    },
  },
});

/** EODHD answers a close of every symbol for the day before today; anything else is a failure. */
const eodhd =
  (status = 200) =>
  (url: string) =>
    url.startsWith("https://eodhd.com/api/eod/")
      ? text(status === 200 ? '[{"date":"2026-09-30","close":101.5}]' : "no", status)
      : Promise.reject(new Error(`unexpected ${url}`));

const pricesJobs = (
  options: { keys?: boolean; status?: number; env?: Record<string, string> } = {},
) => {
  const s3 = new TestOnlyFakeS3();
  const ssm = new TestOnlyFakeSsm();
  s3.seed("ledger/ledger.jsonl", sentinelLedger());
  s3.seed("prices/symbols.json", SYMBOLS);
  ssm.set("/atlas/prod/mail/recipient", RECIPIENT);
  if (options.keys !== false) {
    ssm.set("/atlas/prod/prices/eodhd-key", KEY);
  }
  const jobs = setupJobs({ env: options.env ?? PRICES_ENV, s3, ssm, fetch: eodhd(options.status) });
  return { s3, ssm, jobs };
};

const recordOf = (s3: TestOnlyFakeS3, key: string) => JSON.parse(s3.text(key) as string);

describe("the daily task of the ECB (R31; ADR-0029)", () => {
  it("downloads the history, the API when the ZIP fails, and makes it the one in force, sending nothing", async () => {
    const csv = await readFile(join(fixtures, "api-exr.csv"), "utf8");
    const jobs = setupJobs({ env: ECB_ENV, fetch: ecbNetwork(csv) });
    await jobs.run(["ecb_update"]);
    expect(jobs.s3.text("reference/ecb/api-exr.csv")).toBe(csv);
    expect(JSON.parse(jobs.s3.text("reference/ecb/manifest.json") as string).active.source).toBe(
      "api",
    );
    expect(recordOf(jobs.s3, "jobs/ecb/ecb_update/2026-10-01.json")).toMatchObject({
      state: "done",
      outcome: { code: "ecb_updated" },
    });
    expect(jobs.ses.attempts).toEqual([]);
  });

  it("never overwrites a published rate: keeps the download apart, and the mail says so once (B2)", async () => {
    const csv = await readFile(join(fixtures, "api-exr.csv"), "utf8");
    const s3 = new TestOnlyFakeS3();
    const ssm = new TestOnlyFakeSsm();
    s3.seed("ledger/ledger.jsonl", sentinelLedger());
    ssm.set("/atlas/prod/mail/recipient", RECIPIENT);
    await setupJobs({ env: ECB_ENV, s3, ssm, fetch: ecbNetwork(csv) }).run(["ecb_update"]);
    const changed = csv.replace(",2025-10-02,0.8509", ",2025-10-02,0.9999");
    const second = setupJobs({
      env: ECB_ENV,
      s3,
      ssm,
      now: "2026-10-02T15:30:00Z",
      fetch: ecbNetwork(changed),
    });
    await second.run(["ecb_update"]);
    expect(s3.text("reference/ecb/api-exr.csv")).toBe(csv);
    expect(recordOf(s3, "jobs/ecb/ecb_update/2026-10-02.json")).toMatchObject({
      outcome: { code: "ecb_update_rejected", counts: { conflicts: 1 } },
      findings: [{ code: "ecb_update_rejected", subject: "ecb", counts: { conflicts: 1 } }],
    });
    expect(second.ses.attempts).toEqual([]);
    const mail = setupJobs({ env: MAIL_ENV, s3, ssm, now: "2026-10-03T06:00:00Z" });
    await mail.run(["dispatch_findings"]);
    expect(mail.ses.sent.map((sent) => sent.subject)).toEqual(["[Atlas] Aviso: historico del BCE"]);
    expect(mail.ses.sent[0]?.body).toContain("cambiaba 1 tipos ya publicados");
    expect(mail.ses.sent[0]?.body).not.toContain("0.9999");
  });

  it("undoes an activation cut before its manifest, before updating", async () => {
    const csv = await readFile(join(fixtures, "api-exr.csv"), "utf8");
    const s3 = new TestOnlyFakeS3();
    s3.seed("ledger/ledger.jsonl", sentinelLedger());
    await setupJobs({ env: ECB_ENV, s3, fetch: ecbNetwork(csv) }).run(["ecb_update"]);
    s3.seed("reference/ecb/previous/api-exr.csv", csv);
    s3.seed("reference/ecb/api-exr.csv", "half written");
    const next = setupJobs({
      env: ECB_ENV,
      s3,
      now: "2026-10-02T15:30:00Z",
      fetch: ecbNetwork(csv),
    });
    await next.run(["ecb_update"]);
    expect(s3.text("reference/ecb/api-exr.csv")).toBe(csv);
    expect(recordOf(s3, "jobs/ecb/ecb_update/2026-10-02.json").outcome.counts.undone).toBe(1);
  });
});

describe("a damaged history of the ECB (review of PR #106, B1 (b))", () => {
  /** The ECB answering the ZIP, built as the ECB builds it. */
  const zipNetwork = async (csv: string) => {
    const script = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../scripts/lambda-package.mjs",
    );
    const { zipOne } = (await import(pathToFileURL(script).href)) as {
      zipOne(name: string, content: Uint8Array): Uint8Array;
    };
    const zip = zipOne("eurofxref-hist.csv", new TextEncoder().encode(csv));
    return (url: string) =>
      url.includes("eurofxref-hist.zip")
        ? Promise.resolve(new Response(zip, { status: 200 }))
        : text("not used", 500);
  };

  /** The reviewer's mixed state: the manifest records one file, the bucket holds another. */
  const damagedBucket = async (csv: string) => {
    const s3 = new TestOnlyFakeS3();
    const ssm = new TestOnlyFakeSsm();
    s3.seed("ledger/ledger.jsonl", sentinelLedger());
    ssm.set("/atlas/prod/mail/recipient", RECIPIENT);
    await setupJobs({ env: ECB_ENV, s3, ssm, fetch: await zipNetwork(csv) }).run(["ecb_update"]);
    s3.seed("reference/ecb/eurofxref-hist.csv", csv.replace(/\n[^\n]+\n$/, "\n"));
    s3.seed("reference/ecb/previous/eurofxref-hist.csv", "Date,USD,\n");
    return { s3, ssm };
  };

  it("rebuilds it whole from the official ZIP, and the mail says so once", async () => {
    const csv = await readFile(join(fixtures, "eurofxref-hist.csv"), "utf8");
    const { s3, ssm } = await damagedBucket(csv);
    const next = setupJobs({
      env: ECB_ENV,
      s3,
      ssm,
      now: "2026-10-02T15:30:00Z",
      fetch: await zipNetwork(csv),
    });
    await next.run(["ecb_update"]);
    expect(s3.text("reference/ecb/eurofxref-hist.csv")).toBe(csv);
    const manifest = JSON.parse(s3.text("reference/ecb/manifest.json") as string);
    expect(manifest.active).toMatchObject({ source: "zip", file: "eurofxref-hist.csv" });
    expect(manifest.previous).toBeUndefined();
    const record = recordOf(s3, "jobs/ecb/ecb_update/2026-10-02.json");
    expect(record).toMatchObject({
      state: "done",
      outcome: { code: "ecb_history_rebuilt", counts: { days: 127 } },
      findings: [{ code: "ecb_history_rebuilt", subject: "ecb", counts: { days: 127 } }],
    });
    expect(next.ses.attempts).toEqual([]);
    for (const day of ["03", "04"]) {
      const mail = setupJobs({ env: MAIL_ENV, s3, ssm, now: `2026-10-${day}T06:00:00Z` });
      await mail.run(["dispatch_findings"]);
      expect(mail.ses.sent.map((sent) => sent.subject)).toEqual(
        day === "03" ? ["[Atlas] Aviso: historico del BCE reconstruido"] : [],
      );
    }
    // The next day it is an ordinary update again.
    await setupJobs({
      env: ECB_ENV,
      s3,
      ssm,
      now: "2026-10-03T15:30:00Z",
      fetch: await zipNetwork(csv),
    }).run(["ecb_update"]);
    expect(recordOf(s3, "jobs/ecb/ecb_update/2026-10-03.json").outcome.code).toBe("ecb_updated");
  });

  it("stays damaged, writing nothing, when only the API answers", async () => {
    const csv = await readFile(join(fixtures, "eurofxref-hist.csv"), "utf8");
    const { s3, ssm } = await damagedBucket(csv);
    const before = s3.text("reference/ecb/eurofxref-hist.csv");
    const api = await readFile(join(fixtures, "api-exr.csv"), "utf8");
    await setupJobs({
      env: ECB_ENV,
      s3,
      ssm,
      now: "2026-10-02T15:30:00Z",
      fetch: ecbNetwork(api),
    }).run(["ecb_update"]);
    expect(s3.text("reference/ecb/eurofxref-hist.csv")).toBe(before);
    expect(recordOf(s3, "jobs/ecb/ecb_update/2026-10-02.json")).toMatchObject({
      outcome: { code: "ecb_history_damaged" },
      findings: [{ code: "ecb_history_damaged", subject: "ecb" }],
    });
  });
});

describe("the daily task of the closes (ADR-0031; R21-R28, R33)", () => {
  it("downloads until yesterday, from the ledger's assets, a contrasted source only, into the bucket", async () => {
    const { s3, jobs } = pricesJobs();
    await jobs.run(["prices_update"]);
    expect(jobs.fetched.every((url) => url.includes("to=2026-09-30"))).toBe(true);
    expect(jobs.fetched.some((url) => url.includes("WORLD.XETRA"))).toBe(true);
    expect(jobs.fetched.some((url) => url.includes("BONDS.XETRA"))).toBe(false);
    expect(jobs.fetched.some((url) => url.includes("STRANGER.XETRA"))).toBe(false);
    expect(s3.keys()).not.toContain("prices/ast_stranger.jsonl");
    expect(s3.text("prices/ast_world.jsonl")).toContain('"close":"101.5"');
    expect(s3.text("prices/symbols.json")).toBe(SYMBOLS);
    const record = recordOf(s3, "jobs/prices/prices_update/2026-10-01.json");
    expect(record).toMatchObject({
      state: "done",
      outcome: { code: "prices_updated", counts: { updated: 1, unchecked: 1 } },
    });
    expect(record.findings).toEqual([
      { code: "currency_unchecked", subject: "eodhd", counts: { assets: 1 } },
    ]);
    expect(jobs.ses.attempts).toEqual([]);
  });

  it("warns of the theses of the bucket past their horizon, and of nothing else of a thesis (mutant 18 bis)", async () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.asset("ast_spec_two", {
      asset_type: "stock",
      book: "bucket",
      currency: "USD",
      transferable: false,
    });
    const usd = { currency: "USD", fx_rate: "1", trade_date: "2026-09-01" } as const;
    b.thesisOpened({ thesis_id: "th_late", expected_horizon_days: 10 });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec",
      quantity: "1",
      unit_price: "10",
      thesis_id: "th_late",
      ...usd,
    });
    b.thesisOpened({
      thesis_id: "th_fresh",
      asset_id: "ast_spec_two",
      expected_horizon_days: 90,
      invalidation: "a free text that never warns",
    });
    b.buy({
      account_id: "acc_bucket",
      asset_id: "ast_spec_two",
      quantity: "1",
      unit_price: "10",
      thesis_id: "th_fresh",
      ...usd,
    });
    const { s3, jobs } = pricesJobs();
    s3.seed("ledger/ledger.jsonl", `${b.build().map(encodeLine).join("\n")}\n`);
    await jobs.run(["prices_update"]);
    const record = recordOf(s3, "jobs/prices/prices_update/2026-10-01.json");
    expect(record.state).toBe("done");
    expect(record.findings).toEqual([
      { code: "thesis_horizon_exceeded", subject: "bucket", counts: { theses: 1 } },
    ]);
    expect(JSON.stringify(record)).not.toContain("th_late");
  });

  it("without keys calls nothing, counts no failure and leaves nothing for the mail (mutant 16)", async () => {
    const { s3, jobs } = pricesJobs({ keys: false });
    await jobs.run(["prices_update"]);
    expect(jobs.fetched).toEqual([]);
    expect(s3.text("prices/_status.json")).toBeUndefined();
    expect(recordOf(s3, "jobs/prices/prices_update/2026-10-01.json")).toMatchObject({
      state: "done",
      outcome: { code: "prices_no_keys" },
    });
    expect(recordOf(s3, "jobs/prices/prices_update/2026-10-01.json").findings).toBeUndefined();
  });

  it("uses the simulated source in dev, and calls nothing", async () => {
    const { s3, jobs } = pricesJobs({
      keys: false,
      env: {
        ...PRICES_ENV,
        ATLAS_ENV: "dev",
        ATLAS_DATA_BUCKET: "atlas-dev-data-test",
        ATLAS_PRICE_SOURCES: "simulated",
      },
    });
    await jobs.run(["prices_update"]);
    expect(jobs.fetched).toEqual([]);
    expect(s3.text("prices/ast_world.jsonl")).toContain('"close":"100"');
  });

  it("refuses to start with the simulated source in prod (mutant 17)", () => {
    expect(() =>
      pricesJobs({ env: { ...PRICES_ENV, ATLAS_PRICE_SOURCES: "simulated" } }),
    ).toThrow();
  });

  it("warns of a failing source once per streak, from the third failure (mutant 18)", async () => {
    const s3 = new TestOnlyFakeS3();
    const ssm = new TestOnlyFakeSsm();
    s3.seed("ledger/ledger.jsonl", sentinelLedger());
    s3.seed("prices/symbols.json", SYMBOLS);
    ssm.set("/atlas/prod/mail/recipient", RECIPIENT);
    ssm.set("/atlas/prod/prices/eodhd-key", KEY);
    const sent: string[] = [];
    for (const day of ["01", "02", "03", "04", "05", "06"]) {
      const prices = setupJobs({
        env: PRICES_ENV,
        s3,
        ssm,
        now: `2026-10-${day}T05:00:00Z`,
        fetch: eodhd(503),
      });
      await prices.run(["prices_update"]);
      const mail = setupJobs({ env: MAIL_ENV, s3, ssm, now: `2026-10-${day}T06:00:00Z` });
      await mail.run(["dispatch_findings"]);
      sent.push(...mail.ses.sent.map((one) => `${day} ${one.subject}`));
    }
    expect(sent).toEqual([
      "01 [Atlas] Aviso: correspondencias sin contrastar en eodhd",
      "03 [Atlas] Aviso: fuente de precios eodhd",
    ]);
  });

  it("never lets the key reach a log, an error or a record (mutant 15)", async () => {
    const { s3, jobs } = pricesJobs({ status: 401 });
    await jobs.run(["prices_update"]);
    const everything = [...jobs.logs, ...s3.keys().map((key) => s3.text(key) ?? "")].join("\n");
    expect(everything).not.toContain(KEY);
    expect(jobs.fetched.some((url) => url.includes(KEY))).toBe(true);
  });

  it("stops at a conflict of the bucket without retrying, and keeps the calls reserved (mutants 12, 20)", async () => {
    const { s3, jobs } = pricesJobs();
    s3.beforePut = (key) => {
      if (key === "prices/ast_world.jsonl") {
        s3.conflictNext();
      }
    };
    await jobs.run(["prices_update"]);
    expect(recordOf(s3, "jobs/prices/prices_update/2026-10-01.json")).toMatchObject({
      state: "failed",
      outcome: { code: "prices_conflict" },
    });
    expect(jobs.fetched.filter((url) => url.includes("WORLD.XETRA"))).toHaveLength(1);
    expect(
      JSON.parse(s3.text("prices/_status.json") as string).sources.eodhd.calls_at,
    ).toHaveLength(1);
  });
});
