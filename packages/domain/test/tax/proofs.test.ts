// The three proofs of feature 009 (plan §7 and §8):
//
// 1. **No figure of the return depends on a price** (constitution II, decision
//    (f)): delete every price of a ledger and the report is identical byte for
//    byte; add random valuations and it does not move either.
// 2. **The defaults change nothing that already existed** (decision (g)).
// 3. **The report of the synthetic ledger is frozen** in a fixture of its own,
//    next to the snapshot of the projection and without touching it.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { yearOf } from "../../src/dates/civil-date.js";
import { model720, model721 } from "../../src/informative/m720.js";
import { realizedGains } from "../../src/projections/gains.js";
import { integrity } from "../../src/projections/integrity.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type {
  BuyEvent,
  CorporateActionEvent,
  LedgerEvent,
  SellEvent,
  SettingsChangedEvent,
  ValuationEvent,
} from "../../src/schema/events.js";
import { decodeLine } from "../../src/schema/line.js";
import { DEFAULT_INCOME_CATEGORY } from "../../src/settings/settings.js";
import { taxBoxes } from "../../src/tax/boxes/boxes.js";
import { taxBoxesJson, taxReportJson } from "../../src/tax/json.js";
import { taxYear } from "../../src/tax/year.js";
import { fixtureLines, fixtureText } from "../fixtures-path.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { taxLedgerOf, taxOpArb } from "../properties/tax-ledgers.js";
import { exerciseLedger } from "./exercise-ledger.js";
import { HAND_SETTINGS } from "./helpers.js";

const TODAY = "2030-01-01";

/**
 * Everything in the ledger that is a price or a quotation and not the
 * consideration of the operation: the valuations (manual prices), the unit
 * price of a buy or a sell that carries its `amount` (informative, ADR-0012),
 * the NAVs of transfers and transfer requests, and the per-unit amount of a
 * dividend. What stays is what the operation paid or received: `amount` or
 * `unit_price` when it is the basis, the price of a forced sale, the market
 * values of a swap (article 37.1.h is the consideration) and the unit cost of
 * a grant.
 */
const withoutPrices = (events: readonly LedgerEvent[]): LedgerEvent[] =>
  events
    .filter((event) => event.type !== "valuation")
    .map((event) => {
      const record = { ...(event as unknown as Record<string, unknown>) };
      if ((event.type === "buy" || event.type === "sell") && record.amount !== undefined) {
        delete record.unit_price;
      }
      if (event.type === "transfer" || event.type === "transfer_request_updated") {
        delete record.nav_out;
        delete record.nav_in;
      }
      if (event.type === "dividend") {
        delete record.per_unit;
      }
      return record as unknown as LedgerEvent;
    });

/** And the market value a grant declares as income on receipt: it may only move the exposure of #8. */
const withoutInKindValues = (events: readonly LedgerEvent[]): LedgerEvent[] =>
  events.map((event) =>
    event.type === "corporate_action"
      ? ({
          ...event,
          effects: (event as CorporateActionEvent).effects.map((effect) => {
            if (effect.op !== "grant") {
              return effect;
            }
            const { income_eur: _value, income_base: _base, ...rest } = effect;
            return rest;
          }),
        } as LedgerEvent)
      : event,
  );

/** Crockford base 32, the alphabet of a ULID. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const extraId = (n: number): string => {
  let text = "";
  for (let rest = n, i = 0; i < 6; i += 1, rest = Math.floor(rest / 32)) {
    text = `${CROCKFORD[rest % 32]}${text}`;
  }
  return `01ARYZ6S41TSV4RRFFQ7${text}`;
};

/**
 * The other direction: **more** prices than the ledger had. After the whole
 * ledger, a valuation of every account and asset traded, on the day of each
 * trade, at an absurd price and in the currency and rate of the trade. Pass B
 * orders by date, so they land among the trades they value.
 */
