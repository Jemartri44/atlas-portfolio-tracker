// atlas filed <renta|720|721> <año> — recording a return that was filed.
//
// The command proposes what the application computes and lets the user replace
// any figure with what he really declared. What is checked here is that the two
// stay apart: what is written is what was **declared**, and what the
// application computed that day is written next to it, not instead of it.

import { describe, expect, it } from "vitest";
import { CLI_SETTINGS, Events } from "../events.js";
import { harness } from "../harness.js";

/** A ledger with a gain of 2.000,00 in 2027 and securities abroad. */
const ledger = (): Events => {
  const b = new Events();
  b.settings(CLI_SETTINGS);
  b.account("acc_ib", "IE");
  b.asset("etf_a", "etf");
  b.deposit("acc_ib", "2027-01-04", "60000");
  b.buy("acc_ib", "etf_a", "2027-01-05", "500", "100");
  b.sell("acc_ib", "etf_a", "2027-09-01", "100", "120");
  b.valuation("acc_ib", "etf_a", "2027-12-31", "400", "150");
  return b;
};

const run = async (argv: string[], confirm = true) => {
  const h = harness({
    events: ledger().build(),
    instant: "2028-06-10T10:00:00.000Z",
    confirm,
  });
  const code = await h.exec(argv);
  return { h, code };
};

const lastEvent = async (h: Awaited<ReturnType<typeof run>>["h"]) => {
  const { events } = await h.store.load();
  return events[events.length - 1] as unknown as Record<string, unknown>;
};

describe("atlas filed renta", () => {
  it("proposes what it computes and writes what the user confirms", async () => {
    const { h, code } = await run([
      "filed",
      "renta",
      "2027",
      "--receipt",
      "100-2027-ABCDEFGHIJKL",
      "--yes",
    ]);
    expect(code).toBe(0);
    expect(h.text()).toContain("Lo que la aplicación calcula hoy para la Renta de 2027");
    expect(h.text()).toContain("base");
    expect(h.text()).toContain("2000.00");
    expect(h.text()).toContain("es un hecho con consecuencias legales");
    const event = await lastEvent(h);
    expect(event.type).toBe("tax_return_filed");
    expect(event.model).toBe("renta");
    expect(event.tax_year).toBe(2027);
    expect(event.filed_at).toBe("2028-06-10");
    expect((event.declared as { savings_base_eur: string }).savings_base_eur).toBe("2000.00");
    // What it computed that day travels with it, so a future reading can tell
    // a change of the engine from a change of the ledger.
    const computed = event.computed as {
      as_of: string;
      settings: unknown;
      settings_origin: string;
    };
    expect(computed.as_of).toBe("2028-06-10");
    expect(computed.settings_origin).not.toBe("default");
    expect(computed.settings).toBeTypeOf("object");
    // And the fingerprint covers exactly the lines before it.
    expect((event.ledger_fingerprint as { lines: number }).lines).toBe(
      (await h.store.load()).events.length - 1,
    );
  });

  it("replaces a figure with what was really declared, and keeps both", async () => {
    const { h, code } = await run([
      "filed",
      "renta",
      "2027",
      "--set",
      "base=1950.00",
      "--receipt",
      "100-2027-ABCDEFGHIJKL",
      "--yes",
    ]);
    expect(code).toBe(0);
    const event = await lastEvent(h);
    expect((event.declared as { savings_base_eur: string }).savings_base_eur).toBe("1950.00");
    expect((event.computed as { savings_base_eur: string }).savings_base_eur).toBe("2000.00");
  });

  it("refuses a key the return does not have, and says which it has", async () => {
    const { h, code } = await run(["filed", "renta", "2027", "--set", "bass=1", "--yes"]);
    expect(code).not.toBe(0);
    expect(h.text()).toContain("esta declaración no tiene esa cifra");
    expect(h.text()).toContain("base");
  });

  it("writes nothing without a confirmation", async () => {
    const { h, code } = await run(["filed", "renta", "2027"], false);
    expect(code).toBe(0);
    expect(h.text()).toContain("Cancelado.");
    const { events } = await h.store.load();
    expect(events.some((event) => event.type === "tax_return_filed")).toBe(false);
  });
});

describe("atlas filed 720", () => {
  it("declares the categories that have assets, with their list", async () => {
    const { h, code } = await run([
      "filed",
      "720",
      "2027",
      "--filed-at",
      "2028-03-15",
      "--receipt",
      "720-2027-ABCDEFGHIJKL",
      "--yes",
    ]);
    expect(code).toBe(0);
    expect(h.text()).toContain("el Modelo 720 de 2027");
    const event = await lastEvent(h);
    const declared = event.declared as {
      securities: { value_eur: string };
      accounts: { balance_eur: string; q4_average_eur: string };
      items: { category: string; asset_id?: string }[];
    };
    // 400 units at 150,00; and 60.000,00 deposited, less 50.000,00 of the
    // purchase, plus the 12.000,00 of the sale.
    expect(declared.securities.value_eur).toBe("60000.00");
    expect(declared.accounts.balance_eur).toBe("22000.00");
    expect(declared.items.map((item) => item.category).sort()).toEqual(["accounts", "securities"]);
    expect(declared.items.find((item) => item.category === "securities")?.asset_id).toBe("etf_a");
  });

  it("takes several --set, one per figure", async () => {
    const { h, code } = await run([
      "filed",
      "720",
      "2027",
      "--filed-at",
      "2028-03-15",
      "--receipt",
      "720-2027-ABCDEFGHIJKL",
      "--set",
      "securities.value=59000.00",
      "--set",
      "item.acc_ib.etf_a=59000.00",
      "--yes",
    ]);
    expect(code).toBe(0);
    const declared = (await lastEvent(h)).declared as {
      securities: { value_eur: string };
      items: { asset_id?: string; value_eur?: string }[];
    };
    expect(declared.securities.value_eur).toBe("59000.00");
    expect(declared.items.find((item) => item.asset_id === "etf_a")?.value_eur).toBe("59000.00");
  });
});
