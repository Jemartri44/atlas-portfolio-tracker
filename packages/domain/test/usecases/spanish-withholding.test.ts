// A Spanish withholding is a payment on account (box 0597), not foreign tax:
// article 80 LIRPF is for income "obtenidas y gravadas en el extranjero". So a
// dividend from Spain with a `withholding_origin`, and a treaty rate for Spain,
// are refused when written, and only then: a ledger already written that way
// still loads (ADR-0018).

import { describe, expect, it } from "vitest";
import { projectLedger } from "../../src/projections/project-ledger.js";
import type { DividendEvent, LedgerEvent } from "../../src/schema/events.js";
import { DEFAULT_SETTINGS } from "../../src/settings/settings.js";
import { evaluateUnit } from "../../src/sync/evaluate.js";
import { recordEvent } from "../../src/usecases/record-event.js";
import { correctEvent } from "../../src/usecases/rectify.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { TestStore } from "../memory-store.js";
import { testDeps } from "./helpers.js";

const base = (): LedgerBuilder => {
  const b = new LedgerBuilder();
  b.account("acc_ib", { platform: "ibkr", country: "IE" });
  b.asset("stk_es", { asset_type: "stock", transferable: false, market: "XMAD" });
  b.buy({ account_id: "acc_ib", asset_id: "stk_es", value_date: "2027-01-11" });
  return b;
};

/** A dividend of 100 € from Spain, with the 19 % in one field or the other. */
const dividend = (field: "withholding_origin" | "withholding_spain", country = "ES") => ({
  type: "dividend" as const,
  account_id: "acc_ib",
  asset_id: "stk_es",
  value_date: "2027-04-01",
  gross: "100",
  withholding_origin: field === "withholding_origin" ? "19" : "0",
  withholding_spain: field === "withholding_spain" ? "19" : "0",
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: "2027-04-01",
  source_country: country,
});

const codeOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (error) {
    return (error as { code: string }).code;
  }
  return "recorded";
};

describe("a Spanish withholding written as foreign tax", () => {
  it.each([
    [
      "in withholding_origin from Spain",
      "withholding_origin",
      "ES",
      "spanish_withholding_as_origin",
    ],
    ["in withholding_spain from Spain", "withholding_spain", "ES", "recorded"],
    ["in withholding_origin from the US", "withholding_origin", "US", "recorded"],
  ] as const)("is decided when written %s", async (_name, field, country, expected) => {
    const store = new TestStore(base().build());
    expect(
      await codeOf(() => recordEvent(testDeps(store), dividend(field, country) as never)),
    ).toBe(expected);
  });

  it("is refused in a correction too", async () => {
    const b = base();
    const right = b.dividend({
      account_id: "acc_ib",
      asset_id: "stk_es",
      gross: "100",
      withholding_spain: "19",
      source_country: "ES",
    });
    const store = new TestStore(b.build());
    const wrong = { ...dividend("withholding_origin"), fingerprint: right.fingerprint };
    expect(
      await codeOf(() => correctEvent(testDeps(store), right.id, wrong as never, "moved the 19 %")),
    ).toBe("spanish_withholding_as_origin");
  });

  it("is refused in a unit written from another device", () => {
    const b = base();
    const events = b.build();
    const wrong = b.dividend({
      account_id: "acc_ib",
      asset_id: "stk_es",
      gross: "100",
      withholding_origin: "19",
      source_country: "ES",
    }) as DividendEvent;
    const result = evaluateUnit(events, [wrong as LedgerEvent]);
    expect(result.ok ? undefined : result.failure.domain_code).toBe(
      "spanish_withholding_as_origin",
    );
  });

  it("still loads when the ledger was written before the rule", () => {
    const b = base();
    b.dividend({
      account_id: "acc_ib",
      asset_id: "stk_es",
      gross: "100",
      withholding_origin: "19",
      source_country: "ES",
    });
    b.settings({ ...DEFAULT_SETTINGS, treaty_withholding_pct: { ES: "19" } });
    const state = projectLedger(b.build(), { collectErrors: true });
    expect(state.invalid).toEqual([]);
  });
});

describe("a treaty rate for Spain", () => {
  it("is refused when written", async () => {
    const store = new TestStore(base().build());
    const settings = { ...DEFAULT_SETTINGS, treaty_withholding_pct: { ES: "19", US: "15" } };
    expect(
      await codeOf(() =>
        recordEvent(testDeps(store), { type: "settings_changed", settings } as never),
      ),
    ).toBe("treaty_rate_for_spain");
    const others = { ...DEFAULT_SETTINGS, treaty_withholding_pct: { US: "15" } };
    expect(
      await codeOf(() =>
        recordEvent(testDeps(store), { type: "settings_changed", settings: others } as never),
      ),
    ).toBe("recorded");
  });
});
