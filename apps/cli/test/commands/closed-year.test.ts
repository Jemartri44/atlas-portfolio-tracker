// "This touches a tax year you have already filed" (ADR-0020; prompt 010, FR-018).
//
// It never refuses: filing late can be legitimate and is sometimes compulsory.
// What is not acceptable is doing it in silence, so the warning names the
// return and says how much each declared figure moves — **before** the
// question, which is the only moment it is still useful. And a past year
// nobody filed gets a note, not a warning: calling that "careful, you filed
// this" is how a warning stops being read.

import type { LedgerEvent } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { CLI_SETTINGS, Events } from "../events.js";
import { harness } from "../harness.js";

const FINGERPRINT = { schema_version: 1, lines: 6, sha256: "0".repeat(64) };

/**
 * A ledger with the Renta of 2027 filed: a gain of 2.000,00 declared, and
 * 400 shares left to sell in the same year.
 */
const filed = (tradeDate = "2027-09-01", valueDate = tradeDate): Events => {
  const b = new Events();
  b.settings(CLI_SETTINGS);
  b.account("acc_es");
  b.asset("etf_a", "etf");
  b.deposit("acc_es", "2027-01-04", "60000");
  b.buy("acc_es", "etf_a", "2027-01-05", "500", "100");
  b.sell("acc_es", "etf_a", valueDate, "100", "120", tradeDate);
  b.filed(
    {
      model: "renta",
      tax_year: 2027,
      filed_at: "2028-06-10",
      receipt_reference: "100-2027-ABCDEFGHIJKL",
      declared: {
        savings_base_eur: "2000.00",
        pending_losses: [],
        deferred_losses_eur: "0.00",
      },
      computed: {
        as_of: "2028-06-10",
        settings_origin: "event",
        settings: CLI_SETTINGS,
        savings_base_eur: "2000.00",
        pending_losses: [],
        deferred_losses_eur: "0.00",
      },
      ledger_fingerprint: FINGERPRINT,
    },
    "2028-06-10",
  );
  return b;
};

const run = async (argv: string[], events: LedgerEvent[] = filed().build()) => {
  const h = harness({ events, instant: "2028-09-01T10:00:00.000Z", confirm: true });
  const code = await h.exec(argv);
  expect(h.text()).not.toContain("Error");
  expect(code).toBe(0);
  return h.text();
};

