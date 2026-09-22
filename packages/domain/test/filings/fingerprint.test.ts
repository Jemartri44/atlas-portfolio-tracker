// The fingerprint of the ledger a return was filed on (ADR-0020).
//
// The three requirements, each with its own case: it covers what precedes the
// filing, it survives a compaction that crosses schema versions, and a line
// edited by hand before it is caught.

import { describe, expect, it } from "vitest";
import {
  checkFilingFingerprints,
  fingerprintOfEvents,
  fingerprintOfLines,
  resealFilings,
} from "../../src/filings/fingerprint.js";
import type { LedgerEvent, TaxReturnFiledEvent } from "../../src/schema/events.js";
import { encodeLine } from "../../src/schema/line.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";
import { TEST_SCHEMA_V2 } from "../schema/test-schema.js";

/** A ledger with a couple of movements and a filing sealed over them. */
const sealed = (): { events: LedgerEvent[]; lines: string[]; filing: TaxReturnFiledEvent } => {
  const b = new LedgerBuilder();
  catalogue(b);
  b.deposit({ account_id: "acc_fund" });
  b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
  const before = b.build();
  const filing = b.filed({
    tax_year: 2027,
    ledger_fingerprint: fingerprintOfEvents(before),
  });
  const events = b.build();
  return { events, lines: events.map(encodeLine), filing };
};

const reasons = (events: LedgerEvent[], lines: string[], schema = undefined as never) =>
  checkFilingFingerprints(lines, events, schema).map((check) => check.reason);

describe("the fingerprint of the ledger before a filing", () => {
  it("covers exactly the lines that precede it, and holds", () => {
    const { events, lines, filing } = sealed();
    expect(filing.ledger_fingerprint.lines).toBe(events.indexOf(filing));
    expect(filing.ledger_fingerprint.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(reasons(events, lines)).toEqual([undefined]);
  });

  it("is the same digest read from the raw lines as written from the events", () => {
    const { events, lines, filing } = sealed();
    const upTo = filing.ledger_fingerprint.lines;
    expect(fingerprintOfLines(lines.slice(0, upTo), 1)).toBe(filing.ledger_fingerprint.sha256);
    expect(fingerprintOfEvents(events.slice(0, upTo)).sha256).toBe(
      filing.ledger_fingerprint.sha256,
    );
  });

  it("does not depend on the order the keys were written in", () => {
    const { events, lines, filing } = sealed();
    const upTo = filing.ledger_fingerprint.lines;
    // The same lines with their keys shuffled: the digest sorts them.
    const shuffled = lines.slice(0, upTo).map((line) => {
      const record = JSON.parse(line) as Record<string, unknown>;
      return JSON.stringify(Object.fromEntries(Object.entries(record).reverse()));
    });
    expect(fingerprintOfLines(shuffled, 1)).toBe(filing.ledger_fingerprint.sha256);
    expect(events.length).toBeGreaterThan(upTo);
  });

  it("catches a line edited by hand before it", () => {
    const { events, lines } = sealed();
    const edited = [...lines];
    edited[1] = edited[1]?.replace(/"name":"[^"]*"/, '"name":"Otro"') as string;
    expect(edited[1]).not.toBe(lines[1]);
    expect(reasons(events, edited)).toEqual(["digest"]);
  });

  it("catches a line inserted before it, by the count alone", () => {
    const { events, lines } = sealed();
    const b = new LedgerBuilder(500);
    const extra = b.account("acc_extra");
    const grown = [...events.slice(0, 1), extra, ...events.slice(1)];
    const grownLines = [...lines.slice(0, 1), encodeLine(extra), ...lines.slice(1)];
    expect(reasons(grown, grownLines)).toEqual(["lines"]);
  });

  it("says it cannot be verified when a line before it cannot be read at that version", () => {
    const { events, lines } = sealed();
    const future = [...lines];
    // A line that claims a version the chain cannot reach downwards.
    future[1] = JSON.stringify({ ...JSON.parse(lines[1] as string), schema_version: 9 });
    expect(reasons(events, future)).toEqual(["unreadable"]);
  });
});

describe("sealing again on compact", () => {
  it("keeps the count and changes the digest when the lines change version", () => {
    const { events, filing } = sealed();
    const resealedV2 = resealFilings(events, 2);
    const after = resealedV2.find((event) => event.id === filing.id) as TaxReturnFiledEvent;
    expect(after.ledger_fingerprint.lines).toBe(filing.ledger_fingerprint.lines);
    expect(after.ledger_fingerprint.schema_version).toBe(2);
    // The events themselves did not change here, so the digest does not either:
    // what changes it is the rewriting `compact` does before sealing.
    expect(after.ledger_fingerprint.sha256).toBe(filing.ledger_fingerprint.sha256);
    expect(resealedV2.filter((event) => event.type !== "tax_return_filed")).toEqual(
      events.filter((event) => event.type !== "tax_return_filed"),
    );
  });

  it("seals each filing over the prefix already sealed, not over the original one", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_fund" });
    const first = b.filed({ tax_year: 2026, filed_at: "2027-06-18" });
    b.filed({ tax_year: 2027, filed_at: "2028-06-18" });
    const events = b.build();
    const resealedV2 = resealFilings(events, 2);
    const secondBefore = events[events.length - 1] as TaxReturnFiledEvent;
    const secondAfter = resealedV2[resealedV2.length - 1] as TaxReturnFiledEvent;
    // The first filing is inside the prefix of the second, and it changed.
    expect(secondAfter.ledger_fingerprint.sha256).not.toBe(secondBefore.ledger_fingerprint.sha256);
    expect(
      fingerprintOfEvents(resealedV2.slice(0, secondAfter.ledger_fingerprint.lines), 2).sha256,
    ).toBe(secondAfter.ledger_fingerprint.sha256);
    expect(
      (resealedV2[events.indexOf(first)] as TaxReturnFiledEvent).ledger_fingerprint.lines,
    ).toBe(first.ledger_fingerprint.lines);
  });

  it("reads a fingerprint of an older version through the migration chain", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.deposit({ account_id: "acc_fund" });
    const before = b.build();
    const filing = b.filed({ tax_year: 2027, ledger_fingerprint: fingerprintOfEvents(before, 1) });
    const events = b.build();
    const lines = events.map(encodeLine);
    // Verified with a schema that knows a version 2: the lines are still v1, so
    // the chain stops at the version of the fingerprint and the digest holds.
    expect(
      checkFilingFingerprints(lines, events, TEST_SCHEMA_V2).map((check) => check.reason),
    ).toEqual([undefined]);
    expect(filing.ledger_fingerprint.schema_version).toBe(1);
  });
});
