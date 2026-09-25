// The client's side of a sync (ADR-0026, Part B, steps 1 to 3, 5 and 6): the
// rules of the table of the plan (§4.2), one by one.

import { describe, expect, it } from "vitest";
import { fingerprintOfEvents } from "../../src/filings/fingerprint.js";
import { RemoteError } from "../../src/ports/remote-ledger.js";
import type {
  AccountUpdatedEvent,
  AssetUpdatedEvent,
  BuyEvent,
  CashDepositEvent,
  LedgerEvent,
  SellEvent,
} from "../../src/schema/events.js";
import { encodeLine } from "../../src/schema/line.js";
import { CURRENT_LEDGER_SCHEMA } from "../../src/schema/migrations/index.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import {
  type Inspection,
  inspect,
  type LocalSide,
  localChanged,
  planUpload,
  publishFailed,
  remoteContention,
  remoteFailed,
  type SyncStop,
  settle,
  unitAtEntry,
} from "../../src/sync/client-plan.js";
import { lineSha256 } from "../../src/sync/lines.js";
import { markerFor } from "../../src/sync/marker.js";
import { unitsOf } from "../../src/sync/units.js";
import {
  baseLedger,
  byTradeDate,
  correction,
  device,
  linesOf,
  localSide,
  reorderable,
  textOf,
} from "./helpers.js";

const schema = CURRENT_LEDGER_SCHEMA;
const today = "2028-07-01";

const inspected = (local: LocalSide, remote: readonly LedgerEvent[] | string): Inspection => {
  const result = inspect(local, typeof remote === "string" ? remote : textOf(remote), schema);
  if ("stop" in result) {
    throw new Error(`stopped: ${result.stop.code}`);
  }
  return result;
};

const stopped = (local: LocalSide, remote: string): SyncStop => {
  const result = inspect(local, remote, schema);
  if (!("stop" in result)) {
    throw new Error("did not stop");
  }
  return result.stop;
};

const plan = (local: LocalSide, remote: readonly LedgerEvent[]) =>
  planUpload(local, inspected(local, remote), today);

