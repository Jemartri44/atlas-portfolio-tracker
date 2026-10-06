// The refusal as an error, with the literal of its code (ADR-0032).

import { describe, expect, it } from "vitest";
import { DomainError } from "../../src/errors.js";
import { RefusedError } from "../../src/sync/permission.js";

describe("a refusal as an error", () => {
  it("stops an order with the literal of the refusal", () => {
    const error = new RefusedError({ code: "init_refused_invalid_ledger", details: { x: 1 } });
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("init_refused_invalid_ledger");
    expect(error.details).toEqual({ x: 1 });
  });
});
