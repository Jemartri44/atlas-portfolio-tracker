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
});