const withMorePrices = (events: readonly LedgerEvent[]): LedgerEvent[] => [
  ...events,
  ...events
    .filter((event): event is BuyEvent | SellEvent => event.type === "buy" || event.type === "sell")
    .map(
      (trade, index): ValuationEvent => ({
        schema_version: 1,
        id: extraId(index),
        recorded_at: trade.recorded_at,
        type: "valuation",
        account_id: trade.account_id,
        asset_id: trade.asset_id,
        date: trade.value_date,
        quantity: "1",
        unit_value: "987.65",
        currency: trade.currency,
        fx_rate: trade.fx_rate,
        fx_rate_date: trade.fx_rate_date,
        source: "manual",
      }),
    ),
];

const json = (events: readonly LedgerEvent[], year: number): string =>
  JSON.stringify(taxReportJson(taxYear(events, year, { today: TODAY })));

/**
 * The same for the layout by box (feature 010, block 2). It is a layer over the
 * report and reads no price of its own, but saying so is not proving it: the
 * proof is that deleting every price of the ledger leaves it identical byte for
 * byte, exactly as for the report underneath.
 */
const boxesJson = (events: readonly LedgerEvent[], year: number): string =>
  JSON.stringify(taxBoxesJson(taxBoxes(events, year, { today: TODAY })));

const synthetic = (): LedgerEvent[] =>
  fixtureLines("synthetic-v1.jsonl").map((line) => decodeLine(line).event);

const YEARS = [2026, 2027, 2028, 2029];

/**
 * Sixteen whole reports of the synthetic ledger: about five seconds under
 * coverage on a loaded machine, the default budget of Vitest. It timed out
 * once in the full suite (review of PR #90, round 2) with nothing wrong in it,
 * so it gets a budget of its own: six times what it measures, enough for the
 * load and still a warning if it ever becomes much slower (round 3).
 */
const SYNTHETIC_BUDGET_MS = 30_000;

describe("proof 1: no figure of the return depends on a price", () => {
  it(
    "deletes every price of the synthetic ledger and every report is identical",
    () => {
      const events = synthetic();
      const stripped = withoutPrices(events);
      expect(stripped.length).toBeLessThan(events.length);
      for (const year of YEARS) {
        expect(json(stripped, year)).toBe(json(events, year));
        expect(boxesJson(stripped, year)).toBe(boxesJson(events, year));
      }
    },
    SYNTHETIC_BUDGET_MS,
  );

  it("deletes every price of the hand-computed exercise and every report is identical", () => {
    const { events } = exerciseLedger();
    const stripped = withoutPrices(events);
    expect(events.length - stripped.length).toBe(4);
    for (const year of [2027, 2028]) {
      expect(json(stripped, year)).toBe(json(events, year));
      expect(boxesJson(stripped, year)).toBe(boxesJson(events, year));
    }
  });

  /**
   * Generous, like the other property suites: it walks 200 random ledgers and
   * builds six outputs of each one (the report and the layout by box, three
   * times over), and a loaded machine must not turn a green suite red.
   */
  const BUDGET_MS = 120_000;

  it(
    "holds on random ledgers, in both directions: without their valuations, and with more of them",
    () => {
      fc.assert(
        fc.property(
          fc.array(taxOpArb, { minLength: 5, maxLength: 35 }),
          fc.integer({ min: 0, max: 8 }),
          (ops, offset) => {
            const events = taxLedgerOf(ops);
            const year = 2027 + offset;
            const reference = json(withoutPrices(events), year);
            expect(json(events, year)).toBe(reference);
            expect(json(withMorePrices(events), year)).toBe(reference);
            const boxes = boxesJson(withoutPrices(events), year);
            expect(boxesJson(events, year)).toBe(boxes);
            expect(boxesJson(withMorePrices(events), year)).toBe(boxes);
          },
        ),
        { numRuns: 200 },
      );
    },
    BUDGET_MS,
  );

  it("does not integrate the value of income in kind: removing it moves no figure of the base", () => {
    const b = exerciseLedger().events;
    const fork: LedgerEvent = {
      schema_version: 1,
      id: "01ARYZ6S41TSV4RRFFQ69FORKK",
      recorded_at: "2026-09-01T18:00:00.000Z",
      type: "corporate_action",
      kind: "crypto_fork",
      asset_id: "coin_y",
      effective_date: "2028-08-01",
      source_document: "https://issuer.example/fork.pdf",
      effects: [
        {
          op: "grant",
          asset_id: "coin_x",
          per_account: [{ account_id: "acc_bkt", quantity: "3" }],
          unit_cost: "0",
          currency: "EUR",
          fx_rate: "1",
          fx_rate_date: "2028-08-01",
          acquisition_date: "2028-08-01",
          income_eur: "90",
          income_base: "general",
        },
      ],
      fingerprint: "sha256:fork",
    } as unknown as LedgerEvent;
    const withValue = taxReportJson(taxYear([...b, fork], 2028, { today: TODAY }));
    const without = taxReportJson(
      taxYear(withoutInKindValues([...b, fork]), 2028, { today: TODAY }),
    );
    for (const key of [
      "base_eur",
      "capital_gains",
      "movable_capital",
      "compensation",
      "wash_sale",
    ]) {
      expect(JSON.stringify(without[key])).toBe(JSON.stringify(withValue[key]));
    }
    expect(withValue.in_kind).not.toEqual(without.in_kind);
  });
});

