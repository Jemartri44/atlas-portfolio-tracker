// What `atlas tax` prints, figure by figure (feature 009, quality review B1).
//
// The console is the deliverable of the feature: a column printed from the
// wrong field, gains and losses swapped or the expiry lines dropped would pass
// every test of the domain. So these read the text the user reads and compare
// each figure with a literal worked out by hand for the ledger
// `tests/fixtures/ledger/tax-hand-v1.jsonl` (the working is in
// `packages/domain/test/tax/hand-checked.test.ts`). Never with `--json`, which
// comes out of the same engine as the text.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { harness } from "../harness.js";

const HAND = readFileSync(
  join(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../tests/fixtures/ledger"),
    "tax-hand-v1.jsonl",
  ),
  "utf8",
)
  .split("\n")
  .filter((line) => line !== "");

const ID = {
  S3: "01ARYZ6S41TSV4RRFFQ690000W",
  SX1: "01ARYZ6S41TSV4RRFFQ690000X",
  S5: "01ARYZ6S41TSV4RRFFQ690000Y",
  S6: "01ARYZ6S41TSV4RRFFQ690000Z",
  RS: "01ARYZ6S41TSV4RRFFQ6900010",
  U2: "01ARYZ6S41TSV4RRFFQ6900011",
  U3: "01ARYZ6S41TSV4RRFFQ6900012",
  I1: "01ARYZ6S41TSV4RRFFQ6900013",
  F4: "01ARYZ6S41TSV4RRFFQ6900015",
  SX2: "01ARYZ6S41TSV4RRFFQ6900016",
  Y2: "01ARYZ6S41TSV4RRFFQ690001B",
  I2: "01ARYZ6S41TSV4RRFFQ690001C",
  Y3: "01ARYZ6S41TSV4RRFFQ690001E",
  F5: "01ARYZ6S41TSV4RRFFQ690001F",
  D1: "01ARYZ6S41TSV4RRFFQ690001J",
  C2: "01ARYZ6S41TSV4RRFFQ690001K",
  FX: "01ARYZ6S41TSV4RRFFQ690001M",
  Y4: "01ARYZ6S41TSV4RRFFQ690001Q",
  FE: "01ARYZ6S41TSV4RRFFQ690001R",
  I4: "01ARYZ6S41TSV4RRFFQ690001S",
} as const;

const print = async (year: number): Promise<string> => {
  const h = harness({ lines: HAND, instant: "2026-09-18T10:00:00.000Z" });
  expect(await h.exec(["tax", String(year)])).toBe(0);
  return h.text();
};

/** The text of a numbered section: from its heading to the next one. */
const section = (text: string, number: number): string => {
  const start = text.indexOf(`\n${number}. `);
  const end = text.indexOf(`\n${number + 1}. `, start + 1);
  expect(start).toBeGreaterThan(-1);
  return text.slice(start, end === -1 ? undefined : end);
};

/**
 * The cells of the one row of `text` that starts with `first` (and contains
 * `also`), split where the columns are: two spaces or more.
 */
const row = (text: string, first: string, also = ""): string[] => {
  const found = text.split("\n").filter((line) => line.startsWith(first) && line.includes(also));
  expect(found).toHaveLength(1);
  return (found[0] as string).trim().split(/ {2,}/);
};

