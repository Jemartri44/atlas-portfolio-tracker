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
  });
});
