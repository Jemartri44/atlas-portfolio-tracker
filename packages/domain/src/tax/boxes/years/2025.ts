// The boxes of the Modelo 100 of the **2025 tax year** (2026 campaign).
//
// **Source**: Orden HAC/277/2026, de 25 de marzo (BOE núm. 76, de 27/03/2026,
// `BOE-A-2026-7041`), anexo I. The annex is published as images, one per page:
// `https://www.boe.es/datos/imagenes/disp/2026/76/7041_16815484_<n>.png`.
//
// Every label below is transcribed **word for word from that image**, the
// parentheses and the cross-references to other boxes included, and every
// number was read off the same image on 2026-09-23. That is what
// `checked_at` says, and it is the only thing that makes a number here worth
// more than a guess: the abbreviated version of a label is how box 0031 loses
// the clause that tells you when the figure belongs in 0034 instead.
//
// The certainty of every entry is `high` for the same reason: seen in the
// official form of this very year. Anything that was not seen there is simply
// not in this table, and the layout says so rather than filling it in:
//
//   - the repurchase has **no numbered box**: Renta WEB carries a mark in its
//     capture window, not a box (nota N12);
//   - the fields of the double-taxation capture window have no number (N9), so
//     only the total 0588 is here, and the engine says it computes just the
//     first limit of it (#16);
//   - "otros elementos patrimoniales" (1624 and following) is not mapped: the
//     only thing that would land there is an ETC or an ETP the user configured
//     as a capital gain, and no official text says it goes there (ficha F1);
//   - the annex C.3 has **no "pending in future years" box for 2021**: a
//     balance of 2021 that is not offset in this return expires;
//   - boxes 0392 and 0393, the **gains** of earlier years imputable to this
//     one, are not here either: they belong to instalment sales, which the
//     ledger does not model, and what a repurchase brings back from an earlier
//     year is always a loss.

import type { ConceptId } from "../concepts.js";
import type { YearBoxes, YearBoxMapping } from "./index.js";

const BOE_IMAGE = "https://www.boe.es/datos/imagenes/disp/2026/76/7041_16815484_{image}.png";

/** A box of a numbered page of the form. */
const page = (box: string, label: string, image: number): YearBoxMapping => ({
  box,
  label,
  page: String(image),
  image,
  certainty: "high",
});

/** A box of annex C.3, whose image is the 49th of the annex. */
const annex = (box: string, label: string): YearBoxMapping => ({
  box,
  label,
  page: "Anexo C.3",
  image: 49,
  certainty: "high",
});

/**
 * The runs of boxes the form repeats for each origin year, 2021 to 2024.
 *
 * The label is the one on the image with **its** year written in, and where the
 * form cross-references the paired box it is written in too: that reference is
 * different in every row of the run, and dropping it would turn four different
 * labels into one.
 */
const byYear = (
  boxes: Record<number, string>,
  label: (year: number, box: string) => string,
  image: number,
  pair: Record<number, string> = {},
): Record<number, YearBoxMapping> =>
  Object.fromEntries(
    Object.entries(boxes).map(([year, box]) => [
      Number(year),
      page(box, label(Number(year), pair[Number(year)] ?? ""), image),
    ]),
  );

