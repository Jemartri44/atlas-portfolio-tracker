import { describe, expect, it } from "vitest";
import { ledgerOfBytes } from "../src/ledger.js";
import { sentinelLedger } from "./harness.js";

describe("ledgerOfBytes", () => {
  it("reads a ledger with a leading byte-order mark, as the API does", () => {
    const text = sentinelLedger();
    const plain = ledgerOfBytes(new TextEncoder().encode(text), "2027-06-01");
    const marked = ledgerOfBytes(new TextEncoder().encode(`﻿${text}`), "2027-06-01");
    expect(plain.ok).toBe(true);
    expect(marked.ok).toBe(true);
  });
});
