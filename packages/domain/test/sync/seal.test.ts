import { describe, expect, it } from "vitest";
import { fingerprintOfEvents } from "../../src/filings/fingerprint.js";
import { RESERVED_EVENT_TYPES, SUPPORTED_EVENT_TYPES } from "../../src/schema/envelope.js";
import type { LedgerEvent, TaxReturnFiledEvent } from "../../src/schema/events.js";
import { CURRENT_LEDGER_SCHEMA } from "../../src/schema/migrations/index.js";
import { SEALS_PREFIX, sealHolds, sealsPrefix } from "../../src/sync/seal.js";
import { baseLedger, linesOf } from "./helpers.js";

describe("what seals the prefix (case 9)", () => {
  /**
   * The closed list, walked over the whole catalogue: a type added tomorrow
   * turns this red until somebody decides, by hand, whether it seals.
   */
  it("classifies every type of the catalogue by hand, and exactly those two seal", () => {
    expect(Object.keys(SEALS_PREFIX).sort()).toEqual(
      [...SUPPORTED_EVENT_TYPES, ...RESERVED_EVENT_TYPES].sort(),
    );
    expect(SUPPORTED_EVENT_TYPES).toHaveLength(26);
    expect(
      Object.entries(SEALS_PREFIX)
        .filter(([, seals]) => seals)
        .map(([type]) => type)
        .sort(),
    ).toEqual(["filing_fingerprint_waived", "tax_return_filed"]);
  });

  it("treats a type outside the classification as sealing: the safe side", () => {
    expect(sealsPrefix({ type: "tomorrow" } as unknown as LedgerEvent)).toBe(true);
    expect(sealsPrefix({ type: "buy" } as unknown as LedgerEvent)).toBe(false);
  });

  it("checks a filing against the lines it would sit on: count and digest", () => {
    const { builder, events } = baseLedger();
    const filing = builder.filed({
      tax_year: 2026,
      ledger_fingerprint: fingerprintOfEvents(events),
    }) as TaxReturnFiledEvent;
    const prefix = linesOf(events);
    expect(sealHolds(prefix, filing, CURRENT_LEDGER_SCHEMA)).toBe(true);
    expect(sealHolds(prefix.slice(1), filing, CURRENT_LEDGER_SCHEMA)).toBe(false);
    const other = [...prefix.slice(0, -1), prefix[0] as string];
    expect(sealHolds(other, filing, CURRENT_LEDGER_SCHEMA)).toBe(false);
    const unreadable = [...prefix.slice(0, -1), "{"];
    expect(sealHolds(unreadable, filing, CURRENT_LEDGER_SCHEMA)).toBe(false);
  });
});
