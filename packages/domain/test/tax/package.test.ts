// The income tax package (CSV). The figures are the boxes' own, already worked
// out by hand in `boxes-2025.test.ts`; what is checked here is the file: which
// rows, which columns, and that a spreadsheet reads it as written.

import { describe, expect, it } from "vitest";
import { taxBoxes } from "../../src/tax/boxes/boxes.js";
import {
  CODE_WORDS,
  PACKAGE_COLUMNS,
  packageCsv,
  rentaPackage,
} from "../../src/tax/boxes/package.js";
import { taxYear } from "../../src/tax/year.js";
import { HAND_SETTINGS, taxBuilder } from "./helpers.js";

/** A fund named like a formula, bought for 1,000 in 2024 and sold for 1,200 in `year`. */
const ledger = (year: number) => {
  const b = taxBuilder(HAND_SETTINGS);
  b.asset("fund_n", { name: '=Fondo; "Mundo"', isin: "ES0000000001" });
  b.buy({ account_id: "acc_a", asset_id: "fund_n", value_date: "2024-03-01" });
  b.sell({
    account_id: "acc_a",
    asset_id: "fund_n",
    quantity: "10",
    unit_price: "120",
    value_date: `${year}-06-10`,
  });
  return b;
};

/** The cells of each line, read as a spreadsheet reads them: `;`, quotes doubled. */
const cellsOf = (csv: string): string[][] => {
  const lines: string[][] = [[]];
  let cell = "";
  let quoted = false;
  const text = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ";") {
      (lines.at(-1) as string[]).push(cell);
      cell = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      (lines.at(-1) as string[]).push(cell);
      cell = "";
      lines.push([]);
      i++;
    } else {
      cell += c;
    }
  }
  return lines.slice(0, -1);
};

/** The rows as records, by the name of the column; every line has every column. */
const rowsOf = (csv: string) => {
  const [header, ...lines] = cellsOf(csv);
  expect(header).toEqual([...PACKAGE_COLUMNS]);
  for (const line of lines) {
    expect(line).toHaveLength(PACKAGE_COLUMNS.length);
  }
  return lines.map((line) =>
    Object.fromEntries(PACKAGE_COLUMNS.map((column, i) => [column, line[i] as string])),
  );
};

