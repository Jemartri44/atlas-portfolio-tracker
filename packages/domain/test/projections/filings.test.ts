// Filed returns in the projection (ADR-0020): the chain of supplementary
// returns, which one is in force at a date, and what the ledger refuses so
// that "which return of this year counts?" always has exactly one answer.

import { describe, expect, it } from "vitest";
import type { ProjectionError } from "../../src/errors.js";
import { closedYears, filingInForce } from "../../src/projections/filings.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { FiledInformativeFigures, LedgerEvent } from "../../src/schema/events.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

const project = (events: readonly LedgerEvent[]) => projectLedger(events, { collectErrors: true });

/** The code the projection refused the last event of the ledger with. */
const refusal = (events: readonly LedgerEvent[]): string => {
  const state = project(events);
  const last = state.invalid[state.invalid.length - 1];
  return last === undefined ? "accepted" : last.error.code;
};

const base = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  catalogue(b);
  return b;
};

describe("a filed return in the projection", () => {
  it("is a document, not an operation: no business date, no position, no cash", () => {
    const b = base();
    const filing = b.filed({ tax_year: 2027 });
    const state = project(b.build());
    expect([...state.filings.keys()]).toEqual([filing.id]);
    expect(state.gains).toEqual([]);
    expect(state.cash.size).toBe(0);
    expect(state.warnings).toEqual([]);
  });

  it("checks the accounts and the assets a 720 declares against the catalogue", () => {
    const declared: FiledInformativeFigures = {
      securities: { value_eur: "100" },
      items: [
        { category: "securities", account_id: "acc_etf", asset_id: "ast_world", value_eur: "100" },
      ],
    };
    const ok = base();
    ok.filed({ tax_year: 2027, model: "720", declared });
    expect(refusal(ok.build())).toBe("accepted");

    const noAccount = base();
    noAccount.filed({
      tax_year: 2027,
      model: "720",
      declared: { ...declared, items: [{ ...declared.items[0], account_id: "acc_nope" } as never] },
    });
    expect(refusal(noAccount.build())).toBe("unknown_account");

    const noAsset = base();
    noAsset.filed({
      tax_year: 2027,
      model: "720",
      declared: { ...declared, items: [{ ...declared.items[0], asset_id: "ast_nope" } as never] },
    });
    expect(refusal(noAsset.build())).toBe("unknown_asset");
  });
});

describe("the chain of supplementary returns", () => {
  it("refuses a second filing of the same model and year that does not say what it replaces", () => {
    const b = base();
    b.filed({ tax_year: 2027 });
    b.filed({ tax_year: 2027, filed_at: "2028-09-01" });
    expect(refusal(b.build())).toBe("filing_already_exists");
  });

  it("accepts one of another model or another year with no chain at all", () => {
    const b = base();
    b.filed({ tax_year: 2027 });
    b.filed({ tax_year: 2027, model: "720", filed_at: "2028-03-20" });
    b.filed({ tax_year: 2028, filed_at: "2029-06-18" });
    expect(refusal(b.build())).toBe("accepted");
    expect(project(b.build()).filings.size).toBe(3);
  });

  it("puts the last of the chain in force and leaves the rest superseded", () => {
    const b = base();
    const first = b.filed({ tax_year: 2027 });
    const second = b.filed({ tax_year: 2027, filed_at: "2028-09-01", supersedes: first.id });
    const third = b.filed({ tax_year: 2027, filed_at: "2028-11-02", supersedes: second.id });
    const state = project(b.build());
    expect(refusal(b.build())).toBe("accepted");
    expect(state.filings.get(first.id)?.superseded_by).toBe(second.id);
    expect(state.filings.get(second.id)?.superseded_by).toBe(third.id);
    expect(state.filings.get(third.id)?.superseded_by).toBeUndefined();
    expect(filingInForce(state, "renta", 2027, "2030-01-01")?.event_id).toBe(third.id);
  });

  it("refuses a supersedes that points at the wrong thing, saying which", () => {
    const reasonOf = (events: readonly LedgerEvent[]): unknown => {
      const state = project(events);
      const last = state.invalid[state.invalid.length - 1] as { error: ProjectionError };
      return last.error.details.reason;
    };
    const other = base();
    const buy = other.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    other.filed({ tax_year: 2027, supersedes: buy.id });
    expect(reasonOf(other.build())).toBe("not_a_filing");

    const model = base();
    const renta = model.filed({ tax_year: 2027 });
    model.filed({ tax_year: 2027, model: "720", filed_at: "2028-07-01", supersedes: renta.id });
    expect(reasonOf(model.build())).toBe("other_model");

    const year = base();
    const of2027 = year.filed({ tax_year: 2027 });
    year.filed({ tax_year: 2028, filed_at: "2029-06-18", supersedes: of2027.id });
    expect(reasonOf(year.build())).toBe("other_year");

    const twice = base();
    const first = twice.filed({ tax_year: 2027 });
    twice.filed({ tax_year: 2027, filed_at: "2028-09-01", supersedes: first.id });
    twice.filed({ tax_year: 2027, filed_at: "2028-11-02", supersedes: first.id });
    expect(reasonOf(twice.build())).toBe("already_superseded");

    // A supplementary return cannot be older than what it replaces.
    const earlier = base();
    const late = earlier.filed({ tax_year: 2027, filed_at: "2028-09-01" });
    earlier.filed({ tax_year: 2027, filed_at: "2028-07-01", supersedes: late.id });
    expect(reasonOf(earlier.build())).toBe("filed_later");
    expect(refusal(earlier.build())).toBe("filing_supersedes_invalid");
  });
});

