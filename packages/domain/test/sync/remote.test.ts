// What the remote accepts, row by row of `docs/api.md` §5.2 and §5.5, over the
// same use case the client re-applies with.

import { describe, expect, it } from "vitest";
import { fingerprintOfEvents } from "../../src/filings/fingerprint.js";
import type { AppendEntry } from "../../src/ports/remote-ledger.js";
import { RemoteError } from "../../src/ports/remote-ledger.js";
import type { BuyEvent, CashDepositEvent, LedgerEvent } from "../../src/schema/events.js";
import { encodeLine } from "../../src/schema/line.js";
import { CURRENT_LEDGER_SCHEMA } from "../../src/schema/migrations/index.js";
import {
  acceptAppend,
  acceptInit,
  initDuplicateIds,
  parseAppendBody,
  parseInitBody,
  parsePublishBody,
  type RemoteRules,
} from "../../src/sync/remote.js";
import {
  baseLedger,
  byTradeDate,
  correction,
  device,
  linesOf,
  reorderable,
  textOf,
} from "./helpers.js";

const rules: RemoteRules = {
  schema: CURRENT_LEDGER_SCHEMA,
  now: new Date("2027-08-30T10:00:00.000Z"),
  clockToleranceMs: 5 * 60 * 1000,
};

const bodyError = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(RemoteError);
    expect((error as RemoteError).code).toBe("body_invalid");
    expect((error as RemoteError).status).toBe(400);
    return (error as RemoteError).details.reason as string;
  }
  throw new Error("accepted");
};

const plain = (events: readonly LedgerEvent[]): AppendEntry[] =>
  events.map((event) => ({ line: encodeLine(event) }));

describe("the bodies of the routes, by their shape only", () => {
  it("reads an append, keeping only the declarations that are true", () => {
    expect(
      parseAppendBody({
        lines: [
          { line: "x", confirm_duplicate: true, has_correction: false, chain_continues: true },
        ],
      }),
    ).toEqual([{ line: "x", confirm_duplicate: true, chain_continues: true }]);
    expect(parseAppendBody({ lines: [{ line: "y", has_correction: true }] })).toEqual([
      { line: "y", has_correction: true },
    ]);
  });

  it("refuses the shape, never the content of a line: a device_id is body_invalid (§2.3)", () => {
    expect(bodyError(() => parseAppendBody(null))).toBe("shape");
    expect(bodyError(() => parseAppendBody({ lines: [], device_id: "d" }))).toBe("shape");
    expect(bodyError(() => parseAppendBody({ lines: {} }))).toBe("shape");
    expect(bodyError(() => parseAppendBody({ lines: [1] }))).toBe("entry");
    expect(bodyError(() => parseAppendBody({ lines: [{ line: "x", device_id: "d" }] }))).toBe(
      "entry",
    );
    expect(bodyError(() => parseAppendBody({ lines: [{ line: 1 }] }))).toBe("line");
    expect(bodyError(() => parseAppendBody({ lines: [{ line: "a\nb" }] }))).toBe("line");
    expect(bodyError(() => parseAppendBody({ lines: [{ line: "a\r" }] }))).toBe("line");
    expect(bodyError(() => parseAppendBody({ lines: [{ line: "a", has_correction: 1 }] }))).toBe(
      "has_correction",
    );
    // Not JSON of a line at all is still a shape-valid body: judged per line.
    expect(parseAppendBody({ lines: [{ line: "{" }] })).toEqual([{ line: "{" }]);
  });

  it("reads a published state, never with a device", () => {
    const state = { pending: 2, held: 1, last_sync_at: "2027-08-30T10:00:00Z" };
    expect(parsePublishBody(state)).toEqual(state);
    for (const bad of [
      null,
      { ...state, device_id: "d" },
      { ...state, pending: -1 },
      { ...state, pending: 1.5 },
      { ...state, held: -1 },
      { ...state, held: "1" },
      { ...state, last_sync_at: 1 },
    ]) {
      expect(bodyError(() => parsePublishBody(bad))).toBe("publish");
    }
  });

  it("reads an initialisation", () => {
    expect(parseInitBody({ content: "x\n", confirm_duplicate_ids: ["a"] })).toEqual({
      content: "x\n",
      confirm_duplicate_ids: ["a"],
    });
    for (const bad of [
      null,
      { content: "x", confirm_duplicate_ids: [], extra: 1 },
      { content: 1, confirm_duplicate_ids: [] },
      { content: "x", confirm_duplicate_ids: "a" },
      { content: "x", confirm_duplicate_ids: [1] },
    ]) {
      expect(bodyError(() => parseInitBody(bad))).toBe("init");
    }
  });
});

