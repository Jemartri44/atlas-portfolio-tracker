// Correcting an event and then correcting it back leaves the projection identical (ADR-0003).

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { Draft, SupportedEvent } from "../../src/schema/events.js";
import { correctEvent } from "../../src/usecases/rectify.js";
import { TestStore } from "../memory-store.js";
import { testDeps } from "../usecases/helpers.js";
import { aggregate } from "./aggregate.js";
import { ledgerOf, opArb } from "./projection.test.js";

const draftOf = (event: SupportedEvent): Draft => {
  const {
    schema_version: _v,
    id: _id,
    recorded_at: _at,
    ...rest
  } = event as SupportedEvent & {
    fingerprint?: string;
  };
  delete (rest as { fingerprint?: string }).fingerprint;
  return rest as unknown as Draft;
};

describe("correction round trip", () => {
  it("correct(x → y) then correct(y → x) projects like the untouched ledger", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { minLength: 1, maxLength: 20 }), async (ops) => {
        const { events } = ledgerOf(ops);
        const last = [...events]
          .reverse()
          .find(
            (event) => event.type === "buy" || event.type === "sell" || event.type === "transfer",
          );
        fc.pre(last !== undefined);
        const target = last as SupportedEvent;
        const store = new TestStore(events);
        const deps = testDeps(store);
        const original = draftOf(target);
        const changed = { ...original, notes: "corrected" } as Draft;
        const first = await correctEvent(deps, target.id, changed, "first");
        const second = await correctEvent(deps, first.event.id, original, "back", {
          confirmDuplicate: true,
        });
        expect(second.event.corrects_id).toBe(first.event.id);
        expect(aggregate(projectLedger(store.all()))).toEqual(aggregate(projectLedger(events)));
      }),
      { numRuns: 40 },
    );
  });
});
