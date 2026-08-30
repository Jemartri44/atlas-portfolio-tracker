import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  isReservedEventType,
  isSupportedEventType,
  RESERVED_EVENT_TYPES,
  SUPPORTED_EVENT_TYPES,
} from "../../src/schema/envelope.js";
import { ASSET_CLASSES, ASSET_TYPES, BOOKS } from "../../src/schema/events.js";

describe("event type discriminator", () => {
  it("is at schema version 1 with 20 supported and 3 reserved types", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
    expect(SUPPORTED_EVENT_TYPES).toHaveLength(20);
    expect(RESERVED_EVENT_TYPES).toEqual(["corporate_action", "thesis_opened", "thesis_closed"]);
    expect(isSupportedEventType("buy")).toBe(true);
    expect(isSupportedEventType("thesis_opened")).toBe(false);
    expect(isSupportedEventType(1)).toBe(false);
    expect(isReservedEventType("thesis_opened")).toBe(true);
    expect(isReservedEventType("buy")).toBe(false);
    expect(isReservedEventType(null)).toBe(false);
  });

  it("exposes the catalogue enumerations of data-schema.md §6.1", () => {
    expect(BOOKS).toEqual(["core", "bucket"]);
    expect(ASSET_TYPES).toEqual(["fund", "etc", "etp", "stock", "crypto", "money_market"]);
    expect(ASSET_CLASSES).toEqual(["equity", "fixed_income", "gold", "crypto"]);
  });
});