describe("inspect: steps 1 and 2", () => {
  const { events } = baseLedger();
  const n = events.length;

  it("takes as queue what comes after the synced prefix of the marker (R1)", () => {
    const b = device(100);
    const pending = b.deposit({ account_id: "acc_fund" });
    const result = inspected(localSide([...events, pending], n), events);
    expect(result.synced).toBe(n);
    expect(result.queue).toEqual(linesOf([pending]));
    expect(result.queueEvents).toEqual([pending]);
    expect(result.foreign).toEqual([]);
  });

  it("stops when the local prefix is not what the marker says, without touching anything", () => {
    const b = device(100);
    const pending = b.deposit({ account_id: "acc_fund" });
    const local = {
      ...localSide([...events, pending], n),
      marker: markerFor(linesOf([...events, pending]), n + 1),
    };
    const shorter = { ...local, lines: local.lines.slice(0, n) };
    expect(stopped(shorter, textOf(events)).code).toBe("local_prefix_changed");
    const changed = localSide(events, n);
    const edited = {
      ...changed,
      lines: [...changed.lines.slice(0, -1), `${changed.lines[n - 1]} `],
    };
    expect(stopped(edited, textOf(events))).toEqual({
      code: "local_prefix_changed",
      details: { synced_lines: n },
    });
  });

  it("detects a rewrite of the remote by the bytes of the prefix, although it keeps every id (R2)", () => {
    const local = localSide(events, n);
    const compacted = linesOf(events).map((line, index) =>
      index === 0 ? JSON.stringify(JSON.parse(line), null, 0).replace("{", "{ ") : line,
    );
    expect(stopped(local, `${compacted.join("\n")}\n`)).toEqual({
      code: "remote_rewritten",
      details: { synced_lines: n, remote_lines: n },
    });
    expect(stopped(local, textOf(events.slice(0, -1))).code).toBe("remote_rewritten");
  });

  it("stops when the remote cannot be read by this client (case 6), saying which way", () => {
    const local = localSide(events, n, { marker: undefined });
    const newer = `${textOf(events)}${encodeLine(events[0] as LedgerEvent).replace('"schema_version":1', '"schema_version":2')}\n`;
    expect(stopped(local, newer)).toEqual({
      code: "remote_schema_too_new",
      details: { found: 2, supported: 1 },
    });
    expect(stopped(local, `${textOf(events)}{\n`)).toEqual({
      code: "remote_unreadable",
      details: { line: n + 1 },
    });
  });

  it("stops on a remote that is already invalid", () => {
    const { builder, events: reordered } = reorderable();
    const invalid = [...reordered, builder.settings(byTradeDate)];
    expect(
      stopped(localSide(reordered, reordered.length, { marker: undefined }), textOf(invalid)),
    ).toEqual({
      code: "remote_ledger_invalid",
      details: { invalid_count: 1 },
    });
  });

  it("never starts an empty remote line by line: that is the explicit initialisation (V6)", () => {
    expect(stopped(localSide(events, 0, { marker: undefined }), "")).toEqual({
      code: "remote_empty",
      details: {},
    });
    expect(inspected(localSide([], 0, { marker: undefined }), "").queue).toEqual([]);
  });

  it("rebuilds the synced prefix without a marker as the part in common", () => {
    const foreign = device(200).deposit({ account_id: "acc_fund", amount: "3" });
    const result = inspected(localSide(events, 0, { marker: undefined }), [...events, foreign]);
    expect(result.synced).toBe(n);
    expect(result.queue).toEqual([]);
    expect(result.foreign).toEqual([foreign]);
  });

  it("never merges a ledger of its own on a rebuilt marker: that is joining, always explicit", () => {
    const b = device(100);
    const pending = b.deposit({ account_id: "acc_fund" });
    const foreign = device(200).deposit({ account_id: "acc_fund", amount: "3" });
    expect(
      stopped(
        localSide([...events, pending], 0, { marker: undefined }),
        textOf([...events, foreign]),
      ),
    ).toEqual({ code: "join_required", details: { own_lines: 1 } });
    // What the remote already has, or what is already held, is not a ledger of its own.
    expect(
      inspected(
        localSide([...events, pending], 0, { marker: undefined, held: linesOf([pending]) }),
        [...events],
      ).queue,
    ).toEqual([]);
  });

  it("takes out of the queue, by exact bytes, what the remote already has and what is already held (R4)", () => {
    const b = device(100);
    const uploaded = b.deposit({ account_id: "acc_fund" });
    const held = b.deposit({ account_id: "acc_fund", amount: "2" });
    const pending = b.deposit({ account_id: "acc_fund", amount: "3" });
    const local = localSide([...events, uploaded, held, pending], n, { held: linesOf([held]) });
    const result = inspected(local, [...events, uploaded]);
    expect(result.alreadyRemote).toEqual(linesOf([uploaded]));
    expect(result.alreadyHeld).toEqual(linesOf([held]));
    expect(result.queue).toEqual(linesOf([pending]));
    // The lost answer: the remote's own copy of our line is not foreign.
    expect(result.foreign).toEqual([]);
  });

  it("keeps in the queue a line with the id of one in the remote but other bytes (R4, mutant 4b)", () => {
    const b = device(100);
    const mine = b.deposit({ account_id: "acc_fund" }) as CashDepositEvent;
    const theirs = { ...mine, amount: "1" };
    const result = inspected(localSide([...events, mine], n), [...events, theirs]);
    expect(result.queue).toEqual(linesOf([mine]));
    const upload = planUpload(localSide([...events, mine], n), result, today);
    expect(upload.hold?.reason).toEqual({
      code: "domain_rejected",
      details: { domain_code: "duplicate_id" },
    });
  });
});