const conceptTable = (): Partial<Record<ConceptId, YearBoxMapping>> => ({
  // --- Movable capital income, page 5 ---------------------------------------
  "rcm.interest": page(
    "0027",
    "Intereses de cuentas, depósitos y activos financieros en general (*)",
    5,
  ),
  "rcm.dividends": page(
    "0029",
    "Dividendos y demás rendimientos por la participación en fondos propios de entidades",
    5,
  ),
  "rcm.transmission": page(
    "0031",
    "Rendimientos procedentes de la transmisión, amortización o reembolso de otros activos financieros (*) (Salvo que deban consignarse en la casilla [0034])",
    5,
  ),
  "rcm.gross_total": page(
    "0036",
    "Total ingresos íntegros ([0027] + [0028] + [0029] + [0030] + [0031] + [0032] + [0033] + [0034] + [0035])",
    5,
  ),
  "rcm.expenses": page(
    "0037",
    "Gastos fiscalmente deducibles: gastos de administración y depósito de valores negociables, exclusivamente",
    5,
  ),
  "rcm.net": page("0038", "Rendimiento neto ([0036] – [0037])", 5),
  "rcm.net_reduced": page("0040", "Rendimiento neto reducido ([0038] – [0039])", 5),
  "rcm.integrated": page(
    "0041",
    "Suma de rendimientos reducidos del capital mobiliario a integrar en la base imponible del ahorro (suma de las casillas [0040])",
    5,
  ),
  "rcm.balance": {
    ...page(
      "0429",
      "Saldo neto positivo del rendimiento de capital mobiliario imputable a 2025 a integrar en la base imponible del ahorro ([0041] + [1602] + [1603])",
      18,
    ),
    when_negative: {
      box: "0430",
      label:
        "Saldo neto negativo del rendimiento de capital mobiliario imputable a 2025 a integrar en la base imponible del ahorro ([0041] + [1602] + [1603])",
    },
  },

  // --- Collective investment undertakings, page 14 --------------------------
  "gp.iic.nif": page("0311", "NIF de la sociedad o fondo de Inversión", 14),
  "gp.iic.transmission": page("0312", "Importe global de las transmisiones efectuadas en 2025", 14),
  "gp.iic.acquisition": page("0315", "Importe global de las adquisiciones", 14),
  "gp.iic.gain": page("0316", "Resultados: Ganancias patrimoniales", 14),
  "gp.iic.gain_net": page(
    "0320",
    "Resultados: Ganancias patrimoniales reducidas no exentas ([0316] – [0317] – [0319])",
    14,
  ),
  "gp.iic.loss": page("0321", "Resultados: Pérdidas patrimoniales", 14),
  "gp.iic.loss_imputable": page("0322", "Resultados: Pérdidas patrimoniales imputables a 2025", 14),
  "gp.iic.gains": page(
    "0324",
    "Suma de ganancias patrimoniales derivadas de transmisiones o reembolsos de acciones o participaciones de instituciones de inversión colectiva o SOCIMI (suma de las casillas [0320])",
    14,
  ),
  "gp.iic.losses": page(
    "0325",
    "Suma de pérdidas patrimoniales derivadas de transmisiones o reembolsos de acciones o participaciones de instituciones de inversión colectiva o SOCIMI (suma de las casillas [0322])",
    14,
  ),

  // --- Listed collective investment undertakings (ETF), page 14, new in 2025 ---
  "gp.etf.nif": page("2225", "NIF de la sociedad o fondo de Inversión", 14),
  "gp.etf.name": page("2226", "Denominación de los valores transmitidos", 14),
  "gp.etf.transmission": page("2227", "Importe global de las transmisiones efectuadas en 2025", 14),
  "gp.etf.acquisition": page("2229", "Importe global de las adquisiciones", 14),
  "gp.etf.gain": page("2230", "Resultados: Ganancias patrimoniales", 14),
  "gp.etf.gain_net": page(
    "2232",
    "Resultados: Ganancias patrimoniales no exentas ([2230] – [2231])",
    14,
  ),
  "gp.etf.loss": page("2233", "Resultados: Pérdidas patrimoniales", 14),
  "gp.etf.loss_imputable": page("2234", "Resultados: Pérdidas patrimoniales imputables a 2025", 14),
  "gp.etf.gains": page(
    "2235",
    "Suma de ganancias patrimoniales derivadas de transmisiones o reembolsos de acciones o participaciones emitidas por instituciones de inversión colectiva, a que se refiere el artículo 75.3.j) del Reglamento del Impuesto (suma de las casillas [2232])",
    14,
  ),
  "gp.etf.losses": page(
    "2236",
    "Suma de pérdidas patrimoniales derivadas de transmisiones o reembolsos de acciones o participaciones emitidas por instituciones de inversión colectiva, a que se refiere el artículo 75.3.j) del Reglamento del Impuesto (suma de las casillas [2234])",
    14,
  ),

  // --- Listed shares, page 14 -----------------------------------------------
  "gp.listed_shares.name": page(
    "0327",
    "Denominación de los valores transmitidos (entidad emisora)",
    14,
  ),
  "gp.listed_shares.transmission": page(
    "0328",
    "Importe global de las transmisiones efectuadas en 2025",
    14,
  ),
  "gp.listed_shares.acquisition": page(
    "0331",
    "Valor de adquisición global de los valores transmitidos",
    14,
  ),
  "gp.listed_shares.gain": page("0332", "Resultados: Ganancias patrimoniales", 14),
  "gp.listed_shares.gain_net": page(
    "0336",
    "Resultados: Ganancias patrimoniales reducidas no exentas ([0332] – [0333] – [0335])",
    14,
  ),
  "gp.listed_shares.loss": page("0337", "Resultados: Pérdidas patrimoniales. Importe obtenido", 14),
  "gp.listed_shares.loss_imputable": page(
    "0338",
    "Resultados: Pérdidas patrimoniales. Importe computable",
    14,
  ),
  "gp.listed_shares.gains": page(
    "0339",
    "Suma de ganancias patrimoniales derivadas de transmisiones de acciones negociadas (suma de las casillas [0336])",
    14,
  ),
  "gp.listed_shares.losses": page(
    "0340",
    "Suma de pérdidas patrimoniales derivadas de transmisiones de acciones negociadas (suma de las casillas [0338])",
    14,
  ),

  // --- Virtual currencies, page 15 ------------------------------------------
  "gp.crypto.name": page(
    "1802",
    "Denominación de la moneda virtual que se transmite (bitcoins, ethereum, tether, binance coin, USD coin, XRP, cardano, solana, terra, avalanche, etc)",
    15,
  ),
  "gp.crypto.transmission": page("1804", "Valor de transmisión", 15),
  "gp.crypto.acquisition": page("1806", "Valor de adquisición", 15),
  "gp.crypto.loss": page(
    "1807",
    "Pérdida patrimonial obtenida: diferencia ([1804] – [1806]) negativa",
    15,
  ),
  "gp.crypto.loss_imputable": page("1808", "Pérdida patrimonial imputable a 2025", 15),
  "gp.crypto.gain": page(
    "1809",
    "Ganancia patrimonial obtenida: diferencia ([1804] – [1806]) positiva",
    15,
  ),
  "gp.crypto.gain_net": page("1811", "Ganancia no exenta ([1804] – [1806] – [1810])", 15),
  "gp.crypto.gain_imputable": page("1812", "Ganancia no exenta imputable a 2025", 15),
  "gp.crypto.losses": page(
    "1813",
    "Suma de pérdidas patrimoniales derivadas de transmisiones de monedas virtuales (suma de las casillas [1808])",
    15,
  ),
  "gp.crypto.gains": page(
    "1814",
    "Suma de ganancias patrimoniales derivadas de transmisiones de monedas virtuales (suma de las casillas [1812])",
    15,
  ),

  // --- Earlier years that become imputable this one, page 17 -----------------
  "gp.prior_years.loss": page(
    "0395",
    "Imputación de pérdidas patrimoniales: Importe de la pérdida patrimonial que procede imputar a 2025",
    17,
  ),
  "gp.prior_years.losses": page(
    "0396",
    "Suma de las pérdidas patrimoniales derivadas de transmisiones efectuadas en ejercicios anteriores imputables a 2025 (suma de las casillas [0395])",
    17,
  ),

  // --- Integration and offsetting, pages 18 and 19 ---------------------------
  "gp.gains_total": page(
    "0422",
    "Suma de ganancias patrimoniales ([1608] + [0324] + [2235] + [0339] + [0354] + [1814] + [1845] + [1846] + [0386] + [0387] + [0390] + [0393] + [0412])",
    18,
  ),
  "gp.losses_total": page(
    "0423",
    "Suma de pérdidas patrimoniales ([1609] + [0325] + [2236] + [0340] + [0355] + [1813] + [1844] + [0385] + [0396])",
    18,
  ),
  "gp.balance": {
    ...page(
      "0424",
      "Saldo neto de las ganancias y pérdidas patrimoniales imputables a 2025 a integrar en la base imponible del ahorro: si la diferencia ([0422] – [0423]) es positiva",
      18,
    ),
    when_negative: {
      box: "0425",
      label:
        "Saldo neto de las ganancias y pérdidas patrimoniales imputables a 2025 a integrar en la base imponible del ahorro: si la diferencia ([0422] – [0423]) es negativa",
    },
  },
  "offset.rcm_against_gp": page(
    "0436",
    "Saldos netos negativos de rendimientos de capital mobiliario imputables a 2025, a integrar en la base del ahorro, con el límite del 25 por 100 de [0424] (*) (importe de la casilla [0430] si procede)",
    19,
  ),
  "offset.gp_against_rcm": page(
    "0446",
    "Saldos netos negativos de ganancias y pérdidas patrimoniales imputables a 2025, a integrar en la base imponible del ahorro, con el límite del 25 por 100 de [0429] (*) (importe de la casilla [0425] si procede)",
    19,
  ),
  "base.savings": page(
    "0460",
    "Base imponible del ahorro ([0424] – [0436] – [0439] – [0440] – [0441] – [0442] – [0443] – [0444] – [0445] – [0447] + [0429] – [0446] – [0449] – [0450] – [0451] – [0452] – [0453] – [0454] – [0455] – [0448])",
    19,
  ),
  "base.savings_taxable": page("0510", "Base liquidable del ahorro ([0460] – [0506] – [0507])", 21),

  // --- Annex C.3: the balance of each origin year that is still open ---------
  "annex.capital_gain.new": annex(
    "1270",
    "Saldo negativo de las ganancias y pérdidas imputables a 2025, a integrar en la base imponible del ahorro, pendientes de compensación en los 4 ejercicios siguientes (casillas [0425] – [0446])",
  ),
  "annex.movable_capital.new": annex(
    "1283",
    "Saldo negativo de los rendimientos de capital mobiliario imputables a 2025, a integrar en la base imponible del ahorro, pendientes de compensación en los 4 ejercicios siguientes (casillas [0430] – [0436])",
  ),

  // --- Deduction and payments on account, page 23 ----------------------------
  "ddi.deduction": page(
    "0588",
    "Por doble imposición internacional, por razón de las rentas obtenidas y gravadas en el extranjero",
    23,
  ),
  "withholding.rcm": page("0597", "Por rendimientos del capital mobiliario", 23),
  "withholding.capital_gain": page("0603", "Por ganancias patrimoniales, incluidos premios", 23),
});