/**
 * Feature 010, decision (d): the figures a Modelo 720 declares are **market
 * values stored in the ledger**. Letting them reach the savings base would be
 * putting a price into the income tax without touching `prices.ts` at all, and
 * no architecture test would see it, because a filing is an ordinary event.
 *
 * So the proof by deletion grows: deleting every price **and every 720 and 721
 * filed** leaves the report and the layout by box identical byte for byte. And
 * the proof is not vacuous, because the same deletion does change the 720.
 */
describe("proof 1 bis: the return reads no price, with the 720 inside", () => {
  const withoutInformativeFilings = (events: readonly LedgerEvent[]): LedgerEvent[] =>
    events.filter(
      (event) =>
        event.type !== "tax_return_filed" || (event as { model: string }).model === "renta",
    );

  /** A foreign account with securities, an income tax return filed and a 720 filed. */
  const withFilings = (): LedgerEvent[] => {
    const b = new LedgerBuilder();
    b.settings(HAND_SETTINGS);
    b.account("acc_ib", { platform: "ibkr", country: "IE" });
    b.asset("etf_a", { asset_type: "etf", transferable: false });
    b.asset("coin_c", { asset_type: "crypto", asset_class: "crypto", transferable: false });
    b.deposit({ account_id: "acc_ib", value_date: "2027-01-04", amount: "120000" });
    b.buy({
      account_id: "acc_ib",
      asset_id: "etf_a",
      value_date: "2027-01-05",
      quantity: "600",
      unit_price: "100",
    });
    b.buy({
      account_id: "acc_ib",
      asset_id: "coin_c",
      value_date: "2027-01-05",
      quantity: "10",
      unit_price: "1000",
    });
    b.sell({
      account_id: "acc_ib",
      asset_id: "etf_a",
      value_date: "2027-09-01",
      quantity: "100",
      unit_price: "150",
    });
    b.valuation({
      account_id: "acc_ib",
      asset_id: "etf_a",
      date: "2027-12-31",
      quantity: "500",
      unit_value: "150",
    });
    b.valuation({
      account_id: "acc_ib",
      asset_id: "coin_c",
      date: "2027-12-31",
      quantity: "10",
      unit_value: "6000",
    });
    b.filed({
      tax_year: 2027,
      filed_at: "2028-06-10",
      declared: {
        savings_base_eur: "5000",
        pending_losses: [{ origin_year: 2026, category: "capital_gain", amount_eur: "-400" }],
        deferred_losses_eur: "0",
      },
    });
    b.filed({
      model: "720",
      tax_year: 2027,
      filed_at: "2028-03-15",
      declared: {
        securities: { value_eur: "75000.00" },
        items: [
          {
            category: "securities",
            account_id: "acc_ib",
            asset_id: "etf_a",
            value_eur: "75000.00",
          },
        ],
      },
    });
    b.filed({
      model: "721",
      tax_year: 2027,
      filed_at: "2028-03-16",
      declared: {
        crypto: { value_eur: "60000.00" },
        items: [
          { category: "crypto", account_id: "acc_ib", asset_id: "coin_c", value_eur: "60000.00" },
        ],
      },
    });
    return b.build();
  };

  /**
   * Two things of the report are **about the file** and not figures of the
   * return, and deleting four lines of the ledger necessarily moves them: the
   * fingerprint of a filed return covers the lines that precede it, so it stops
   * verifying, and with it goes the decomposition of the difference into its
   * causes, which needs that prefix to be readable (plan §1.7).
   *
   * They are normalised here and **only** here, and what they hide is checked
   * separately below: the three figures of the comparison —what was declared,
   * what was computed then and what the ledger says today— have to be identical
   * in both readings, and they are.
   */
  const withoutFileFacts = (report: Record<string, unknown>): string => {
    const filing = report.filing as
      | {
          fingerprint_ok: boolean;
          unverified_prefix?: string;
          figures: Record<string, unknown>[];
        }
      | undefined;
    return JSON.stringify({
      ...report,
      // And the note that says **why** the prefix is not verified, which is
      // the same file fact seen from the report (feature 011, block 8).
      notes: (report.notes as { code: string }[]).filter(
        (entry) => entry.code !== "tax_filing_prefix_unverified",
      ),
      ...(filing === undefined
        ? {}
        : {
            filing: {
              ...filing,
              fingerprint_ok: "about the file, not about the figures",
              unverified_prefix: "about the file, not about the figures",
              figures: filing.figures.map(({ causes: _causes, ...rest }) => rest),
            },
          }),
    });
  };

  /** The three figures of the comparison, without the decomposition of their difference. */
  const figuresOf = (events: readonly LedgerEvent[], year: number): string => {
    const filing = taxReportJson(taxYear(events, year, { today: TODAY })).filing as {
      figures: Record<string, unknown>[];
    };
    return JSON.stringify(filing.figures.map(({ causes: _causes, ...rest }) => rest));
  };

  it("deletes the prices and the informative returns and the income tax does not move", () => {
    const events = withFilings();
    const stripped = withoutInformativeFilings(withoutPrices(events));
    expect(events.length - stripped.length).toBe(4);
    for (const year of [2027, 2028]) {
      const before = taxReportJson(taxYear(events, year, { today: TODAY }));
      const after = taxReportJson(taxYear(stripped, year, { today: TODAY }));
      expect(withoutFileFacts(after)).toBe(withoutFileFacts(before));
      expect(boxesJson(stripped, year)).toBe(boxesJson(events, year));
    }
    // What was normalised, checked for itself: every figure of the comparison
    // is the same with the 720 and the 721 gone.
    expect(figuresOf(stripped, 2027)).toBe(figuresOf(events, 2027));
    // **And why it stopped verifying**, anchored: the file really did lose four
    // lines, so the fingerprint of the income tax return no longer covers the
    // lines before it. That is the fingerprint working. If it ever failed for
    // another reason the normalisation above would swallow it in silence, and
    // a proof that swallows is a carpet.
    const finding = integrity(projectLedger(stripped, { collectErrors: true })).find((entry) =>
      entry.code.startsWith("filing_fingerprint"),
    );
    expect(finding?.code).toBe("filing_fingerprint_lines");
    // With the whole ledger it verifies, so the deletion is what moved it.
    expect(
      integrity(projectLedger(events, { collectErrors: true })).filter((entry) =>
        entry.code.startsWith("filing_fingerprint"),
      ),
    ).toEqual([]);
    // And what the income tax **does** read of what was filed is still there:
    // the anchor of the return of 2027.
    expect(json(events, 2028)).toContain("-400");
  });

  it("and the proof is not vacuous: the same deletion does change the 720", () => {
    const events = withFilings();
    const before = model720(events, 2027, { today: "2029-01-10" });
    const after = model720(withoutInformativeFilings(withoutPrices(events)), 2027, {
      today: "2029-01-10",
    });
    // With its valuations, the securities are worth 75.000,00 and oblige.
    expect(before.categories[1]?.verdict).toBe("obliged");
    // Without them there is no price at all, and nothing can be decided.
    expect(after.categories[1]?.verdict).toBe("undetermined");
    expect(model721(events, 2027, { today: "2029-01-10" }).categories[0]?.verdict).toBe("obliged");
  });
});