describe("what was in force on a given day", () => {
  const chained = () => {
    const b = base();
    const first = b.filed({ tax_year: 2027, filed_at: "2028-06-18" });
    const second = b.filed({ tax_year: 2027, filed_at: "2028-09-01", supersedes: first.id });
    return { state: project(b.build()), first, second };
  };

  it("does not see what was filed after the day asked", () => {
    const { state, first, second } = chained();
    expect(filingInForce(state, "renta", 2027, "2028-06-17")).toBeUndefined();
    expect(filingInForce(state, "renta", 2027, "2028-06-18")?.event_id).toBe(first.id);
    expect(filingInForce(state, "renta", 2027, "2028-08-31")?.event_id).toBe(first.id);
    expect(filingInForce(state, "renta", 2027, "2028-09-01")?.event_id).toBe(second.id);
  });

  it("of two filed the same day, the later line is the later filing", () => {
    const b = base();
    const first = b.filed({ tax_year: 2027, filed_at: "2028-06-18", notes: "la original" });
    const second = b.filed({ tax_year: 2027, filed_at: "2028-06-18", supersedes: first.id });
    const state = project(b.build());
    expect(state.filings.get(first.id)?.notes).toBe("la original");
    expect(filingInForce(state, "renta", 2027, "2028-06-18")?.event_id).toBe(second.id);
  });

  it("lists the closed years of every model, in order, as of that day", () => {
    const b = base();
    b.filed({ tax_year: 2027, filed_at: "2028-06-18" });
    b.filed({ tax_year: 2027, model: "720", filed_at: "2028-03-20" });
    b.filed({ tax_year: 2026, filed_at: "2027-06-18" });
    const state = project(b.build());
    expect(closedYears(state, "2030-01-01").map((entry) => [entry.year, entry.model])).toEqual([
      [2026, "renta"],
      [2027, "720"],
      [2027, "renta"],
    ]);
    expect(closedYears(state, "2028-03-20").map((entry) => [entry.year, entry.model])).toEqual([
      [2026, "renta"],
      [2027, "720"],
    ]);
    expect(closedYears(state, "2026-01-01")).toEqual([]);
  });

  it("a filing nobody replaced is in force; a reversed one is not there at all", () => {
    const b = base();
    const filing = b.filed({ tax_year: 2027 });
    b.reversal(filing.id, "nunca se presentó");
    const state = project(b.build());
    expect(state.filings.size).toBe(0);
    expect(filingInForce(state, "renta", 2027, "2030-01-01")).toBeUndefined();
  });

  /**
   * Reversing a filing that another one supersedes leaves the supplementary
   * pointing at nothing, which is what makes `reverseEvent` refuse it: a
   * consumed event cannot be annulled (ADR-0003), and no line of `rectify.ts`
   * had to learn about filings for that to hold.
   */
  it("reversing a superseded filing leaves the supplementary one invalid", () => {
    const b = base();
    const first = b.filed({ tax_year: 2027 });
    const second = b.filed({ tax_year: 2027, filed_at: "2028-09-01", supersedes: first.id });
    b.reversal(first.id, "me equivoqué al registrarla");
    const state = project(b.build());
    expect(state.invalid.map((entry) => entry.event.id)).toEqual([second.id]);
    expect((state.invalid[0] as { error: ProjectionError }).error.code).toBe(
      "filing_supersedes_invalid",
    );
    // Reversing the head is fine: the one before it comes back into force.
    const head = base();
    const original = head.filed({ tax_year: 2027 });
    const supplementary = head.filed({
      tax_year: 2027,
      filed_at: "2028-09-01",
      supersedes: original.id,
    });
    head.reversal(supplementary.id, "no llegó a presentarse");
    const back = project(head.build());
    expect(back.invalid).toEqual([]);
    expect(filingInForce(back, "renta", 2027, "2030-01-01")?.event_id).toBe(original.id);
  });
});