const originYearTable = (): Partial<Record<ConceptId, Record<number, YearBoxMapping>>> => ({
  "pending.capital_gain.against_same": byYear(
    { 2021: "0439", 2022: "0440", 2023: "0441", 2024: "0442" },
    (year) =>
      `Saldos netos negativos de ganancias y pérdidas patrimoniales de ${year}, pendientes de compensación a 1 de enero de 2025, a integrar en la base imponible del ahorro (Cumplimente el anexo C.3)`,
    19,
  ),
  "pending.movable_capital.against_other": byYear(
    { 2021: "0443", 2022: "0444", 2023: "0445", 2024: "0447" },
    (year, pair) =>
      `Resto de saldos netos negativos de rendimientos de capital mobiliario de ${year}, pendientes de compensación a 1 de enero de 2025, a integrar en la base imponible del ahorro, con el límite del 25 por 100 de [0424] (*) (saldo pendiente no compensado en la casilla [${pair}]) (Cumplimente el anexo C.3)`,
    19,
    { 2021: "0449", 2022: "0450", 2023: "0451", 2024: "0452" },
  ),
  "pending.movable_capital.against_same": byYear(
    { 2021: "0449", 2022: "0450", 2023: "0451", 2024: "0452" },
    (year) =>
      `Saldos netos negativos de rendimientos del capital mobiliario, de ${year}, pendientes de compensación a 1 de enero de 2025, a integrar en la base imponible del ahorro (Cumplimente el anexo C.3)`,
    19,
  ),
  "pending.capital_gain.against_other": byYear(
    { 2021: "0453", 2022: "0454", 2023: "0455", 2024: "0448" },
    (year, pair) =>
      `Resto de saldos netos negativos de ganancias y pérdidas patrimoniales de ${year}, pendientes de compensación a 1 de enero de 2025, a integrar en la base imponible del ahorro, con el límite del 25 por 100 de [0429] (*) (saldo pendiente no compensado en la casilla [${pair}]) (Cumplimente el anexo C.3)`,
    19,
    { 2021: "0439", 2022: "0440", 2023: "0441", 2024: "0442" },
  ),
  "annex.capital_gain.start": byYear(
    { 2021: "1259", 2022: "1261", 2023: "1264", 2024: "1267" },
    (year) =>
      `Saldo neto negativo de las ganancias y pérdidas patrimoniales a integrar en la base imponible del ahorro. Ejercicio ${year}: Pendiente de aplicación al principio del período`,
    49,
  ),
  "annex.capital_gain.applied": byYear(
    { 2021: "1260", 2022: "1262", 2023: "1265", 2024: "1268" },
    (year) =>
      `Saldo neto negativo de las ganancias y pérdidas patrimoniales a integrar en la base imponible del ahorro. Ejercicio ${year}: Aplicado en esta declaración`,
    49,
  ),
  // 2021 has no "pending in future years" column: its fourth year is this one.
  "annex.capital_gain.left": byYear(
    { 2022: "1263", 2023: "1266", 2024: "1269" },
    (year) =>
      `Saldo neto negativo de las ganancias y pérdidas patrimoniales a integrar en la base imponible del ahorro. Ejercicio ${year}: Pendiente de aplicación en ejercicios futuros`,
    49,
  ),
  "annex.movable_capital.start": byYear(
    { 2021: "1272", 2022: "1274", 2023: "1277", 2024: "1280" },
    (year) =>
      `Saldo neto negativo de los rendimientos de capital mobiliario a integrar en la base imponible del ahorro. Ejercicio ${year}: Pendiente de aplicación al principio del período`,
    49,
  ),
  "annex.movable_capital.applied": byYear(
    { 2021: "1273", 2022: "1275", 2023: "1278", 2024: "1281" },
    (year) =>
      `Saldo neto negativo de los rendimientos de capital mobiliario a integrar en la base imponible del ahorro. Ejercicio ${year}: Aplicado en esta declaración`,
    49,
  ),
  "annex.movable_capital.left": byYear(
    { 2022: "1276", 2023: "1279", 2024: "1282" },
    (year) =>
      `Saldo neto negativo de los rendimientos de capital mobiliario a integrar en la base imponible del ahorro. Ejercicio ${year}: Pendiente de aplicación en ejercicios futuros`,
    49,
  ),
});

/**
 * The two tables are built by a **call**, marked pure, and not written as two
 * module-level object literals. It is not a style choice: a bundler keeps a
 * call at module level by default, so the whole table of 2025 travelled into a
 * boot chunk of the web and the shape check of `check-bundle.mjs` stopped the
 * build. Marked like this it is dropped whole from every bundle that does not
 * ask for a box, which is every screen except the fiscal one.
 */
export const BOXES_2025: YearBoxes = {
  year: 2025,
  document:
    "Orden HAC/277/2026, de 25 de marzo (BOE núm. 76, de 27/03/2026), anexo I: Modelo 100 del ejercicio 2025",
  url_template: BOE_IMAGE,
  checked_at: "2026-09-23",
  concepts: /* @__PURE__ */ conceptTable(),
  by_origin_year: /* @__PURE__ */ originYearTable(),
};