describe("rentaPackage", () => {
  const csv = rentaPackage(ledger(2025).build(), 2025, { today: "2026-05-01" });
  const rows = rowsOf(csv);

  it("is a file a Spanish spreadsheet opens as written", () => {
    expect(csv.startsWith("\uFEFFtipo;apartado;")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(
      csv
        .split("\r\n")
        .every(
          (line) =>
            line.split(";").length >= PACKAGE_COLUMNS.length || line === "" || line.includes('"'),
        ),
    ).toBe(true);
    // The name is quoted, its quotes doubled, and a leading "=" is made inert.
    expect(csv).toContain(`"'=Fondo; ""Mundo"""`);
    expect(rows.find((row) => row.casilla === "0312")?.activo).toBe(`'=Fondo; "Mundo"`);
  });

  it("says which form the boxes were read in", () => {
    expect(rows[0]?.tipo).toBe("ejercicio");
    expect(rows[0]?.ejercicio_origen).toBe("2025");
    expect(rows[0]?.texto).toContain("Orden HAC/277/2026");
    expect(rows[0]?.texto).toContain("el 2026-09-23");
  });

  it("writes each box with its number, label, amount with a decimal comma and source", () => {
    const transmission = rows.find((row) => row.casilla === "0312");
    expect(transmission).toMatchObject({
      tipo: "casilla",
      apartado: "iic",
      importe_eur: "1200,00",
      fecha: "2025-06-10",
      isin: "ES0000000001",
      certeza: "alta",
      fuente: "https://www.boe.es/datos/imagenes/disp/2026/76/7041_16815484_14.png",
    });
    expect(rows.find((row) => row.casilla === "0460")?.importe_eur).toBe("200,00");
    expect(rows.find((row) => row.casilla === "0311")?.texto).toBe("no consta en el libro");
    expect(rows.find((row) => row.casilla === "0510")?.parcial).toBe("reductions_unknown");
  });

  it("details every lot of a disposal with the purchase at its root and its ECB rate", () => {
    const lots = rows.filter((row) => row.tipo === "lote");
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({
      operacion: transmissionId(),
      fecha_adquisicion: "2024-03-01",
      cantidad: "10",
      coste_eur: "1000,00",
      transmision_eur: "1200,00",
      resultado_eur: "200,00",
      fecha_compra_origen: "2024-03-01",
      cantidad_compra_origen: "10",
      importe_compra_origen: "1000",
      divisa_compra_origen: "EUR",
      tipo_bce: "1",
      fecha_tipo_bce: "2024-03-01",
    });
  });

  const transmissionId = () => rows.find((row) => row.casilla === "0312")?.operacion;

  it("uses the words of the interface, and codes without them", () => {
    expect(rows.filter((row) => row.tipo === "nota").map((row) => row.concepto)).toContain(
      "tax_box_partial",
    );
    const worded = rowsOf(
      rentaPackage(
        ledger(2025).build(),
        2025,
        { today: "2026-05-01" },
        {
          block: (block) => `B:${block}`,
          partial: (reason) => `P:${reason}`,
          note: (note) => `N:${note.code}`,
        },
      ),
    );
    expect(worded.find((row) => row.casilla === "0312")?.apartado).toBe("B:iic");
    expect(worded.find((row) => row.casilla === "0510")?.parcial).toBe("P:reductions_unknown");
    expect(worded.find((row) => row.tipo === "nota")?.texto).toMatch(/^N:/);
    expect(CODE_WORDS.block("iic")).toBe("iic");
  });

  it("keeps the amounts and leaves the boxes empty for a year with none checked", () => {
    const year = rowsOf(rentaPackage(ledger(2024).build(), 2024, { today: "2026-05-01" }));
    expect(year[0]?.texto).toMatch(/^Sin casillas comprobadas/);
    const boxes = year.filter((row) => row.tipo === "casilla");
    expect(boxes.every((row) => row.casilla === "")).toBe(true);
    expect(boxes.some((row) => row.importe_eur === "1200,00")).toBe(true);
  });

  it("names an exchange difference by its currency", () => {
    // 1,000 € bought 1,100 USD at 1.10; selling them back at 1.00 gives 1,100 €: +100.
    const b = taxBuilder(HAND_SETTINGS);
    b.fx({
      account_id: "acc_b",
      value_date: "2025-02-03",
      sold_amount: "1000",
      bought_amount: "1100",
      fee: "0",
      fx_rate_bought: "1.1",
      fx_rate_date: "2025-02-03",
    });
    b.fx({
      account_id: "acc_b",
      value_date: "2025-05-05",
      sold_amount: "1100",
      sold_currency: "USD",
      bought_amount: "1100",
      bought_currency: "EUR",
      fee: "0",
      fx_rate_sold: "1",
      fx_rate_bought: "1",
      fx_rate_date: "2025-05-05",
    });
    const currency = rowsOf(rentaPackage(b.build(), 2025, { today: "2026-05-01" })).filter(
      (row) => row.activo === "USD",
    );
    expect(currency.length).toBeGreaterThan(0);
    expect(currency.every((row) => row.isin === "")).toBe(true);
    // The lot of dollars it consumed: 1,100 USD that cost 1,000 €.
    expect(currency.filter((row) => row.tipo === "lote")).toMatchObject([
      { fecha_adquisicion: "2025-02-03", cantidad: "1100", coste_eur: "1000,00" },
    ]);
  });

  it("writes the year a pending loss comes from", () => {
    // A loss of 200 in 2024 on another fund, offset in 2025 against the gain (art. 49).
    const b = ledger(2025);
    b.buy({ account_id: "acc_a", asset_id: "fund_f", value_date: "2023-03-01" });
    b.sell({
      account_id: "acc_a",
      asset_id: "fund_f",
      quantity: "10",
      unit_price: "80",
      value_date: "2024-06-10",
    });
    const offset = rowsOf(rentaPackage(b.build(), 2025, { today: "2026-05-01" })).filter(
      (row) => row.ejercicio_origen === "2024",
    );
    expect(offset.some((row) => row.importe_eur === "200,00")).toBe(true);
  });

  it("makes every field inert that a spreadsheet would run, and leaves numbers alone", () => {
    // A loss of 200 in 2024: its lot result is a negative number, not a formula.
    const b = ledger(2025);
    b.buy({ account_id: "acc_a", asset_id: "fund_f", value_date: "2023-03-01" });
    b.sell({
      account_id: "acc_a",
      asset_id: "fund_f",
      quantity: "10",
      unit_price: "80",
      value_date: "2024-06-10",
    });
    const events = b.build();
    const options = { today: "2026-05-01" };
    const csv = packageCsv(taxBoxes(events, 2024, options), taxYear(events, 2024, options), {
      ...CODE_WORDS,
      name: () => "+1",
      isin: () => "@SUM(1)",
      note: () => "\t=1",
    });
    const rows = rowsOf(csv);
    const lot = rows.find((row) => row.tipo === "lote");
    expect(lot?.resultado_eur).toBe("-200,00");
    expect(lot?.activo).toBe("'+1");
    expect(lot?.isin).toBe("'@SUM(1)");
    expect(rows.find((row) => row.tipo === "nota")?.texto).toBe("'\t=1");
  });
});