describe("acceptAppend: the table of §5.2, in its order", () => {
  const { events } = baseLedger();
  const remote = linesOf(events);
  const buy = events[events.length - 1] as BuyEvent;

  it("writes everything valid, in order", () => {
    const b = device(100);
    const one = b.deposit({ account_id: "acc_fund" });
    const two = b.deposit({ account_id: "acc_fund", amount: "5" });
    expect(acceptAppend(remote, plain([one, two]), rules)).toEqual({
      accepted: 2,
      lines: linesOf([one, two]),
    });
  });

  it("writes the valid stretch up to the first rejected line, and nothing after, even if valid", () => {
    const b = device(200);
    const one = b.deposit({ account_id: "acc_fund" });
    const bad = b.sell({ account_id: "acc_fund", asset_id: "ast_world", quantity: "99" });
    const three = b.deposit({ account_id: "acc_fund", amount: "5" });
    const result = acceptAppend(remote, plain([one, bad, three]), rules);
    expect(result.accepted).toBe(1);
    expect(result.lines).toEqual(linesOf([one]));
    expect(result.rejected).toEqual({
      index: 1,
      id: bad.id,
      code: "domain_rejected",
      details: { domain_code: "insufficient_position" },
    });
  });

  it("row 1: a line that is not JSON with a schema version is line_unreadable", () => {
    for (const line of ["{", "[]", '{"id":"x"}']) {
      expect(acceptAppend(remote, [{ line }], rules).rejected).toEqual({
        index: 0,
        code: "line_unreadable",
        details: {},
      });
    }
  });

  it("row 2: a newer schema version is schema_version_unsupported", () => {
    const b = device(300);
    const line = encodeLine(b.deposit({ account_id: "acc_fund" })).replace(
      '"schema_version":1',
      '"schema_version":2',
    );
    expect(acceptAppend(remote, [{ line }], rules).rejected).toMatchObject({
      code: "schema_version_unsupported",
      details: { found: 2, supported: 1 },
    });
  });

  it("row 3: a declaration the line does not admit is pair_declaration_invalid", () => {
    const b = device(400);
    const deposit = encodeLine(b.deposit({ account_id: "acc_fund" }));
    expect(
      acceptAppend(remote, [{ line: deposit, has_correction: true }], rules).rejected,
    ).toMatchObject({
      code: "pair_declaration_invalid",
      details: { member_index: 0 },
    });
    expect(
      acceptAppend(remote, [{ line: deposit, chain_continues: true }], rules).rejected,
    ).toMatchObject({
      code: "pair_declaration_invalid",
    });
  });

  it("row 4: a line whose shape the domain refuses is line_invalid, with the domain's code", () => {
    const b = device(500);
    const line = encodeLine(b.deposit({ account_id: "acc_fund" })).replace(
      '"amount":"5000"',
      '"amount":5000',
    );
    expect(acceptAppend(remote, [{ line }], rules).rejected).toMatchObject({
      code: "line_invalid",
      details: { domain_code: "invalid_field" },
    });
  });

  it("row 5: a recorded_at beyond the tolerance of the clock is recorded_at_in_future (case 8)", () => {
    const b = device(600);
    b.recordedAt("2027-08-31");
    const late = b.deposit({ account_id: "acc_fund" });
    expect(acceptAppend(remote, plain([late]), rules).rejected).toMatchObject({
      code: "recorded_at_in_future",
    });
    expect(
      acceptAppend(remote, plain([late]), { ...rules, clockToleranceMs: 2 * 86_400_000 }).accepted,
    ).toBe(1);
  });

  it("row 6: a repeated id is domain_rejected, never line_invalid (V8)", () => {
    const twin = { ...(events[0] as LedgerEvent), recorded_at: "2026-09-02T00:00:00.000Z" };
    expect(acceptAppend(remote, plain([twin]), rules).rejected).toMatchObject({
      code: "domain_rejected",
      details: { domain_code: "duplicate_id" },
    });
  });

  it("row 7: a repeated fingerprint needs confirm_duplicate, line by line", () => {
    const b = device(700);
    const deposit = b.deposit({ account_id: "acc_fund" }) as CashDepositEvent;
    const again = b.raw({ ...deposit, id: b.nextEnvelope("cash_deposit").id }) as CashDepositEvent;
    const base = [...remote, encodeLine(deposit)];
    expect(acceptAppend(base, plain([again]), rules).rejected).toEqual({
      index: 0,
      id: again.id,
      code: "duplicate_unconfirmed",
      details: { existing: [deposit.id] },
    });
    expect(
      acceptAppend(base, [{ line: encodeLine(again), confirm_duplicate: true }], rules).accepted,
    ).toBe(1);
  });

  it("row 8: a filing whose seal does not match the prefix it lands on is seal_mismatch (P6)", () => {
    const b = device(800);
    const sealed = b.filed({ tax_year: 2026, ledger_fingerprint: fingerprintOfEvents(events) });
    expect(acceptAppend(remote, plain([sealed]), rules).accepted).toBe(1);
    const grown = [...remote, encodeLine(b.deposit({ account_id: "acc_fund" }))];
    expect(acceptAppend(grown, plain([sealed]), rules).rejected).toMatchObject({
      code: "seal_mismatch",
    });
  });

  it("row 9: a waiver never comes through this route (V6)", () => {
    const b = device(900);
    const filing = b.filed({ tax_year: 2026, ledger_fingerprint: fingerprintOfEvents(events) });
    const waiver = b.raw({
      ...b.nextEnvelope("filing_fingerprint_waived"),
      filing_id: filing.id,
      reason: "digest",
      declared_schema_version: 1,
      declared_lines: events.length,
    } as LedgerEvent);
    expect(
      acceptAppend([...remote, encodeLine(filing)], plain([waiver]), rules).rejected,
    ).toMatchObject({
      code: "waiver_not_appendable",
    });
  });

  it("refuses everything on a remote that is already invalid", () => {
    const { builder, events: reordered } = reorderable();
    const invalid = [...reordered, builder.settings(byTradeDate)];
    expect(
      acceptAppend(
        linesOf(invalid),
        plain([device(950).deposit({ account_id: "acc_fund" })]),
        rules,
      ),
    ).toEqual({
      accepted: 0,
      lines: [],
      rejected: {
        index: 0,
        code: "domain_rejected",
        details: { domain_code: "ledger_has_invalid_events", invalid_count: 1 },
      },
    });
  });

  describe("the pair and the chain, one unit each", () => {
    const b = device(1000);
    const sale = b.sell({ account_id: "acc_fund", asset_id: "ast_world", quantity: "10" });
    const base = [...remote, encodeLine(sale)];
    const good = correction(b, buy, { quantity: "12" });
    const bad = correction(new (b.constructor as typeof device.prototype.constructor)(1100), buy, {
      quantity: "5",
    });
    const declared = (pair: readonly LedgerEvent[]): AppendEntry[] => [
      { line: encodeLine(pair[0] as LedgerEvent), has_correction: true },
      { line: encodeLine(pair[1] as LedgerEvent) },
    ];

    it("accepts the pair validated together, as the application writes it (V1)", () => {
      expect(acceptAppend(base, declared(good), rules).accepted).toBe(2);
    });

    it("rejects the pair at the index of the reversal, naming the third event (pair_rejected, member other)", () => {
      const result = acceptAppend(base, declared(bad), rules);
      expect(result.accepted).toBe(0);
      expect(result.rejected).toEqual({
        index: 0,
        id: bad[0].id,
        code: "pair_rejected",
        details: {
          member: "other",
          member_code: "dependent_events",
          affected: [{ id: sale.id, code: "insufficient_position" }],
        },
      });
    });

    it("rejects a reversal that declares its correction and does not bring it (pair_incomplete)", () => {
      expect(acceptAppend(base, [declared(good)[0] as AppendEntry], rules).rejected).toMatchObject({
        index: 0,
        code: "pair_incomplete",
      });
      const other = encodeLine(device(1200).deposit({ account_id: "acc_fund" }));
      expect(
        acceptAppend(base, [declared(good)[0] as AppendEntry, { line: other }], rules).rejected,
      ).toMatchObject({ index: 0, code: "pair_incomplete" });
    });

    it("rejects a correction that is not right behind its reversal (pair_not_contiguous, P7)", () => {
      const other = encodeLine(device(1300).deposit({ account_id: "acc_fund" }));
      const [reversal, corrected] = declared(good) as [AppendEntry, AppendEntry];
      expect(
        acceptAppend(base, [reversal, { line: other }, corrected], rules).rejected,
      ).toMatchObject({
        index: 0,
        code: "pair_not_contiguous",
      });
      expect(
        acceptAppend(remote, [{ line: reversal.line }, corrected], rules).rejected,
      ).toMatchObject({
        index: 1,
        code: "pair_not_contiguous",
      });
    });

    it("names the member of a pair that fails, with its index", () => {
      const c = device(1700);
      const small = c.sell({ account_id: "acc_fund", asset_id: "ast_world", quantity: "1" });
      const [r, corrected] = correction(c, small, { quantity: "11" });
      const result = acceptAppend(
        [...remote, encodeLine(small)],
        [{ line: encodeLine(r), has_correction: true }, { line: encodeLine(corrected) }],
        rules,
      );
      expect(result.rejected).toEqual({
        index: 0,
        id: r.id,
        code: "pair_rejected",
        details: { member: "correction", member_code: "insufficient_position", member_index: 1 },
      });
    });

    it("looks past unreadable lines when it searches for a correction further on", () => {
      const [reversal] = declared(good) as [AppendEntry, AppendEntry];
      const other = encodeLine(device(1800).deposit({ account_id: "acc_fund" }));
      expect(
        acceptAppend(remote, [reversal, { line: other }, { line: "{" }, { line: "null" }], rules)
          .rejected,
      ).toMatchObject({ index: 0, code: "pair_incomplete" });
    });

    it("reports a member that cannot be read at the start of its unit", () => {
      const [reversal] = declared(good) as [AppendEntry, AppendEntry];
      expect(acceptAppend(base, [reversal, { line: "{" }], rules).rejected).toEqual({
        index: 0,
        id: good[0].id,
        code: "line_unreadable",
        details: { member_index: 1 },
      });
    });

    it("accepts a chain whole and rejects it whole, at its first reversal (P1)", () => {
      const c = device(1400);
      const second = c.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "7" });
      const [r1, c1] = correction(c, buy, { fee: "1" });
      const [r2, c2] = correction(c, second, { fee: "2" });
      const chain: AppendEntry[] = [
        { line: encodeLine(r1), has_correction: true },
        { line: encodeLine(c1), chain_continues: true },
        { line: encodeLine(r2), has_correction: true },
        { line: encodeLine(c2) },
      ];
      const chainBase = [...remote, encodeLine(second)];
      expect(acceptAppend(chainBase, chain, rules).accepted).toBe(4);
      const [r3, c3] = correction(c, second, { quantity: "5" });
      const breaking: AppendEntry[] = [
        ...chain.slice(0, 2),
        { line: encodeLine(r3), has_correction: true },
        { line: encodeLine(c3) },
      ];
      const sold = encodeLine(
        c.sell({ account_id: "acc_fund", asset_id: "ast_world", quantity: "17" }),
      );
      const result = acceptAppend([...chainBase, sold], breaking, rules);
      expect(result.accepted).toBe(0);
      expect(result.rejected).toMatchObject({
        index: 0,
        id: r1.id,
        code: "pair_rejected",
        details: { member: "other", member_code: "dependent_events" },
      });
      // Declared as continuing, and then no reversal: incomplete.
      expect(acceptAppend(chainBase, [...chain.slice(0, 2)], rules).rejected).toMatchObject({
        index: 0,
        code: "pair_incomplete",
      });
      expect(
        acceptAppend(chainBase, [...chain.slice(0, 2), { line: encodeLine(r2) }], rules).rejected,
      ).toMatchObject({ index: 0, code: "pair_incomplete" });
    });

    it("rejects an unconfirmed duplicate inside a pair at the reversal, naming the member", () => {
      const c = device(1500);
      const d1 = c.deposit({ account_id: "acc_fund" }) as CashDepositEvent;
      const d2 = c.deposit({ account_id: "acc_fund", amount: "3" }) as CashDepositEvent;
      const [r, corrected] = correction(c, d2, { amount: "5000" });
      const dupBase = [...base, encodeLine(d1), encodeLine(d2)];
      const pair: AppendEntry[] = [
        { line: encodeLine(r), has_correction: true },
        { line: encodeLine(corrected) },
      ];
      expect(acceptAppend(dupBase, pair, rules).rejected).toMatchObject({
        index: 0,
        code: "duplicate_unconfirmed",
        details: { existing: [d1.id], member_index: 1 },
      });
      expect(
        acceptAppend(
          dupBase,
          [pair[0] as AppendEntry, { ...(pair[1] as AppendEntry), confirm_duplicate: true }],
          rules,
        ).accepted,
      ).toBe(2);
    });

    it("rejects a sealing member of a pair at its unit, and a waiver inside one", () => {
      const c = device(1600);
      const filing = c.filed({ tax_year: 2026, ledger_fingerprint: fingerprintOfEvents(events) });
      const withFiling = [...remote, encodeLine(filing)];
      c.recordedAt("2027-07-01");
      const [r, corrected] = correction(c, filing, {
        receipt_reference: "renta-2026-111111111111",
      });
      const pair: AppendEntry[] = [
        { line: encodeLine(r), has_correction: true },
        { line: encodeLine(corrected) },
      ];
      expect(acceptAppend(withFiling, pair, rules).rejected).toMatchObject({
        index: 0,
        code: "seal_mismatch",
        details: { member_index: 1 },
      });
    });
  });
});

