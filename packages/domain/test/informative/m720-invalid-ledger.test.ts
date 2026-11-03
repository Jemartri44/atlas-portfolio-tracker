import { describe, expect, it } from "vitest";
import { model720 } from "../../src/informative/m720.js";
import { LedgerBuilder } from "../ledger-builder.js";

describe("model720 over an invalid ledger", () => {
  it("refuses it, naming the invalid events, before any verdict", () => {
    const b = new LedgerBuilder();
    b.account("acc_ib", { platform: "ibkr", country: "IE" });
    b.asset("fund_f");
    const orphan = b.sell({
      account_id: "acc_ib",
      asset_id: "fund_f",
      value_date: "2027-09-01",
      quantity: "1",
      unit_price: "50",
    });
    expect(() => model720(b.build(), 2027, { today: "2028-03-01" })).toThrow(
      expect.objectContaining({
        code: "tax_ledger_invalid",
        details: expect.objectContaining({
          count: 1,
          invalid: [expect.objectContaining({ id: orphan.id })],
        }),
      }),
    );
  });
});