describe("proof 2: the defaults change nothing that already existed", () => {
  it("every disposal of the synthetic ledger has the own result of its realized gain, in the section its category says", () => {
    const events = synthetic();
    const state = projectLedger(events);
    for (const year of YEARS) {
      const report = taxYear(events, year, { today: TODAY });
      // Since criterion #24 the two sections are both possible, so the proof
      // is on the two together: every disposal is in one of them, once, with
      // the result the projection computed. Only an ETC or an ETP can be in
      // the second one with the defaults.
      for (const line of report.movable_capital.transmissions) {
        expect(["etc", "etp"]).toContain(line.asset_type);
      }
      const key = (entry: { event_id: string; account_id: string }) =>
        `${entry.event_id}|${entry.account_id}`;
      const order = (a: readonly string[], b: readonly string[]) =>
        (a[0] as string).localeCompare(b[0] as string) ||
        (a[1] as string).localeCompare(b[1] as string);
      const lines = [...report.capital_gains.lines, ...report.movable_capital.transmissions]
        .map((line) => [key(line), line.own_eur.roundToCents().amount.toString()])
        .sort(order);
      const gains = realizedGains(state, year)
        .map((gain) => [key(gain), gain.gain_eur_rounded.amount.toString()])
        .sort(order);
      expect(lines).toEqual(gains);
    }
  });

  it("an income category written in full gives the same report as none at all", () => {
    const events = synthetic();
    const explicit = events.map((event) =>
      event.type === "settings_changed"
        ? ({
            ...event,
            settings: {
              ...(event as SettingsChangedEvent).settings,
              income_category: DEFAULT_INCOME_CATEGORY,
            },
          } as LedgerEvent)
        : event,
    );
    for (const year of YEARS) {
      const before = taxReportJson(taxYear(events, year, { today: TODAY }));
      const after = taxReportJson(taxYear(explicit, year, { today: TODAY }));
      // Only the list of settings taken from the code can differ: that is the point of writing them.
      const strip = (report: Record<string, unknown>) => ({
        ...report,
        settings: undefined,
        notes: (report.notes as { code: string }[]).filter(
          (n) => n.code !== "tax_settings_default_used",
        ),
      });
      expect(JSON.stringify(strip(after))).toBe(JSON.stringify(strip(before)));
    }
  });
});

describe("proof 3: the report of the synthetic ledger is frozen", () => {
  it("reproduces tests/fixtures/ledger/synthetic-v1.tax.json", () => {
    const events = synthetic();
    const reports = Object.fromEntries(
      YEARS.map((year) => [String(year), taxReportJson(taxYear(events, year, { today: TODAY }))]),
    );
    expect(`${JSON.stringify(reports, null, 2)}\n`).toBe(fixtureText("synthetic-v1.tax.json"));
  });

  it("defers the 2027 loss of ast_world whole: the monthly contributions carry it", () => {
    const report = taxYear(synthetic(), 2027, { today: TODAY });
    const world = report.wash_sale.deferred.find((line) => line.asset_id === "ast_world");
    expect(world?.amount_eur_rounded.amount.toString()).toBe("-90.82");
    expect(yearOf(world?.fiscal_date as string)).toBe(2027);
  });
});
