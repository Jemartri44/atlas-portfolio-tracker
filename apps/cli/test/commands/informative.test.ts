// atlas m720 <año> · atlas m721 <año> · atlas tax <año> --boxes
//
// The console is the deliverable: a verdict printed from the wrong field, a
// box number taken from another year or a marked value shown as a clean one
// would pass every test of the domain. These read the text the user reads.

import { describe, expect, it } from "vitest";
import { CLI_SETTINGS, Events } from "../events.js";
import { harness } from "../harness.js";

/** Securities abroad worth 60.000,00 at 31/12/2027, and one Spanish account. */
const abroad = (unit = "600"): Events => {
  const b = new Events();
  b.settings(CLI_SETTINGS);
  b.account("acc_ib", "IE");
  b.account("acc_es");
  b.asset("etf_a", "etf");
  b.deposit("acc_ib", "2027-01-04", "10100");
  b.deposit("acc_es", "2027-01-04", "90000");
  b.buy("acc_ib", "etf_a", "2027-01-05", "100", "100");
  b.valuation("acc_ib", "etf_a", "2027-12-31", "100", unit);
  return b;
};

const run = async (argv: string[], events = abroad().build()) => {
  const h = harness({ events, instant: "2028-03-01T10:00:00.000Z" });
  expect(await h.exec(argv)).toBe(0);
  return h;
};

describe("atlas m720", () => {
  it("says the verdict of each category, the exclusion and the criteria", async () => {
    const h = await run(["m720", "2027"]);
    const text = h.text();
    expect(text).toContain("MODELO 720 de 2027");
    expect(text).toContain("núcleo y cubo agregados por contribuyente");
    expect(text).toContain("Umbral 50000.00");
    expect(text).toContain("Total 60000.00 → OBLIGADO");
    expect(text).toContain("supera el umbral");
    // The Spanish account holds 90.000,00 and is out: with it in, the accounts
    // would oblige too.
    expect(text).toContain("Quedan fuera por ser cuentas españolas: acc_es");
    expect(text).toContain("Total a 31/12 100.00");
    expect(text).toContain("no obligado");
    expect(text).toContain("Criterios de los que depende: 6, 11");
  });

  it("says what is missing instead of saying no", async () => {
    const b = abroad();
    const without = b.build().filter((event) => event.type !== "valuation");
    const h = await run(["m720", "2027"], without);
    expect(h.text()).toContain("NO SE PUEDE DETERMINAR");
    expect(h.text()).toContain("Registra las valoraciones a 31/12");
    expect(h.text()).not.toContain("→ no obligado\n  ·");
  });

  it("emits the whole model with --json", async () => {
    const h = await run(["m720", "2027", "--json"]);
    const data = h.json() as { model: string; categories: { verdict: string }[] };
    expect(data.model).toBe("720");
    expect(data.categories.map((entry) => entry.verdict)).toEqual(["not_obliged", "obliged"]);
  });

  it("refuses to be called as a year of atlas tax", async () => {
    // `atlas tax 720` would read 720 as the tax year, which is why the models
    // have commands of their own (prompt 010, block 5).
    const h = harness({ events: abroad().build() });
    expect(await h.exec(["tax", "720"])).not.toBe(0);
    expect(h.text()).toContain("2018");
  });
});

describe("atlas m721", () => {
  it("counts nothing when the crypto is held through an ETP", async () => {
    const h = await run(["m721", "2027"]);
    expect(h.text()).toContain("MODELO 721 de 2027");
    expect(h.text()).toContain("Criptomonedas");
    expect(h.text()).toContain("Total 0.00 → no obligado");
  });

  it("has no 2022", async () => {
    const h = await run(["m721", "2022"]);
    expect(h.text()).toContain("el modelo no existía ese ejercicio");
    expect(h.text()).toContain("sin veredicto");
  });
});

describe("atlas tax --boxes", () => {
  /** A ledger with a disposal in 2025, which is the year whose boxes are checked. */
  const withDisposal = (): Events => {
    const b = new Events();
    b.settings(CLI_SETTINGS);
    b.account("acc_ib", "IE");
    b.asset("etf_a", "etf");
    b.deposit("acc_ib", "2024-01-04", "10000");
    b.buy("acc_ib", "etf_a", "2024-02-10", "100", "100");
    b.sell("acc_ib", "etf_a", "2025-09-01", "100", "120");
    return b;
  };

  it("prints the box, its literal label and where it was checked", async () => {
    const h = harness({ events: withDisposal().build(), instant: "2026-06-01T10:00:00.000Z" });
    expect(await h.exec(["tax", "2025", "--boxes"])).toBe(0);
    const text = h.text();
    expect(text).toContain("TU DECLARACIÓN POR CASILLAS — Renta 2025");
    expect(text).toContain("Orden HAC/277/2026");
    expect(text).toContain("comprobadas el 2026-09-23");
    // The section of the ETFs, which 2025 created.
    expect(text).toContain("2227");
    expect(text).toContain("Importe global de las transmisiones efectuadas en 2025");
    expect(text).toContain("12000.00");
    expect(text).toContain("0460");
    expect(text).toContain("Base imponible del ahorro");
    // The NIF is not in the ledger and is not invented.
    expect(text).toContain("falta en tus datos");
  });

  it("gives another year by concept, with no number at all", async () => {
    const h = harness({ events: withDisposal().build(), instant: "2027-06-01T10:00:00.000Z" });
    expect(await h.exec(["tax", "2026", "--boxes"])).toBe(0);
    expect(h.text()).toContain("no están comprobadas en un formulario oficial");
    expect(h.text()).toContain("Nunca se usa la casilla de otro ejercicio");
    // Every figure still says **what it is**: the year with no table is the
    // normal case (2025 is the only one checked and the first real return is
    // 2026), so a column of amounts with no concept beside them would be the
    // ordinary output, not an edge case.
    expect(h.text()).toContain("Base imponible del ahorro");
    expect(h.text()).toContain("Saldo de rendimientos del capital mobiliario");
    expect(h.text()).not.toContain("0460");
    // And no raw ConceptId reaches the reader.
    expect(h.text()).not.toContain("base.savings");
  });

  it("emits the layout with --json", async () => {
    const h = harness({ events: withDisposal().build(), instant: "2026-06-01T10:00:00.000Z" });
    expect(await h.exec(["tax", "2025", "--boxes", "--json"])).toBe(0);
    const data = JSON.parse(h.text()) as { mapping: string; entries: { box?: string }[] };
    expect(data.mapping).toBe("checked");
    expect(data.entries.some((entry) => entry.box === "0460")).toBe(true);
  });
});
