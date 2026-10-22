import { describe, expect, it } from "vitest";
import { fingerprintOfEvents } from "../../src/filings/fingerprint.js";
import type { TaxReturnFiledEvent } from "../../src/schema/events.js";
import { CURRENT_LEDGER_SCHEMA } from "../../src/schema/migrations/index.js";
import { sealHolds } from "../../src/sync/seal.js";
import { baseLedger, linesOf } from "./helpers.js";

describe("what seals the prefix (case 9)", () => {
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
