// The daily task of the closes (feature 016, E2; ADR-0031): `updatePrices`,
// the use case of the 013 — the cascade, never the day in course, one close
// in force per date, the currency declared and contrasted — over the store of
// `prices/` in the bucket, with the assets and their priority **of the remote
// ledger**, `symbols.json` of the bucket **read only** (Q1: the cloud never
// contrasts and never writes it) and the configuration of the function
// (§8.2 M5). The keys, from SSM on every run; **without them** (the case of
// `dev`) nothing is called, no failure is counted and nothing is left for the
// mail. **It sends nothing** (§8.2 B2): its findings go to its record.

import {
  PriceKeyInvalid,
  PriceStoreConflict,
  PriceStoreRefused,
  readPriceKeys,
  S3PriceStore,
} from "@atlas/adapters/aws-daily";
import { bucketPositions } from "@atlas/domain";
import { cloudPriceConfigText, pricesFindings } from "@atlas/domain/jobs";
import { parseStatus, updatePrices } from "@atlas/domain/quotes";
import type { TaskResult, TaskRunner } from "../run.js";

const failed = (code: string): TaskResult => ({ state: "failed", outcome: { code } });

export const pricesUpdate: TaskRunner = async (context): Promise<TaskResult> => {
  const { deps } = context;
  const config = deps.config.prices;
  const sourcesOf = deps.sources?.prices;
  if (config === undefined || sourcesOf === undefined) {
    throw new RangeError("the prices task without its configuration");
  }
  let keys: Awaited<ReturnType<typeof readPriceKeys>> = {};
  if (config.sources !== "simulated") {
    try {
      keys = await readPriceKeys(deps.parameters, deps.config.ssmPrefix);
    } catch (error) {
      return failed(error instanceof PriceKeyInvalid ? error.code : "price_keys_unavailable");
    }
  }
  const sources = sourcesOf(config.sources, keys);
  if (Object.keys(sources).length === 0) {
    return { state: "done", outcome: { code: "prices_no_keys" } };
  }
  const ledger = await context.ledger();
  if (!ledger.ok) {
    return failed(ledger.code);
  }
  const store = new S3PriceStore(deps.objects, cloudPriceConfigText(config));
  let report: Awaited<ReturnType<typeof updatePrices>>;
  try {
    report = await updatePrices({
      state: ledger.state,
      settings: ledger.settings,
      today: context.today,
      now: deps.now,
      store,
      sources,
      symbols: "read_only",
    });
  } catch (error) {
    if (error instanceof PriceStoreConflict) {
      return failed("prices_conflict");
    }
    if (error instanceof PriceStoreRefused) {
      return failed(error.code);
    }
    throw error;
  }
  const theses = new Set(
    bucketPositions(ledger.state, context.today, ledger.settings)
      .rows.filter((row) => row.horizon_exceeded === true)
      .map((row) => row.thesis_id),
  ).size;
  const count = (outcome: string) =>
    report.assets.filter((asset) => asset.outcome === outcome).length;
  return {
    state: "done",
    outcome: {
      code: "prices_updated",
      counts: {
        updated: count("updated"),
        up_to_date: count("up_to_date"),
        failed: count("failed"),
        out_of_budget: count("out_of_budget"),
        unchecked: count("currency_unchecked"),
        no_symbol: count("no_symbol"),
        // Never silent (round 3 of the review of PR #106): a file that does not read.
        unreadable: count("unreadable"),
      },
    },
    findings: pricesFindings({
      report,
      status: parseStatus(await store.status()),
      threshold: config.failureThreshold,
      theses,
    }),
  };
};
