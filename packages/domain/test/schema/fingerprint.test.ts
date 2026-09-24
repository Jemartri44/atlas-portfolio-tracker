import { describe, expect, it } from "vitest";
import type { SupportedEvent } from "../../src/schema/events.js";
import { fingerprintOf } from "../../src/schema/fingerprint.js";
import { SAMPLES, sampleList, variant } from "../samples.js";

const fp = (raw: Record<string, unknown>): string | undefined =>
  fingerprintOf(raw as unknown as SupportedEvent);

describe("fingerprintOf", () => {
  it("is deterministic, prefixed and sensitive to the business tuple", () => {
    const first = fingerprintOf(SAMPLES.buy);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(fingerprintOf({ ...SAMPLES.buy })).toBe(first);
    expect(fp(variant(SAMPLES.buy, { quantity: "10.123457" }))).not.toBe(first);
    expect(
      fp(variant(SAMPLES.buy, { notes: "irrelevant", id: "01ARYZ6S41TSV4RRFFQ69G5FZZ" })),
    ).toBe(first);
  });

  it("leaves broker_settled_eur out: typed by hand or imported, it is the same operation (mutant 14)", () => {
    // ADR-0030: the same operation registered by hand and later imported with
    // the broker's euros has to be caught as a duplicate, carrying it or not.
    for (const sample of [
      SAMPLES.buy,
      SAMPLES.sell,
      SAMPLES.dividend,
      SAMPLES.interest,
      SAMPLES.standalone_fee,
    ]) {
      const plain = variant(sample, { currency: "USD", fx_rate: "1.1" });
      expect(fp({ ...plain, broker_settled_eur: "123.45" }), sample.type).toBe(fp(plain));
      expect(fp(plain)).toBeDefined();
    }
  });

  it("does not include the own id: two identical manual entries collide", () => {
    const a = variant(SAMPLES.buy, { id: "01ARYZ6S41TSV4RRFFQ69G5FA5" });
    const b = variant(SAMPLES.buy, {
      id: "01ARYZ6S41TSV4RRFFQ69G5FA6",
      recorded_at: "2026-09-02T00:00:00Z",
    });
    expect(fp(a)).toBe(fp(b));
  });

  it("uses the broker reference when present and the amount over the unit price", () => {
    expect(fp(variant(SAMPLES.buy, { broker_ref: "T1" }))).not.toBe(fingerprintOf(SAMPLES.buy));
    expect(fp(variant(SAMPLES.buy, { unit_price: "1" }))).toBe(fingerprintOf(SAMPLES.buy));
    expect(fp(variant(SAMPLES.buy, { amount: undefined, unit_price: "1" }))).not.toBe(
      fp(variant(SAMPLES.buy, { amount: undefined, unit_price: "2" })),
    );
    expect(fp(variant(SAMPLES.buy, { unit_price: undefined }))).toBe(fingerprintOf(SAMPLES.buy));
    expect(fp(variant(SAMPLES.buy, { amount: undefined, unit_price: undefined }))).toMatch(
      /^sha256:/,
    );
  });

  /**
   * A filing is identified by what the tax agency gave back: the same model,
   * year and receipt recorded twice is **the same filing**, not two, whatever
   * date each entry carries. With `filed_at` in the tuple the second one did
   * not even ask for confirmation, and two filings stayed in the ledger for
   * one — both feeding the chain of supplementary returns and the anchor of
   * the year (feature 011, block 3).
   */
  it("identifies a filing by model, year and receipt, not by the date it was filed", () => {
    const filed = SAMPLES.tax_return_filed;
    expect(fp(variant(filed, { filed_at: "2026-06-19" }))).toBe(fingerprintOf(filed));
    expect(fp(variant(filed, { tax_year: 2024 }))).not.toBe(fingerprintOf(filed));
    expect(fp(variant(filed, { model: "720" }))).not.toBe(fingerprintOf(filed));
  });

  it("does not make a supplementary return collide with the one it replaces", () => {
    const filed = SAMPLES.tax_return_filed;
    // A supplementary return has a receipt of its own, which is what tells it
    // apart — and what the comment of the code promised before anything tied it.
    expect(
      fp(
        variant(filed, {
          receipt_reference: "100-2025-000000000001",
          supersedes: filed.id,
          filed_at: "2026-09-01",
        }),
      ),
    ).not.toBe(fingerprintOf(filed));
  });

  it("covers every fingerprinted type and returns undefined for the rest", () => {
    for (const sample of sampleList()) {
      const value = fingerprintOf(sample);
      if ("fingerprint" in sample) {
        expect(value).toMatch(/^sha256:/);
      } else {
        expect(value).toBeUndefined();
      }
    }
    expect(fp(variant(SAMPLES.dividend, { broker_ref: "D1" }))).not.toBe(
      fingerprintOf(SAMPLES.dividend),
    );
    expect(fp(variant(SAMPLES.interest, { broker_ref: "I1" }))).not.toBe(
      fingerprintOf(SAMPLES.interest),
    );
    expect(fp(variant(SAMPLES.fx_exchange, { broker_ref: "F1" }))).not.toBe(
      fingerprintOf(SAMPLES.fx_exchange),
    );
    expect(fingerprintOf(SAMPLES.cash_deposit)).not.toBe(fingerprintOf(SAMPLES.cash_withdrawal));
    const action = fingerprintOf(SAMPLES.corporate_action);
    expect(fp(variant(SAMPLES.corporate_action, { kind: "split" }))).not.toBe(action);
    expect(fp(variant(SAMPLES.corporate_action, { effective_date: "2027-04-02" }))).not.toBe(
      action,
    );
    expect(fp(variant(SAMPLES.corporate_action, { effects: [], notes: undefined }))).toBe(action);
  });
});
