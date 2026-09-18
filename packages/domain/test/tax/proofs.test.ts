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
import { realizedGains } from "../../src/projections/gains.js";
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
import { taxReportJson } from "../../src/tax/json.js";
import { taxYear } from "../../src/tax/year.js";
import { fixtureLines, fixtureText } from "../fixtures-path.js";
import { taxLedgerOf, taxOpArb } from "../properties/tax-ledgers.js";
import { exerciseLedger } from "./exercise-ledger.js";

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

const synthetic = (): LedgerEvent[] =>
  fixtureLines("synthetic-v1.jsonl").map((line) => decodeLine(line).event);

const YEARS = [2026, 2027, 2028, 2029];

describe("proof 1: no figure of the return depends on a price", () => {
  it("deletes every price of the synthetic ledger and every report is identical", () => {
    const events = synthetic();
    const stripped = withoutPrices(events);
    expect(stripped.length).toBeLessThan(events.length);
    for (const year of YEARS) {
      expect(json(stripped, year)).toBe(json(events, year));
    }
  });

  it("deletes every price of the hand-computed exercise and every report is identical", () => {
    const { events } = exerciseLedger();
    const stripped = withoutPrices(events);
    expect(events.length - stripped.length).toBe(4);
    for (const year of [2027, 2028]) {
      expect(json(stripped, year)).toBe(json(events, year));
    }
  });

  it("holds on random ledgers, in both directions: without their valuations, and with more of them", () => {
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
        },
      ),
      { numRuns: 200 },
    );
  });

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

describe("proof 2: the defaults change nothing that already existed", () => {
  it("every disposal of the synthetic ledger is a capital gain whose own result is its realized gain", () => {
    const events = synthetic();
    const state = projectLedger(events);
    for (const year of YEARS) {
      const report = taxYear(events, year, { today: TODAY });
      expect(report.movable_capital.transmissions).toEqual([]);
      const gains = realizedGains(state, year);
      expect(
        report.capital_gains.lines.map((line) => [
          line.event_id,
          line.account_id,
          line.own_eur.roundToCents().amount.toString(),
        ]),
      ).toEqual(
        gains.map((gain) => [
          gain.event_id,
          gain.account_id,
          gain.gain_eur_rounded.amount.toString(),
        ]),
      );
    }
  });

  it("an income category written in full as capital gains gives the same report as none at all", () => {
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
