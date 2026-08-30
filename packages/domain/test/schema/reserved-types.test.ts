// The reserved-type mechanism (data-schema.md §3, feature 001 R14) stays in
// place although the list is empty: a type reserved by a later feature must be
// accepted by the loader and rejected by the projection. Exercised by mocking
// the envelope module with a future type.

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/schema/envelope.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/schema/envelope.js")>();
  return {
    ...original,
    RESERVED_EVENT_TYPES: ["future_event"],
    isReservedEventType: (value: unknown) => value === "future_event",
  };
});

const { validateShape } = await import("../../src/schema/validate.js");
const { projectLedger } = await import("../../src/projections/project-ledger.js");
const { integrity } = await import("../../src/projections/integrity.js");
const { UnsupportedEventError } = await import("../../src/errors.js");
const { catalogue, LedgerBuilder } = await import("../ledger-builder.js");
const { envelope, ID } = await import("../samples.js");

describe("reserved event types of a later feature", () => {
  it("pass the loader at envelope level without field checks", () => {
    const reserved = { ...envelope(ID.buy, "future_event" as never), anything: 1 };
    expect(validateShape(reserved)).toBe(reserved);
  });

  it("are rejected by the projection, or collected as invalid", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.raw({ ...b.nextEnvelope("future_event" as never), anything: 1 } as never);
    expect(() => projectLedger(b.build())).toThrow(UnsupportedEventError);
    const collected = projectLedger(b.build(), { collectErrors: true });
    expect(collected.invalid[0]?.error.code).toBe("unsupported_event");
    expect(integrity(collected)[0]?.code).toBe("unsupported_event");
  });
});
