import { describe, expect, it } from "vitest";
import { integrity } from "../../src/projections/integrity.js";
import { projectLedger } from "../../src/projections/project-ledger.js";
import { catalogue, LedgerBuilder } from "../ledger-builder.js";

describe("integrity: dangling references", () => {
  it("reports a reference_etf_id that does not exist in the catalogue", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    b.asset("ast_ok", { reference_etf_id: "ast_gold" });
    expect(integrity(projectLedger(b.build()))).toEqual([]);
    b.asset("ast_dangling", { reference_etf_id: "ast_missing" });
    const findings = integrity(projectLedger(b.build()));
    expect(findings).toEqual([
      {
        severity: "error",
        code: "dangling_reference",
        message: "asset ast_dangling references unknown reference_etf_id ast_missing",
        event_ids: [],
      },
    ]);
  });

  it("does not repeat a dangling corrects_id: the projection already rejects it", () => {
    const b = new LedgerBuilder();
    catalogue(b);
    const original = b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    const correction = b.buy({ account_id: "acc_fund", asset_id: "ast_world" });
    correction.corrects_id = original.id;
    const findings = integrity(projectLedger(b.build(), { collectErrors: true }));
    expect(findings.map((f) => f.code)).toEqual(["dangling_correction"]);
    expect(findings[0]?.event_ids).toEqual([correction.id]);
  });
});
