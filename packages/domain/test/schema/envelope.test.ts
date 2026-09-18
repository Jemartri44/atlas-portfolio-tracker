import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  isReservedEventType,
  isSupportedEventType,
  RESERVED_EVENT_TYPES,
  SUPPORTED_EVENT_TYPES,
} from "../../src/schema/envelope.js";
import {
  ASSET_CLASSES,
  ASSET_TYPES,
  BOOKS,
  CORPORATE_ACTION_KINDS,
  EFFECT_OPS,
} from "../../src/schema/events.js";

describe("event type discriminator", () => {
  it("is at schema version 1 with 24 supported types and no reserved type left", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
    // 24 with `swap` (ADR-0021). `docs/data-schema.md` §3 lists one more,
    // `tax_return_filed`, which ADR-0020 defines and phase 5 implements.
    expect(SUPPORTED_EVENT_TYPES).toHaveLength(24);
    expect(isSupportedEventType("swap")).toBe(true);
    expect(RESERVED_EVENT_TYPES).toEqual([]);
    expect(isSupportedEventType("buy")).toBe(true);
    expect(isSupportedEventType("thesis_opened")).toBe(true);
    expect(isSupportedEventType("corporate_action")).toBe(true);
    expect(isSupportedEventType(1)).toBe(false);
    expect(isReservedEventType("thesis_opened")).toBe(false);
    expect(isReservedEventType("buy")).toBe(false);
    expect(isReservedEventType(null)).toBe(false);
  });

  it("exposes the catalogue enumerations of data-schema.md §6.1", () => {
    expect(BOOKS).toEqual(["core", "bucket"]);
    expect(ASSET_TYPES).toEqual(["fund", "etf", "etc", "etp", "stock", "crypto", "money_market"]);
    expect(ASSET_CLASSES).toEqual(["equity", "fixed_income", "gold", "crypto"]);
  });

  it("exposes the corporate action kinds of data-schema.md §8.5 and the five primitives", () => {
    expect(CORPORATE_ACTION_KINDS).toHaveLength(13);
    expect(CORPORATE_ACTION_KINDS[0]).toBe("split");
    expect(CORPORATE_ACTION_KINDS[12]).toBe("issuer_restructuring");
    expect(EFFECT_OPS).toEqual(["scale", "convert", "carve_out", "forced_sale", "grant"]);
  });
});