describe("planUpload: step 3", () => {
  const { events } = baseLedger();
  const n = events.length;
  const buy = events[n - 1] as BuyEvent;

  it("uploads nothing while anything held back is unresolved, not even what would fit (R13)", () => {
    const b = device(100);
    const pending = b.deposit({ account_id: "acc_fund" });
    const local = localSide([...events, pending], n, { held: ["x"] });
    expect(planUpload(local, inspected({ ...local, held: [] }, events), today)).toEqual({
      blocked: true,
      entries: [],
      units: [],
    });
  });

  it("re-applies on top of the remote, in local order, and stops at the first failure (R5, R12)", () => {
    const b = device(100);
    const first = b.deposit({ account_id: "acc_fund" });
    const sale = b.sell({ account_id: "acc_fund", asset_id: "ast_world", quantity: "6" });
    const after = b.deposit({ account_id: "acc_fund", amount: "9" });
    const foreignSale = device(200).sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "5",
    });
    const local = localSide([...events, first, sale, after], n);
    // Over the local base the sale fits; over the remote it does not (case 2).
    const result = plan(local, [...events, foreignSale]);
    expect(result.entries).toEqual([{ line: encodeLine(first) }]);
    expect(result.units.map((unit) => unit.lines)).toEqual([linesOf([first])]);
    expect(result.hold?.unit.lines).toEqual(linesOf([sale]));
    expect(result.hold?.reason).toEqual({
      code: "domain_rejected",
      details: { domain_code: "insufficient_position" },
    });
  });

  it("holds a pair whose correction no longer fits, before the reversal, and names what breaks (case 10, R9)", () => {
    const b = device(100);
    const pair = correction(b, buy, { quantity: "5" });
    const foreignSale = device(200).sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "8",
    });
    const result = plan(localSide([...events, ...pair], n), [...events, foreignSale]);
    expect(result.entries).toEqual([]);
    expect(result.hold?.unit.lines).toEqual(linesOf(pair));
    expect(result.hold?.reason).toEqual({
      code: "pair_rejected",
      details: {
        member: "other",
        member_code: "dependent_events",
        affected: [{ id: foreignSale.id, code: "insufficient_position" }],
      },
    });
  });

  it("uploads a pair and a chain whole, declared (R9, R10)", () => {
    const b = device(100);
    const second = b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "7" });
    const pair1 = correction(b, buy, { fee: "1" });
    const pair2 = correction(b, second, { fee: "2" });
    const result = plan(localSide([...events, second, ...pair1, ...pair2], n + 1), [
      ...events,
      second,
    ]);
    expect(result.units.map((unit) => unit.kind)).toEqual(["chain"]);
    expect(result.entries.map(({ line: _line, ...flags }) => flags)).toEqual([
      { has_correction: true },
      { chain_continues: true },
      { has_correction: true },
      {},
    ]);
  });

  it("holds a chain whole when one member fails, with the member named (R10)", () => {
    const b = device(100);
    const second = b.buy({ account_id: "acc_fund", asset_id: "ast_world", quantity: "7" });
    const pair1 = correction(b, buy, { fee: "1" });
    const pair2 = correction(b, second, { asset_id: "ast_nowhere" });
    const result = plan(localSide([...events, second, ...pair1, ...pair2], n + 1), [
      ...events,
      second,
    ]);
    expect(result.entries).toEqual([]);
    expect(result.hold?.unit.lines).toHaveLength(4);
    expect(result.hold?.reason.code).toBe("pair_rejected");
    expect(result.hold?.reason.details).toMatchObject({ member: "correction", member_index: 3 });
  });

  it("holds a correction that is not right behind its reversal (P7, R11)", () => {
    const b = device(100);
    const [reversal, corrected] = correction(b, buy, { fee: "1" });
    const between = b.deposit({ account_id: "acc_fund" });
    const result = plan(localSide([...events, reversal, between, corrected], n), events);
    expect(result.entries).toEqual([{ line: encodeLine(reversal) }, { line: encodeLine(between) }]);
    expect(result.hold?.reason).toEqual({
      code: "pair_not_contiguous",
      details: { event_id: corrected.id },
    });
  });

  it("holds a settings change that would leave events invalid, said apart", () => {
    const { builder, events: reordered } = reorderable();
    const change = builder.settings(byTradeDate);
    const result = plan(localSide([...reordered, change], reordered.length), reordered);
    expect(result.hold?.reason.code).toBe("settings_leave_invalid");
  });

  describe("case 4: concurrent photos (R7)", () => {
    it("holds a settings change when the remote won another since the prefix, or reversed one", () => {
      const b = device(100);
      const mine = b.settings({ ...DEFAULT_SETTINGS, stale_price_days: 9 });
      const theirs = device(200).settings({ ...DEFAULT_SETTINGS, stale_price_days: 8 });
      expect(plan(localSide([...events, mine], n), [...events, theirs]).hold?.reason).toEqual({
        code: "concurrent_settings",
        details: { event_id: mine.id },
      });
      const shared = device(300).settings({ ...DEFAULT_SETTINGS, stale_price_days: 7 });
      const reversal = device(400).reversal(shared.id);
      expect(
        plan(localSide([...events, shared, mine], n + 1), [...events, shared, reversal]).hold
          ?.reason.code,
      ).toBe("concurrent_settings");
    });

    it("holds an account or asset update when the remote changed **that** one, and uploads one of another", () => {
      const b = device(100);
      const account = b.accountUpdated({
        account_id: "acc_fund",
        name: "Mine",
        platform: "test",
        book: "core",
        base_currency: "EUR",
        country: "ES",
        active: true,
      } as never) as AccountUpdatedEvent;
      const theirsAccount = device(200).accountUpdated({
        account_id: "acc_fund",
        name: "Theirs",
        platform: "test",
        book: "core",
        base_currency: "EUR",
        country: "ES",
        active: true,
      } as never);
      expect(
        plan(localSide([...events, account], n), [...events, theirsAccount]).hold?.reason,
      ).toEqual({
        code: "concurrent_account",
        details: { event_id: account.id, account_id: "acc_fund" },
      });
      const asset = events.find(
        (event) => event.type === "asset_created" && event.asset_id === "ast_world",
      ) as LedgerEvent & Record<string, unknown>;
      const { schema_version: _v, id: _i, recorded_at: _r, type: _t, ...fields } = asset;
      const mine = b.assetUpdated({ ...fields, name: "Mine" } as never) as AssetUpdatedEvent;
      const theirs = device(300).assetUpdated({ ...fields, name: "Theirs" } as never);
      expect(plan(localSide([...events, mine], n), [...events, theirs]).hold?.reason).toEqual({
        code: "concurrent_asset",
        details: { event_id: mine.id, asset_id: "ast_world" },
      });
      const bonds = events.find(
        (event) => event.type === "asset_created" && event.asset_id === "ast_bonds",
      ) as LedgerEvent & Record<string, unknown>;
      const { schema_version: _v2, id: _i2, recorded_at: _r2, type: _t2, ...other } = bonds;
      const otherAsset = device(500).assetUpdated({ ...other, name: "Other" } as never);
      const result = plan(localSide([...events, mine], n), [...events, otherAsset]);
      expect(result.hold).toBeUndefined();
      expect(result.entries).toHaveLength(1);
    });
  });

  describe("case 9: what seals the prefix (R8)", () => {
    it("reapplies a filing only onto exactly the prefix it had locally", () => {
      const b = device(100);
      const filing = b.filed({ tax_year: 2026, ledger_fingerprint: fingerprintOfEvents(events) });
      expect(plan(localSide([...events, filing], n), events).entries).toHaveLength(1);
      const foreign = device(200).deposit({ account_id: "acc_fund" });
      expect(plan(localSide([...events, filing], n), [...events, foreign]).hold?.reason).toEqual({
        code: "seals_prefix",
        details: { event_id: filing.id },
      });
    });

    it("is not fooled by its own lines already in the remote (an answer lost)", () => {
      const b = device(100);
      const deposit = b.deposit({ account_id: "acc_fund" });
      const filing = b.filed({
        tax_year: 2026,
        ledger_fingerprint: fingerprintOfEvents([...events, deposit]),
      });
      const result = plan(localSide([...events, deposit, filing], n), [...events, deposit]);
      expect(result.entries).toEqual([{ line: encodeLine(filing) }]);
    });
  });

  describe("case 5: a new warning that asks for confirmation (R6, D-Q3)", () => {
    it("holds a fingerprint repeated only over the remote, and uploads one repeated already locally with its confirmation", () => {
      const b = device(100);
      const mine = b.deposit({ account_id: "acc_fund" }) as CashDepositEvent;
      const theirs = device(200).raw({
        ...mine,
        id: device(200).nextEnvelope("cash_deposit").id,
      }) as CashDepositEvent;
      const held = plan(localSide([...events, mine], n), [...events, theirs]);
      expect(held.hold?.reason).toEqual({
        code: "new_duplicate",
        details: { existing: [theirs.id] },
      });
      // Confirmed while resolving: it goes up, declared.
      const confirmed = plan(
        localSide([...events, mine], n, {
          confirmations: [
            {
              line_sha256: lineSha256(encodeLine(mine)),
              duplicates: [theirs.id],
              closed: [],
              confirmed_at: "t",
            },
          ],
        }),
        [...events, theirs],
      );
      expect(confirmed.entries).toEqual([{ line: encodeLine(mine), confirm_duplicate: true }]);
      // Repeated already when it was recorded: not new.
      const again = device(300).raw({ ...mine, id: device(300).nextEnvelope("cash_deposit").id });
      const local = localSide([...events, mine, again], n + 1);
      expect(plan(local, [...events, mine]).entries).toEqual([
        { line: encodeLine(again), confirm_duplicate: true },
      ]);
    });

    it("holds a pair whose correction repeats a fingerprint over the remote, naming the member", () => {
      const b = device(100);
      const deposit = b.deposit({ account_id: "acc_fund", amount: "3" }) as CashDepositEvent;
      const pair = correction(b, deposit, { amount: "5000" });
      const theirs = device(200).deposit({ account_id: "acc_fund" });
      const result = plan(localSide([...events, deposit, ...pair], n + 1), [
        ...events,
        deposit,
        theirs,
      ]);
      expect(result.hold?.reason).toEqual({
        code: "new_duplicate",
        details: { existing: [theirs.id], member_index: 1 },
      });
    });

    it("holds a line that falls in a year the other device marked as filed, until confirmed", () => {
      const b = device(100);
      const mine = b.deposit({ account_id: "acc_fund", value_date: "2027-03-01" });
      const filing = device(200).filed({
        tax_year: 2027,
        ledger_fingerprint: fingerprintOfEvents(events),
      });
      const result = plan(localSide([...events, mine], n), [...events, filing]);
      expect(result.hold?.reason).toEqual({
        code: "new_closed_year",
        details: { filings: [filing.id] },
      });
      const confirmed = plan(
        localSide([...events, mine], n, {
          confirmations: [
            {
              line_sha256: lineSha256(encodeLine(mine)),
              duplicates: [],
              closed: [filing.id],
              confirmed_at: "t",
            },
          ],
        }),
        [...events, filing],
      );
      expect(confirmed.entries).toEqual([{ line: encodeLine(mine) }]);
      // Already filed when it was recorded: not new.
      const local = localSide([...events, filing, mine], n + 1);
      expect(plan(local, [...events, filing]).entries).toEqual([{ line: encodeLine(mine) }]);
    });
  });
});

