// @vitest-environment happy-dom
//
// The chip of the status bar (FR-011): the ledger lives in the cloud and the
// device keeps no copy (ADR-0035), so it says where it is and nothing about
// exporting or its age.

import { describe, expect, it } from "vitest";
import { LedgerChip } from "../src/shell/LedgerChip.jsx";
import { openLedger, show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

describe("the ledger chip", () => {
  it("says the data live in the cloud, with no age and no reminder", async () => {
    await openLedger();
    const host = await show("/", LedgerChip);
    const chip = host.querySelector(".source");
    expect(text(chip)).toContain("Nube");
    expect(chip?.querySelector(".age")).toBeNull();
    expect(chip?.getAttribute("title")).toContain("este dispositivo no guarda el libro");
  });
});
