// A year before an account's first movement has nothing of it: its quarter
// average is not the balance the account will hold later.

import { describe, expect, it } from "vitest";
import { fiscalAttention } from "../../src/informative/attention.js";
import { model720 } from "../../src/informative/m720.js";
import type { InformativeCategory } from "../../src/informative/report.js";
import { generateLedger } from "../../src/synth/scenario.js";
import { LedgerBuilder } from "../ledger-builder.js";
import { HAND_SETTINGS } from "../tax/helpers.js";

const SETTINGS = {
  ...HAND_SETTINGS,
  model_720_threshold_eur: "50000",
  model_720_increase_eur: "20000",
  model_720_alert_threshold_eur: "45000",
};

const accountsOf = (events: ReturnType<LedgerBuilder["build"]>, year: number) => {
  const report = model720(events, year, { today: `${year + 1}-06-01` });
  return report.categories.find((entry) => entry.category === "accounts") as InformativeCategory;
};

describe("the 720 of a year before the account existed", () => {
  const b = new LedgerBuilder();
  b.settings(SETTINGS);
  b.account("acc_ib", { platform: "ibkr", country: "IE" });
  b.deposit({ account_id: "acc_ib", value_date: "2027-03-01", amount: "60000" });
  const events = b.build();

  it("does not carry the balance of the following year into the average", () => {
    const category = accountsOf(events, 2026);
    expect(category.items).toEqual([]);
    expect(category.verdict).toBe("nothing_recorded");
  });

  it("still reports the account in the year it holds the balance", () => {
    const [item] = accountsOf(events, 2027).items;
    expect(item?.q4_average_eur?.amount.toString()).toBe("60000");
    expect(item?.balances?.[0]?.days).toBe(92);
  });

  it("does not need a rate for a currency the ledger only uses later", () => {
    const synthetic = generateLedger({ seed: 1 });
    for (const year of [2024, 2025]) {
      expect(accountsOf(synthetic, year).items).toEqual([]);
    }
  });

  it("lets the attention card read a ledger whose accounts start later than today's year", () => {
    expect(() => fiscalAttention(generateLedger({ seed: 1 }), "2026-10-23")).not.toThrow();
  });
});

describe("the 720 of a year in which the account opens", () => {
  it("counts an account opened in November from its first day, with no negative days", () => {
    const b = new LedgerBuilder();
    b.settings(SETTINGS);
    b.recordedAt("2027-11-10");
    b.account("acc_nov", { platform: "ibkr", country: "FR" });
    b.deposit({ account_id: "acc_nov", value_date: "2027-11-12", amount: "7000" });
    const [item] = accountsOf(b.build(), 2027).items;
    // 12 November to 31 December: 50 days, all of them at 7.000.
    expect(item?.balances?.[0]?.days).toBe(50);
    expect(item?.q4_average_eur?.amount.toString()).toBe("7000");
    expect(item?.value_eur?.amount.toString()).toBe("7000");
  });
});

describe("an account that starts after the year", () => {
  it("does not move the average of the others", () => {
    const b = new LedgerBuilder();
    b.settings(SETTINGS);
    b.account("acc_a", { platform: "ibkr", country: "IE" });
    b.account("acc_b", { platform: "ibkr", country: "FR" });
    b.deposit({ account_id: "acc_a", value_date: "2027-03-01", amount: "60000" });
    b.deposit({ account_id: "acc_a", value_date: "2028-01-15", amount: "40000" });
    b.deposit({ account_id: "acc_b", value_date: "2028-02-01", amount: "5000" });
    const items = accountsOf(b.build(), 2027).items;
    expect(items.map((item) => item.account_id)).toEqual(["acc_a"]);
    expect(items[0]?.q4_average_eur?.amount.toString()).toBe("60000");
    expect(items[0]?.balances?.[0]?.days).toBe(92);
  });
});
