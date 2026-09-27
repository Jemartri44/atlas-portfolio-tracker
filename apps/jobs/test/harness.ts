// The jobs composed with their doubles (feature 016, E1): S3, SSM and SES
// simulated, a clock that only moves when a test moves it, and every log
// line kept. The ledger is small and known, sown with sentinels: a mail with
// the switch off, or a log line on any path, must carry none of them.

import { DEFAULT_SETTINGS, encodeLine, mergeSettings } from "@atlas/domain";
import type { JobTask } from "@atlas/domain/jobs";
import { TestOnlyFakeS3 } from "../../../packages/adapters/test/aws/test-only-fake-s3.js";
import { TestOnlyFakeSes } from "../../../packages/adapters/test/aws/test-only-fake-ses.js";
import { TestOnlyFakeSsm } from "../../../packages/adapters/test/aws/test-only-fake-ssm.js";
import { catalogue, LedgerBuilder } from "../../../packages/domain/test/ledger-builder.js";
import { compose, composeWith } from "../src/compose.js";
import type { JobsHandler } from "../src/handler.js";
import type { TaskRunner } from "../src/run.js";

export const ORIGIN = "https://atlas.example.test";
export const SENDER = "atlas-sender@example.test";
export const RECIPIENT = "recipient-sentinel@example.test";

export const MAIL_ENV: Readonly<Record<string, string>> = {
  ATLAS_ENV: "prod",
  ATLAS_DATA_BUCKET: "atlas-prod-data-test",
  ATLAS_JOBS: "dispatch_findings,monthly_reminder",
  ATLAS_MAIL_FROM: SENDER,
  ATLAS_ORIGIN: ORIGIN,
  ATLAS_OAUTH_IDLE_WARNING_DAYS: "150",
  ATLAS_JOB_MAX_RUN_SECONDS: "900",
};

/** Figures and names that must never leave in a mail with the switch off, nor in a log. */
export const SENTINELS = {
  amounts: ["1234.56", "1.234,56", "987.65", "987,65", "4321.09", "4.321,09"],
  ids: ["ast_world", "ast_bonds", "ast_gold", "acc_fund", "acc_etf"],
};

/** A core of three funds valued by hand, with a contribution of 1234.56 € a month. */
export const sentinelLedger = (
  extra: Partial<Parameters<typeof mergeSettings>[1]> = {},
): string => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.settings(
    mergeSettings(DEFAULT_SETTINGS, {
      target_weights: { ast_world: "60", ast_bonds: "30", ast_gold: "10" },
      monthly_contribution_eur: "1234.56",
      bucket_pct_of_contribution: "5",
      job_frequencies: { reminder: "monthly", reconciliation: "quarterly" },
      ...extra,
    }),
  );
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_world",
    quantity: "6",
    unit_price: "987.65",
    trade_date: "2026-09-01",
  });
  b.buy({
    account_id: "acc_fund",
    asset_id: "ast_bonds",
    quantity: "3",
    unit_price: "4321.09",
    trade_date: "2026-09-01",
  });
  b.buy({
    account_id: "acc_etf",
    asset_id: "ast_gold",
    quantity: "1",
    unit_price: "100",
    currency: "USD",
    fx_rate: "1",
    trade_date: "2026-09-01",
  });
  for (const [account, asset, value, currency] of [
    ["acc_fund", "ast_world", "987.65", "EUR"],
    ["acc_fund", "ast_bonds", "4321.09", "EUR"],
    ["acc_etf", "ast_gold", "100", "USD"],
  ] as const) {
    b.valuation({
      account_id: account,
      asset_id: asset,
      date: "2026-09-30",
      unit_value: value,
      currency,
      fx_rate: "1",
    });
  }
  return `${b.build().map(encodeLine).join("\n")}\n`;
};

export interface Jobs {
  readonly s3: TestOnlyFakeS3;
  readonly ssm: TestOnlyFakeSsm;
  readonly ses: TestOnlyFakeSes;
  readonly logs: string[];
  /** Every address a source asked for. */
  readonly fetched: string[];
  readonly handler: JobsHandler;
  run(tasks: readonly string[], requestId?: string): Promise<void>;
  setNow(iso: string): void;
}

export const setupJobs = (
  options: {
    env?: Readonly<Record<string, string | undefined>>;
    now?: string;
    ledger?: string;
    /** Runners of a test, instead of the tasks built so far. */
    runners?: Readonly<Partial<Record<JobTask, TaskRunner>>>;
    /** The network of the sources: a test says what each address answers; nothing else is reached. */
    fetch?: (url: string) => Promise<Response>;
    /** Shared doubles, to run two functions over the same bucket and parameters. */
    s3?: TestOnlyFakeS3;
    ssm?: TestOnlyFakeSsm;
  } = {},
): Jobs => {
  const s3 = options.s3 ?? new TestOnlyFakeS3();
  const ssm = options.ssm ?? new TestOnlyFakeSsm();
  const fetched: string[] = [];
  const ses = new TestOnlyFakeSes();
  const logs: string[] = [];
  let now = Date.parse(options.now ?? "2026-10-01T06:00:00Z");
  if (options.ssm === undefined) {
    ssm.set("/atlas/prod/mail/recipient", RECIPIENT);
  }
  if (options.s3 === undefined) {
    s3.seed("ledger/ledger.jsonl", options.ledger ?? sentinelLedger());
  }
  const parts = {
    objects: () => s3,
    parameters: () => ssm,
    mail: () => ses,
    fetch: (url: string) => {
      fetched.push(url);
      return options.fetch === undefined
        ? Promise.reject(new Error("no network in the tests"))
        : options.fetch(url);
    },
    clock: { now: () => new Date(now) },
    log: (line: string) => logs.push(line),
  };
  const env = options.env ?? MAIL_ENV;
  const handler =
    options.runners === undefined ? compose(env, parts) : composeWith(env, parts, options.runners);
  return {
    s3,
    ssm,
    ses,
    logs,
    fetched,
    handler,
    run: (tasks, requestId = "req-1") =>
      handler({ event_format: 1, tasks: [...tasks] }, { awsRequestId: requestId }),
    setNow: (iso) => {
      now = Date.parse(iso);
    },
  };
};

export const records = (s3: TestOnlyFakeS3): string[] =>
  s3.keys().filter((key) => key.startsWith("jobs/"));
