// @vitest-environment happy-dom
//
// What was paid for the return beside the estimate of its savings part: compared, never
// subtracted, with the note that the payment is of the whole return always in sight.

import { type LedgerEvent, projectLedger } from "@atlas/domain";
import { taxYear } from "@atlas/domain/fiscal";
import { describe, expect, it } from "vitest";
import { quotaOf } from "../src/routes/fiscal/estimates.js";
import { EstimateCards } from "../src/routes/fiscal/QuotaCard.jsx";
import { goldenEvents } from "./helpers/golden.js";
import { show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const payment = (id: string, fields: Record<string, string | number>): LedgerEvent =>
  ({
    schema_version: 1,
    id,
    recorded_at: "2029-07-05T10:00:00.000Z",
    type: "tax_payment",
    tax_year: 2028,
    date: "2029-06-30",
    amount_eur: "600",
    kind: "payment",
    instalment: "first",
    fingerprint: `sha256:${id}`,
    ...fields,
  }) as LedgerEvent;

const cardsOf = async (extra: LedgerEvent[]): Promise<string> => {
  const events = [...goldenEvents(), ...extra];
  const options = { today: "2029-12-01" };
  const estimate = quotaOf(projectLedger(events), events, taxYear(events, 2028, options), options);
  return text(await show("/", () => <EstimateCards estimate={estimate} />));
};

const NOTE =
  "El pago es el de toda tu Renta (trabajo, actividad…); Atlas estima solo la parte del ahorro.";

describe("what was paid for the return", () => {
  it("adds up the instalments of the year beside the estimate, with the note", async () => {
    const shown = await cardsOf([
      payment("01MZZZZZZZZZZZZZZZZZZZZZP1", {}),
      payment("01MZZZZZZZZZZZZZZZZZZZZZP2", {
        date: "2029-11-05",
        amount_eur: "400",
        instalment: "second",
      }),
    ]);
    expect(shown).toMatch(
      /Resultado estimado de esta parte.*Pagado por la Renta de 2028\+1\.000,00/,
    );
    expect(shown).toContain(NOTE);
  });

  it("says a refund as such, negative like a result to be refunded", async () => {
    const shown = await cardsOf([
      payment("01MZZZZZZZZZZZZZZZZZZZZZP3", {
        kind: "refund",
        instalment: "single",
        amount_eur: "80",
      }),
    ]);
    expect(shown).toMatch(/Devuelto por la Renta de 2028−80,00/);
  });

  it("shows nothing of it without payments recorded for the year", async () => {
    const shown = await cardsOf([
      payment("01MZZZZZZZZZZZZZZZZZZZZZP4", { tax_year: 2027, date: "2028-06-30" }),
    ]);
    expect(shown).not.toContain("por la Renta de");
    expect(shown).not.toContain(NOTE);
  });
});
