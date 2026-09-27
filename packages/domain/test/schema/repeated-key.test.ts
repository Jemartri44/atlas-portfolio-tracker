// Q12, option (b) (decision of the direction, §29 and §33): a line with a key
// twice — which only a hand edit writes — still loads, as `JSON.parse` reads
// it (the last value), but the degraded projection (ADR-0015) marks it
// **invalid**, with `duplicate_key` and its id; `atlas check`, the web and the
// sync see it as such, and the sync holds it back before uploading it.

import { describe, expect, it } from "vitest";
import { ProjectionError } from "../../src/errors.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { decodeLine, encodeLine } from "../../src/schema/line.js";
import { CURRENT_LEDGER_SCHEMA } from "../../src/schema/migrations/index.js";
import { decodeLines } from "../../src/schema/raw-lines.js";
import { SAMPLES } from "../samples.js";

const account = encodeLine(SAMPLES.account_created);
const twice = account.replace(
  '"account_id":"acc_fund"',
  '"account_id":"acc_x","account_id":"acc_fund"',
);

describe("a line with a key twice (Q12, (b))", () => {
  it("still loads, with the last value, as JSON.parse reads it", () => {
    expect(twice).not.toBe(account);
    expect(decodeLine(twice).event).toEqual(SAMPLES.account_created);
  });

  it("is invalid in the degraded projection, with duplicate_key and its id", () => {
    const state = projectLedger([decodeLine(twice).event], { collectErrors: true });
    expect(state.invalid).toHaveLength(1);
    expect(state.invalid[0]?.error).toMatchObject({ code: "duplicate_key" });
    expect(state.invalid[0]?.event.id).toBe(SAMPLES.account_created.id);
    expect(state.accounts.size).toBe(0);
  });

  it("stops the strict projection, as any invalid event does", () => {
    expect(() => projectLedger([decodeLine(twice).event])).toThrow(ProjectionError);
  });

  it("is marked by every way of reading lines, a nested key too", () => {
    const [event] = decodeLines([twice], CURRENT_LEDGER_SCHEMA);
    expect(projectLedger([event as never], { collectErrors: true }).invalid).toHaveLength(1);
    const nested = encodeLine(SAMPLES.settings_changed).replace(
      '"fiscal_date_rule":{',
      '"fiscal_date_rule":{"stock":"trade_date",',
    );
    expect(nested).not.toBe(encodeLine(SAMPLES.settings_changed));
    const state = projectLedger([decodeLine(nested).event], { collectErrors: true });
    expect(state.invalid[0]?.error).toMatchObject({ code: "duplicate_key" });
  });

  it("leaves a line with every key once alone", () => {
    const state = projectLedger([decodeLine(account).event], { collectErrors: true });
    expect(state.invalid).toEqual([]);
    expect(state.accounts.size).toBe(1);
  });

  // The remedy the messages give (review of PR #98, B1; §35): a live reversal
  // of the line annuls it, and it stops being invalid — the ledger is
  // append-only, and otherwise only another hand edit would get it out.
  it("stops being invalid once a live reversal annuls it", () => {
    const reversal = { ...SAMPLES.reversal, reverses_id: SAMPLES.account_created.id };
    const state = projectLedger([decodeLine(twice).event, decodeLine(encodeLine(reversal)).event], {
      collectErrors: true,
    });
    expect(state.invalid).toEqual([]);
    expect(state.reversed.get(SAMPLES.account_created.id)).toBe(reversal.id);
    expect(state.accounts.size).toBe(0);
    // Strict too: nothing is left to stop it.
    expect(() =>
      projectLedger([decodeLine(twice).event, decodeLine(encodeLine(reversal)).event]),
    ).not.toThrow();
  });

  it("annuls nothing when the reversal itself has a key twice: both stay as they were", () => {
    const reversal = { ...SAMPLES.reversal, reverses_id: SAMPLES.account_created.id };
    const bad = encodeLine(reversal).replace(
      '"reason":"precio mal tecleado"',
      '"reason":"x","reason":"precio mal tecleado"',
    );
    expect(bad).not.toBe(encodeLine(reversal));
    const state = projectLedger([decodeLine(account).event, decodeLine(bad).event], {
      collectErrors: true,
    });
    expect(state.invalid.map((entry) => [entry.event.id, entry.error.code])).toEqual([
      [reversal.id, "duplicate_key"],
    ]);
    // With its type: the interfaces send an annulment to the file (R2-B1).
    expect(state.invalid[0]?.error.details).toMatchObject({ id: reversal.id, type: "reversal" });
    expect(state.reversed.has(SAMPLES.account_created.id)).toBe(false);
    expect(state.accounts.size).toBe(1);
  });
});
