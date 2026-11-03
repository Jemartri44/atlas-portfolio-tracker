// @vitest-environment happy-dom
//
// Income in kind goes into no base of Atlas, so the return has to say so: the note of the report
// is the only place the user learns there is something to add.

import type { Warning } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { InKindNotes } from "../src/routes/fiscal/RateNotes.jsx";
import { show, text } from "./helpers/render.jsx";

const note = (code: string, details: Record<string, unknown>): Warning => ({
  code,
  event_id: "",
  message: "",
  details,
});

describe("the income in kind of the return", () => {
  it("tells the user to add it to the general base, and what is missing", async () => {
    const host = await show("/", () => (
      <InKindNotes
        notes={[
          note("tax_in_kind_income_not_integrated", { income_eur: "50", base: "general" }),
          note("tax_in_kind_income_missing", {}),
          note("tax_quota_not_computed", {}),
        ]}
        events={[]}
        names={{}}
        privacy={false}
      />
    ));
    expect(text(host)).toContain("Renta en especie: súmala tú");
    expect(text(host)).toContain("súmalos tú en la declaración");
    expect(text(host)).toContain("entra a coste cero");
    expect(text(host)).not.toContain("cuota");
  });

  it("says nothing when there is none", async () => {
    const host = await show("/", () => (
      <InKindNotes notes={[]} events={[]} names={{}} privacy={false} />
    ));
    expect(text(host)).not.toContain("Renta en especie");
  });
});
