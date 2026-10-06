// What an initialisation refuses before calling the remote (V7).

import { describe, expect, it } from "vitest";
import type { LedgerEvent } from "../../src/schema/events.js";
import { initRefusal } from "../../src/sync/init-refusal.js";
import { baseLedger, byTradeDate, reorderable } from "./helpers.js";

describe("initialising the cloud", () => {
  const { events } = baseLedger();

  it("refuses to initialise an invalid ledger before calling (V7)", () => {
    expect(initRefusal(events)).toBeUndefined();
    const { builder, events: reordered } = reorderable();
    const invalid = [...reordered, builder.settings(byTradeDate)];
    const refusal = initRefusal(invalid);
    expect(refusal?.code).toBe("init_refused_invalid_ledger");
    expect(refusal?.details.invalid).toEqual([
      { id: reordered[reordered.length - 1]?.id, code: "insufficient_position" },
    ]);
    const twice = initRefusal([...events, events[0] as LedgerEvent]);
    expect(twice?.details.invalid).toEqual([{ id: events[0]?.id, code: "duplicate_id" }]);
  });
});