describe("the initialisation of an empty remote (§5.5, V6, V17)", () => {
  const { builder, events } = baseLedger();
  const deposit = builder.deposit({ account_id: "acc_fund" }) as CashDepositEvent;
  const again = builder.raw({
    ...deposit,
    id: builder.nextEnvelope("cash_deposit").id,
  }) as CashDepositEvent;
  const all = [...events, deposit, again];

  const initError = (run: () => unknown): Record<string, unknown> => {
    try {
      run();
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteError);
      expect((error as RemoteError).code).toBe("init_rejected");
      expect((error as RemoteError).status).toBe(422);
      return { ...(error as RemoteError).details };
    }
    throw new Error("accepted");
  };

  it("derives the ids to confirm from the file: every event repeating an earlier fingerprint (D-Q16)", () => {
    expect(initDuplicateIds(all)).toEqual([again.id]);
  });

  it("writes the whole bytes when everything holds", () => {
    expect(acceptInit(textOf(all), [again.id], rules)).toEqual(linesOf(all));
  });

  it("refuses an unconfirmed duplicate, a clock ahead, an unreadable line and a line break", () => {
    expect(initError(() => acceptInit(textOf(all), [], rules))).toEqual({
      code: "duplicate_unconfirmed",
      id: again.id,
    });
    const late = device(50);
    late.recordedAt("2027-09-30");
    const future = late.deposit({ account_id: "acc_fund" });
    expect(initError(() => acceptInit(textOf([...events, future]), [], rules))).toMatchObject({
      code: "recorded_at_in_future",
      line: events.length + 1,
    });
    expect(initError(() => acceptInit(`${textOf(events)}{\n`, [], rules))).toMatchObject({
      code: "line_unreadable",
      line: events.length + 1,
    });
    expect(
      initError(() => acceptInit(`${textOf(events).replace("\n", "\r\n")}`, [], rules)),
    ).toEqual({
      code: "raw_line_break",
      line: 1,
    });
  });

  it("refuses a ledger that does not project valid, or with a repeated id", () => {
    const { builder: r, events: reordered } = reorderable();
    const invalid = [...reordered, r.settings(byTradeDate)];
    expect(initError(() => acceptInit(textOf(invalid), [], rules))).toMatchObject({
      code: "domain_rejected",
      domain_code: "insufficient_position",
    });
    expect(
      initError(() => acceptInit(textOf([...events, events[0] as LedgerEvent]), [], rules)),
    ).toMatchObject({
      code: "domain_rejected",
      domain_code: "duplicate_id",
    });
  });
});
