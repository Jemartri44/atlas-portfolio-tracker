import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  asChain,
  domainSrc,
  importGraph,
  interfaceKeys,
  listTsFiles,
  priceReachedFrom,
  priceRoots,
  reachableFrom,
  repoRoot,
} from "./support.js";

/**
 * Feature 009, decision (f): the tax engine converts every amount at the ECB
 * rate **of its own operation**, as published and with its date (ADR-0013).
 * `state.fxRates` is the last rate the ledger knows per currency, a convenience
 * for valuing cash today; reading it from `tax/` would convert a disposal of
 * 2027 at a rate of 2029. And `state.valuations` are prices. Neither may be
 * read there, in either of the two forms a read can take.
 */
describe("architecture: the tax engine", () => {
  it("reads neither the known FX rates nor the valuations of the state", () => {
    const taxDir = join(domainSrc, "tax");
    // The three forms a read can take: a property, a destructuring and a
    // bracket with the name written as a string.
    const reads = [
      /\.(?:fxRates|valuations)\b/,
      /\{[^{}]*\b(?:fxRates|valuations)\b[^{}]*\}\s*=[^=]/,
      /\[\s*["'`](?:fxRates|valuations)["'`]\s*\]/,
    ];
    const files = listTsFiles(taxDir);
    expect(files.length).toBeGreaterThan(4);
    const violations = files
      .filter((file) => reads.some((pattern) => pattern.test(readFileSync(file, "utf8"))))
      .map((file) => relative(repoRoot, file));
    expect(violations).toEqual([]);
  });

  /**
   * The Modelo 720 view (`projections/valuations.ts`) reads valuations because
   * the law values that return at market prices. The next feature puts it next
   * to the tax engine; this keeps the engine from ever reaching it, at any depth.
   */
  it("never reaches the valuations view, at any depth", () => {
    const graph = importGraph();
    const taxDir = join(domainSrc, "tax");
    const view = join(domainSrc, "projections", "valuations.ts");
    const violations = listTsFiles(taxDir)
      .map((file) => reachableFrom(graph, file).get(view))
      .filter((chain): chain is string[] => chain !== undefined)
      .map(asChain);
    expect(violations).toEqual([]);
  });

  /**
   * Feature 010, block 3: the informative returns (Modelo 720 and 721) are the
   * **only** fiscal route the law makes value things at market price, and they
   * live in `informative/` for that reason alone. The income tax may not depend
   * on a price (constitution II), so the fiscal path —everything
   * `project-ledger.ts` and every file of `tax/` reach— must not reach a single
   * file of that folder, at any depth.
   *
   * The other direction is allowed and is the point: `informative/` reads
   * `prices.ts` and the catalogue of criteria. A table of criteria is a table;
   * what must never happen is the return learning what a price is.
   */
  it("keeps the informative returns out of reach of every fiscal calculation", () => {
    const graph = importGraph();
    const informative = join(domainSrc, "informative");
    const taxDir = join(domainSrc, "tax");
    const roots = [join(domainSrc, "projections", "project-ledger.ts"), ...listTsFiles(taxDir)];
    const violations: string[] = [];
    for (const root of roots) {
      for (const [file, chain] of reachableFrom(graph, root)) {
        if (!relative(informative, file).startsWith("..")) {
          violations.push(asChain(chain));
        }
      }
    }
    expect(violations).toEqual([]);
  });

  /**
   * And they read it at **level 1**: a registered `valuation`, which is a
   * decision of the user. The specification makes the photograph of the year
   * end a manual datum on purpose (§7.1 and §14.1), so an automatic quote of
   * phase 4 must never walk into a tax return. `priceAt` only returns one when
   * it is handed an `ExternalPrices`, so the rule is that this folder never
   * names one — checked on the text, where the mistake would be made.
   */
  it("never lets an automatic quote into an informative return", () => {
    const offenders = listTsFiles(join(domainSrc, "informative"))
      // Comments are not code: what the rule forbids is naming the type or
      // passing the argument, and both of those are code.
      .filter((file) =>
        /\bExternalPrices\b|\bExternalQuote\b|external\s*[:,)]/.test(
          readFileSync(file, "utf8").replace(/\/\/[^\n]*/g, ""),
        ),
      )
      .map((file) => relative(repoRoot, file));
    expect(offenders).toEqual([]);
  });

  /**
   * **The rule that closes the 720** (feature 013, §6.5 (a) of its prompt):
   * by reach, not by names. A rule on what an argument is called is dodged by
   * a fifth argument called otherwise, and forbidding two names is dodged by
   * importing `bucketPositions`, `coreWeights`, `netWorth` or `costSummary`,
   * which take the external source and forward it to the gate. So: from any
   * file of `informative/`, at any depth, nothing price-aware may be reached —
   * not `prices.ts`, not a file that imports it (which is every file that
   * could call `priceAt` or `manualPrices`, under any name), not a port of
   * prices, not a file of `quotes/` — **except the manual leaf**, which is the
   * one price the informative returns may read and which imports none of
   * those.
   */
  it("reaches nothing of prices from an informative return but the manual leaf", () => {
    const graph = importGraph();
    const pricesFile = join(domainSrc, "projections", "prices.ts");
    const leaf = join(domainSrc, "projections", "manual-price.ts");
    const forbidden = priceRoots().filter((file) => file !== leaf);
    const importersOfTheGate = [...graph.entries()]
      .filter(([, targets]) => targets.includes(pricesFile))
      .map(([file]) => file);
    expect(importersOfTheGate.length).toBeGreaterThan(3);
    const violations: string[] = [];
    for (const file of listTsFiles(join(domainSrc, "informative"))) {
      const reach = reachableFrom(graph, file);
      for (const target of [...forbidden, ...importersOfTheGate]) {
        const chain = reach.get(target);
        if (chain !== undefined) {
          violations.push(asChain(chain));
        }
      }
    }
    expect(violations).toEqual([]);
    // And the leaf is a leaf: it reaches nothing price-aware either.
    expect(priceReachedFrom(graph, leaf, forbidden)).toBeUndefined();
  });

  /** And the rule is not vacuous: the informative returns do read a price, the manual one. */
  it("lets the informative returns read a price, which is what they are for", () => {
    const graph = importGraph();
    const m720 = join(domainSrc, "informative", "m720.ts");
    const leaf = join(domainSrc, "projections", "manual-price.ts");
    expect(reachableFrom(graph, m720).get(leaf)).toBeDefined();
    expect(listTsFiles(join(domainSrc, "informative")).length).toBeGreaterThan(4);
  });

  /**
   * Quotes never enter the state of the ledger nor `Settings` (feature 013,
   * §6.4 (a) and §6.5 (b)), which the 720 reads. Looking for a type of quote
   * would let a field with the type written inline through, so the keys
   * themselves are frozen: a new one turns this red until somebody adds it
   * here by hand, knowingly.
   */
  /**
   * The reading of keys cannot be dodged by a key it does not see (second
   * pass of the review of PR #78): an index signature, whatever its form,
   * lets any key through, so it is a failure of the frozen list.
   */
  it("reads an index signature as a key it refuses", () => {
    const probe = join(repoRoot, "tests", "fixtures", "architecture", "index-signature.ts.txt");
    expect(interfaceKeys(probe, "Probe")).toEqual([
      "plain",
      "[index signature]",
      "quoted",
      "[index signature]",
    ]);
  });

  it("freezes the keys of LedgerState and Settings", () => {
    const state = interfaceKeys(join(domainSrc, "projections", "state.ts"), "LedgerState");
    expect(state).toEqual([
      "accounts",
      "assets",
      "settingsHistory",
      "fiscalSettings",
      "positions",
      "cash",
      "fxRates",
      "acquisitions",
      "lots",
      "lotJournal",
      "lotCounts",
      "gains",
      "income",
      "inKindIncome",
      "valuations",
      "orders",
      "transferRequests",
      "theses",
      "filings",
      "fingerprintWaivers",
      "reversed",
      "warnings",
      "invalid",
      "fingerprints",
      "positionOf",
      "usage",
    ]);
    // The state as it is built is contrasted too, in the domain's own tests
    // (`test/projections/state-keys.test.ts`), which no reading of the source
    // can dodge.
    const settings = interfaceKeys(join(domainSrc, "settings", "settings.ts"), "Settings");
    expect(settings).toEqual([
      "fiscal_date_rule",
      "wash_sale_window",
      "income_category",
      "wash_sale_window_days",
      "wash_sale_transfer_counts",
      "savings_offset_limit_pct",
      "loss_carryforward_years",
      "treaty_withholding_pct",
      "target_weights",
      "deviation_threshold_pp",
      "satellite_min_weight_pct",
      "monthly_contribution_eur",
      "bucket_pct_of_contribution",
      "bucket_max_cumulative_contribution",
      "bucket_stop_loss_pct",
      "bucket_max_weight_pct",
      "bucket_benchmark_asset_id",
      "stale_price_days",
      "model_720_threshold_eur",
      "model_720_increase_eur",
      "model_720_alert_threshold_eur",
      "model_721_threshold_eur",
      "model_721_increase_eur",
      "model_721_alert_threshold_eur",
      "renta_season_start",
      "renta_season_end",
      "savings_tax_brackets",
      "tax_residence",
      "notification_email",
      "job_frequencies",
      "transfer_max_days",
    ]);
  });

  /**
   * And the correspondence of symbols never enters the catalogue of the ledger
   * (ADR-0031, amendment): a full snapshot `asset_updated` written by an old
   * client would erase it. It lives in `prices/symbols.json`; the fields of an
   * asset are frozen here, so a `price_symbols` added to them turns this red.
   */
  it("keeps the symbols of the prices out of the fields of an asset", () => {
    expect(interfaceKeys(join(domainSrc, "schema", "events.ts"), "AssetFields")).toEqual([
      "asset_id",
      "asset_type",
      "book",
      "asset_class",
      "isin",
      "ticker",
      "name",
      "currency",
      "ter",
      "transferable",
      "reference_etf_id",
      "market",
      "issuer_country",
      "active",
    ]);
  });

  /** And nothing that builds the state or the settings knows about prices. */
  it("builds no state and no settings from anything that knows prices", () => {
    const graph = importGraph();
    const roots = priceRoots();
    const builders = [
      join(domainSrc, "projections", "project-ledger.ts"),
      join(domainSrc, "projections", "state.ts"),
      ...listTsFiles(join(domainSrc, "settings")),
    ];
    const violations = builders
      .map((file) => priceReachedFrom(graph, file, roots))
      .filter((chain): chain is string[] => chain !== undefined)
      .map(asChain);
    expect(violations).toEqual([]);
  });
});
