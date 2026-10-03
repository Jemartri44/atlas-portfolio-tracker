// Review of PR #109 (avisos B2 and N1): what a ledger that does not load
// means for a warning. A passing failure to read it is retried the next day;
// a ledger with invalid events is said as such; content that does not decode
// is said by its code; and no ledger at all is nothing to do.

import { describe, expect, it } from "vitest";
import { ledgerFailureKind } from "../../src/jobs/ledger-failure.js";

describe("the kind of a ledger that does not load", () => {
  it("tells a passing failure from a ledger that is wrong, and from none", () => {
    expect(ledgerFailureKind("ledger_unavailable")).toBe("transient");
    expect(ledgerFailureKind("ledger_unreadable")).toBe("transient");
    expect(ledgerFailureKind("ledger_invalid")).toBe("invalid");
    expect(ledgerFailureKind("ledger_absent")).toBe("absent");
    for (const code of ["invalid_envelope", "schema_version_newer", "not_utf8"]) {
      expect(ledgerFailureKind(code), code).toBe("content");
    }
  });
});