describe("a write that reaches a filed return", () => {
  it("names the return and how much the base moves, before the question", async () => {
    const text = await run([
      "add",
      "sell",
      "--account",
      "acc_es",
      "--asset",
      "etf_a",
      "--trade-date",
      "2027-10-01",
      "--value-date",
      "2027-10-01",
      "--quantity",
      "100",
      "--unit-price",
      "130",
      "--currency",
      "EUR",
      "--fx-rate",
      "1",
      "--fx-rate-date",
      "2027-10-01",
      "--yes",
    ]);
    expect(text).toContain("afecta a la Renta de 2027, presentada el 2028-06-10");
    // 2.000,00 of the sale already declared plus 3.000,00 of this one.
    expect(text).toContain("la base del ahorro pasa de 2000 a 5000");
    expect(text).toContain("Puede que toque una complementaria");
    // Before the question, not after writing.
    expect(text.indexOf("afecta a la Renta")).toBeLessThan(text.indexOf("Registrado"));
  });

  it("says so when annulling, before the destructive confirmation", async () => {
    const events = filed().build();
    const sale = events.find((event) => event.type === "sell") as LedgerEvent;
    const text = await run(["delete", sale.id, "--reason", "duplicada"], events);
    expect(text).toContain("afecta a la Renta de 2027, presentada el 2028-06-10");
    expect(text).toContain("la base del ahorro pasa de 2000 a 0");
    expect(text.indexOf("afecta a la Renta")).toBeLessThan(text.indexOf("Registrado"));
  });

  /**
   * `atlas edit` has its own call, separate from the one `delete` uses, and
   * nothing covered it: deleting its loop left the whole suite green, because
   * the architecture test was happy with the **file** naming the warning
   * somewhere and `delete`, two functions below, names it.
   */
  it("says so when correcting, with the figure the correction moves", async () => {
    const events = filed().build();
    const sale = events.find((event) => event.type === "sell") as LedgerEvent;
    // The same sale at 140 instead of 120: 2.000,00 declared becomes 4.000,00.
    const text = await run(
      ["edit", sale.id, "--reason", "precio mal tecleado", "--unit-price", "140"],
      events,
    );
    expect(text).toContain("afecta a la Renta de 2027, presentada el 2028-06-10");
    expect(text).toContain("la base del ahorro pasa de 2000 a 4000");
    expect(text).toContain("Puede que toque una complementaria");
    // Before the question, which is the only moment it is still useful.
    expect(text.indexOf("afecta a la Renta")).toBeLessThan(text.indexOf("Registrados"));
  });

  it("names it when a settings change moves what the return declared", async () => {
    // The sale is traded in 2027 and settled in 2028: reading ETFs by value
    // date empties the year that was filed, without touching one event.
    const text = await run(
      ["settings", "set", "--fiscal-date-rule", "etf=value_date"],
      filed("2027-12-30", "2028-01-03").build(),
    );
    expect(text).toContain("mueve la base del ahorro de ejercicios anteriores");
    expect(text).toContain("afecta a la Renta de 2027, presentada el 2028-06-10");
    expect(text).toContain("la base del ahorro pasa de 2000 a 0");
  });

  /**
   * **Found by looking at the screen**, which is where the last three defects
   * of feature 010 came from too. Nobody had seen it because a 720 only
   * reached this warning when the write fell **by date** inside its year;
   * since the third outcome exists it reaches it whenever anything is written,
   * and the first screenshot of the new case read «Afecta a el Modelo 720».
   */
  it("contracts the preposition: al Modelo 720, never «a el Modelo 720»", async () => {
    // The straddling sale, so the Renta moves too and both articles show.
    const b = filed("2027-12-30", "2028-01-03");
    b.filed(
      {
        model: "720",
        tax_year: 2027,
        filed_at: "2028-03-20",
        receipt_reference: "720-2027-ABCDEFGHIJKL",
        declared: { items: [] },
        computed: {
          as_of: "2028-03-20",
          settings_origin: "event",
          settings: CLI_SETTINGS,
          items: [],
        },
        ledger_fingerprint: FINGERPRINT,
      },
      "2028-03-20",
    );
    const text = await run(["settings", "set", "--fiscal-date-rule", "etf=value_date"], b.build());
    expect(text).toContain("afecta al Modelo 720 de 2027");
    expect(text).not.toContain("a el Modelo");
    // And the Renta keeps its own article.
    expect(text).toContain("afecta a la Renta de 2027");
  });

  /**
   * The participle agrees with the return too: the Renta is feminine, a
   * «Modelo» masculine. The line used to read «afecta al Modelo 720 de 2027,
   * presentada el …» for every model.
   */
  it("makes the participle agree: presentado for a model, presentada for the Renta", async () => {
    const b = filed("2027-12-30", "2028-01-03");
    b.filed(
      {
        model: "720",
        tax_year: 2027,
        filed_at: "2028-03-20",
        receipt_reference: "720-2027-ABCDEFGHIJKL",
        declared: { items: [] },
        computed: {
          as_of: "2028-03-20",
          settings_origin: "event",
          settings: CLI_SETTINGS,
          items: [],
        },
        ledger_fingerprint: FINGERPRINT,
      },
      "2028-03-20",
    );
    const text = await run(["settings", "set", "--fiscal-date-rule", "etf=value_date"], b.build());
    expect(text).toContain("afecta al Modelo 720 de 2027, presentado el 2028-03-20.");
    expect(text).not.toContain("Modelo 720 de 2027, presentada");
    expect(text).toContain("afecta a la Renta de 2027, presentada el 2028-06-10.");
  });

  it("warns on a corporate action by its date alone, which moves no figure", async () => {
    // A split does not change a single euro of the return, but it lands in a
    // year that was filed and rewrites the lots of it: the user has to know
    // before saying yes. This path does not go through `confirmAndRecord`.
    const text = await run([
      "ca",
      "split",
      "--asset",
      "etf_a",
      "--ratio",
      "2",
      "--effective-date",
      "2027-11-01",
      "--source-document",
      "https://issuer.example/notice.pdf",
    ]);
    expect(text).toContain("afecta a la Renta de 2027, presentada el 2028-06-10");
    expect(text).toContain("no mueve ninguna cifra declarada");
    expect(text.indexOf("afecta a la Renta")).toBeLessThan(text.indexOf("Registrado"));
  });

  it("is quiet on a ledger with nothing filed, and says which years are not", async () => {
    const b = new Events();
    b.settings(CLI_SETTINGS);
    b.account("acc_es");
    b.asset("etf_a", "etf");
    b.deposit("acc_es", "2027-01-04", "60000");
    b.buy("acc_es", "etf_a", "2027-01-05", "500", "100");
    b.sell("acc_es", "etf_a", "2027-09-01", "100", "120");
    const text = await run(
      [
        "add",
        "cash-in",
        "--account",
        "acc_es",
        "--value-date",
        "2028-08-01",
        "--amount",
        "100",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2028-08-01",
        "--yes",
      ],
      b.build(),
    );
    expect(text).not.toContain("afecta a la Renta");
    // The note (S8), after writing: it asks for the filing to be recorded, it
    // does not pretend one exists.
    expect(text).toContain("el ejercicio 2027 tiene cifras y no consta");
    expect(text).toContain("atlas filed renta");
    expect(text.indexOf("Registrado")).toBeLessThan(text.indexOf("no consta"));
  });
});