describe("settling steps 5 and 6", () => {
  it("finds the unit a rejected index of the request falls in", () => {
    const { events } = baseLedger();
    const b = device(100);
    const d = b.deposit({ account_id: "acc_fund" });
    const pair = correction(b, events[events.length - 1] as BuyEvent, { fee: "1" });
    const queue = [d, ...pair];
    const units = unitsOf(linesOf(queue), queue);
    expect(unitAtEntry(units, 0)).toBe(units[0]);
    expect(unitAtEntry(units, 2)).toBe(units[1]);
    expect(unitAtEntry(units, 3)).toBeUndefined();
  });

  it("keeps as queue only what the remote does not have after the prefix and is not held back", () => {
    const { events } = baseLedger();
    const n = events.length;
    const b = device(100);
    const up = b.deposit({ account_id: "acc_fund" });
    const held = b.sell({
      account_id: "acc_fund",
      asset_id: "ast_world",
      quantity: "99",
    }) as SellEvent;
    const pending = b.deposit({ account_id: "acc_fund", amount: "3" });
    const foreign = device(200).deposit({ account_id: "acc_fund", amount: "4" });
    const local = localSide([...events, up, held, pending], n);
    const result = settle(local, n, linesOf([...events, foreign, up]), linesOf([held]));
    expect(result.remaining).toEqual(linesOf([pending]));
    expect(result.lines).toEqual(linesOf([...events, foreign, up, pending]));
  });
});

describe("the stops that are not about the ledgers", () => {
  it("carry the code of the remote as it came, never folded, and hold nothing back (V4)", () => {
    const expired = new RemoteError("device_token_expired", 401);
    expect(remoteFailed(expired)).toEqual({
      code: "remote_failed",
      details: { remote_code: "device_token_expired", status: 401 },
    });
    expect(publishFailed(new RemoteError("network_failed", undefined))).toEqual({
      code: "publish_failed",
      details: { remote_code: "network_failed", status: undefined },
    });
    expect(remoteContention(3)).toEqual({ code: "remote_contention", details: { attempts: 3 } });
    expect(localChanged(3)).toEqual({ code: "local_changed", details: { attempts: 3 } });
  });
});
