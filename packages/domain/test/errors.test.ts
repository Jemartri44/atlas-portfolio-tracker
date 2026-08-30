import { describe, expect, it } from "vitest";
import {
  ArchiveExistsError,
  CompactRejectedError,
  ConflictError,
  CurrencyMismatchError,
  DependentEventsError,
  DomainError,
  DuplicateFingerprintError,
  NotFoundError,
  ProjectionError,
  SchemaTooNewError,
  UnsupportedEventError,
  ValidationError,
} from "../src/errors.js";

describe("domain errors", () => {
  it("carry a code, a message and details", () => {
    const error = new ValidationError("invalid_decimal", "not a decimal", { field: "amount" });
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ValidationError");
    expect(error.code).toBe("invalid_decimal");
    expect(error.message).toBe("not a decimal");
    expect(error.details).toEqual({ field: "amount" });
  });

  it("default to empty details", () => {
    expect(new DomainError("x", "y").details).toEqual({});
    expect(new ProjectionError("x", "01A", "y").details).toEqual({ event_id: "01A" });
  });

  it("build specific errors with their context", () => {
    expect(new CurrencyMismatchError("EUR", "USD").details).toEqual({ left: "EUR", right: "USD" });
    const projection = new ProjectionError("insufficient_lots", "01A", "no lots", { asset: "a" });
    expect(projection.eventId).toBe("01A");
    expect(projection.details).toEqual({ asset: "a", event_id: "01A" });
    expect(new SchemaTooNewError(2, 1).details).toEqual({ found: 2, supported: 1 });
    expect(new ConflictError().code).toBe("conflict");
    expect(new CompactRejectedError("invalid_events", { affected: [] }).message).toMatch(/rectify/);
    expect(new CompactRejectedError("projection_changed", { keys: ["lots"] }).details).toEqual({
      keys: ["lots"],
    });
    expect(new ArchiveExistsError("ledger-2026-09-01-v1.jsonl").details).toEqual({
      archive_name: "ledger-2026-09-01-v1.jsonl",
    });
    expect(new NotFoundError("01B").details).toEqual({ id: "01B" });
    const duplicate = new DuplicateFingerprintError("sha256:abc", ["01C"]);
    expect(duplicate.existing).toEqual(["01C"]);
    const dependent = new DependentEventsError("01D", [{ id: "01E", type: "sell", error: "x" }]);
    expect(dependent.affected).toHaveLength(1);
    expect(dependent.details).toMatchObject({ target_id: "01D" });
    expect(new UnsupportedEventError("thesis_opened", "01F").details).toEqual({
      type: "thesis_opened",
      event_id: "01F",
    });
  });
});