describe("atlas tax prints the figures worked out by hand", () => {
  it("2021: every column of the transmissions, the totals and the base", async () => {
    const text = await print(2021);
    const gains = section(text, 1);
    // −40 of its own, −20 deferred, −20 computable: never the own figure.
    expect(row(gains, "2021-07-01", ID.SX1)).toEqual([
      "2021-07-01",
      ID.SX1,
      "sell",
      "stk_eu",
      "cubo",
      "acc_bk",
      "12",
      "84 EUR",
      "1 (2021-07-01)",
      "84.00",
      "124.00",
      "-40.00",
      "0.00",
      "-20.00",
      "-20.00",
      "1* 2:listed* 3 6 14",
    ]);
    expect(row(gains, "2021-10-01", ID.RS)).toEqual([
      "2021-10-01",
      ID.RS,
      "forced_sale:reverse_split",
      "stk_eu",
      "cubo",
      "acc_bk",
      "0.5",
      "20 EUR",
      "1 (2021-10-01)",
      "20.00",
      "24.00",
      "-4.00",
      "0.00",
      "-4.00",
      "0.00",
      "2:listed* 3 6 14 19",
    ]);
    // (1,200 − 2) / 1.10 against (1,000 + 2) / 1.20.
    expect(row(gains, "2021-12-01", ID.U3)).toEqual([
      "2021-12-01",
      ID.U3,
      "sell",
      "stk_us",
      "cubo",
      "acc_bk",
      "10",
      "1198 USD",
      "1.10 (2021-12-01)",
      "1089.09",
      "835.00",
      "254.09",
      "0.00",
      "0.00",
      "254.09",
      "1* 3 4* 6",
    ]);
    expect(gains).toContain("Ganancias 254.09 · Pérdidas -20.00 · Saldo 234.09");

    const income = section(text, 2);
    expect(row(income, "2021-11-15", ID.U2)).toEqual([
      "2021-11-15",
      ID.U2,
      "stk_us",
      "30 USD",
      "1.20 (2021-11-15)",
      "25.00",
      "9",
      "0",
      "US",
      "6",
    ]);
    expect(income).toContain("Saldo 65.00");

    const wash = section(text, 3);
    expect(row(wash, ID.SX1, "2m [")).toEqual([
      ID.SX1,
      "stk_eu",
      "2021-07-01",
      "-20.00",
      "6 de 12",
      "2m [2021-05-01 … 2021-09-01]",
      `${ID.S3} 2021-05-01 4; ${ID.S5} 2021-09-01 2`,
    ]);
    expect(row(wash, ID.SX1, `${ID.S3}#0`)).toEqual([
      ID.SX1,
      `${ID.S3}#0`,
      "stk_eu",
      "-13.33",
      "no",
    ]);
    expect(row(wash, ID.RS, `${ID.S6}#0`)).toEqual([ID.RS, `${ID.S6}#0`, "stk_eu", "-4.00", "no"]);

    const offset = section(text, 4);
    expect(offset).toContain(
      "Límite conjunto del 25 %: contra ganancias 58.52, contra rendimientos 16.25.",
    );
    expect(row(offset, "2 ", "234.09")).toEqual([
      "2",
      "ganancias y pérdidas patrimoniales",
      "2020",
      "ganancias y pérdidas patrimoniales",
      "234.09",
      "no",
    ]);
    expect(row(offset, "2 ", "16.25")).toEqual([
      "2",
      "ganancias y pérdidas patrimoniales",
      "2020",
      "rendimientos del capital mobiliario",
      "16.25",
      "sí",
    ]);
    expect(row(section(text, 5), "2020")).toEqual([
      "2020",
      "ganancias y pérdidas patrimoniales",
      "-549.66",
      "2024",
    ]);
    // 65 − 16.25, never the 234.09 of gains.
    expect(text).toContain("BASE IMPONIBLE DEL AHORRO 2021: 48.75 EUR (base, no cuota)");

    const withheld = section(text, 6);
    expect(row(withheld, "2021-12-31", ID.I1)).toEqual([
      "2021-12-31",
      ID.I1,
      "interest",
      "7.6 EUR",
      "7.60",
    ]);
    expect(withheld).toContain("Total 7.60");

    // 7.50 withheld in the US, 3.75 deductible: the treaty's 15 % of 25.
    const foreign = section(text, 7);
    expect(row(foreign, ID.U2)).toEqual([ID.U2, "US", "25.00", "7.50", "15", "3.75", "3.75"]);
    expect(foreign).toContain("Deducible 3.75 · No deducible 3.75");

    // #4: documented "both", and here it is the conservative side: the columns
    // must not be confused.
    const doubtful = section(text, 8);
    expect(row(doubtful, "4 ")).toEqual([
      "4 ganancia en divisa y diferencias de cambio",
      "en disputa",
      "ambas",
      "diferencia: base -75.91",
      "conservador",
      ID.U3,
    ]);
    expect(row(doubtful, "22 ")).toEqual([
      "22 orden de la compensación entre ejercicios",
      "media",
      "neutro",
      "exposición 0.00",
      "neutro",
    ]);
  });

  it("2022: losses, the year's own offset and what waits for a repurchase", async () => {
    const text = await print(2022);
    const gains = section(text, 1);
    expect(row(gains, "2022-02-10", ID.F4).slice(9, 15)).toEqual([
      "904.50",
      "1005.00",
      "-100.50",
      "0.00",
      "-50.25",
      "-50.25",
    ]);
    expect(row(gains, "2022-03-01", ID.SX2).slice(9, 16)).toEqual([
      "120.00",
      "153.00",
      "-33.00",
      "-24.00",
      "0.00",
      "-57.00",
      "1* 2:listed* 3 6 14 19 21*",
    ]);
    expect(row(gains, "2022-12-15", ID.Y2).slice(9, 16)).toEqual([
      "80.00",
      "100.00",
      "-20.00",
      "0.00",
      "-20.00",
      "0.00",
      "1* 2:fund_1y* 3 6 14 18",
    ]);
    expect(gains).toContain("Ganancias 0.00 · Pérdidas -107.25 · Saldo -107.25");
    expect(section(text, 2)).toContain("Saldo 50.00");

    const wash = section(text, 3);
    expect(row(wash, ID.F4, `espera la recompra ${ID.F5}`)).toEqual([
      ID.F4,
      `espera la recompra ${ID.F5}`,
      "fund_x",
      "-30.00",
      "no",
    ]);
    expect(row(wash, ID.Y2, `espera la recompra ${ID.Y3}`)).toEqual([
      ID.Y2,
      `espera la recompra ${ID.Y3}`,
      "fund_y",
      "-20.00",
      "no",
    ]);
    expect(row(wash, ID.F4, "fund_d")).toEqual([
      ID.F4,
      "01ARYZ6S41TSV4RRFFQ690001A#1",
      "fund_d",
      "-15.00",
      "sí",
    ]);

    const offset = section(text, 4);
    expect(offset).toContain(
      "Límite conjunto del 25 %: contra ganancias 0.00, contra rendimientos 12.50.",
    );
    expect(row(offset, "1 ")).toEqual([
      "1",
      "ganancias y pérdidas patrimoniales",
      "2022",
      "rendimientos del capital mobiliario",
      "12.50",
      "sí",
    ]);
    const carried = section(text, 5);
    expect(row(carried, "2020")).toEqual([
      "2020",
      "ganancias y pérdidas patrimoniales",
      "-549.66",
      "2024",
    ]);
    expect(row(carried, "2022")).toEqual([
      "2022",
      "ganancias y pérdidas patrimoniales",
      "-94.75",
      "2026",
    ]);
    expect(text).toContain("BASE IMPONIBLE DEL AHORRO 2022: 37.50 EUR (base, no cuota)");
    expect(section(text, 6)).toContain("Total 9.50");
  });

  it("2023: releases, the swap and its fee, and the order of two years at stake", async () => {
    const text = await print(2023);
    const gains = section(text, 1);
    expect(row(gains, "2023-06-01", ID.D1).slice(9, 15)).toEqual([
      "340.00",
      "300.00",
      "40.00",
      "-15.00",
      "0.00",
      "25.00",
    ]);
    expect(row(gains, "2023-08-01", ID.C2).slice(9, 16)).toEqual([
      "1285.00",
      "1000.00",
      "285.00",
      "0.00",
      "0.00",
      "285.00",
      "1* 3 6 17*",
    ]);
    expect(row(gains, "2023-09-01", ID.FX).slice(9, 15)).toEqual([
      "423.00",
      "363.00",
      "60.00",
      "-35.25",
      "0.00",
      "24.75",
    ]);
    expect(gains).toContain("Ganancias 334.75 · Pérdidas 0.00 · Saldo 334.75");
    const offset = section(text, 4);
    expect(row(offset, "2 ", "334.75")[4]).toBe("334.75");
    expect(row(offset, "2 ", "rendimientos")[4]).toBe("5.00");
    expect(row(section(text, 5), "2020")[2]).toBe("-209.91");
    expect(text).toContain("BASE IMPONIBLE DEL AHORRO 2023: 15.00 EUR (base, no cuota)");
    const doubtful = section(text, 8);
    expect(row(doubtful, "17 ").slice(1, 5)).toEqual([
      "media",
      "agresivo",
      "exposición 15.00",
      "agresivo",
    ]);
    expect(row(doubtful, "22 ")[3]).toBe("exposición 339.75");
  });

  it("2024: the fee in dollars at its own rate, and the loss of 2020 that expires", async () => {
    const text = await print(2024);
    const income = section(text, 2);
    // 12.50 USD / 1.25 = 10.00, deducted.
    expect(row(income, "2024-06-28", ID.FE)).toEqual([
      "2024-06-28",
      ID.FE,
      "custody",
      "12.5 USD",
      "-10.00",
      "6 23",
    ]);
    expect(income).toContain("Saldo 90.00");
    const offset = section(text, 4);
    expect(row(offset, "1 ")[4]).toBe("15.00");
    expect(row(offset, "2 ")[4]).toBe("7.50");
    const carried = section(text, 5);
    expect(row(carried, "2022")[2]).toBe("-94.75");
    expect(carried).toContain(
      "CADUCA al cierre de 2024: -202.41 de 2020 (ganancias y pérdidas patrimoniales).",
    );
    expect(text).toContain("BASE IMPONIBLE DEL AHORRO 2024: 67.50 EUR (base, no cuota)");
    expect(section(text, 6)).toContain("Total 19.00");
    expect(row(section(text, 8), "22 ")[3]).toBe("exposición 7.50");
  });
});
