// The boxes as **data per tax year** (feature 010, block 2; decision (e) of the
// prompt).
//
// The rule the whole layer exists for: a wrong box is worse than no box. The
// Agencia Tributaria renumbers the Modelo 100 every campaign —2025 is the year
// the ETFs got a section of their own— so a number inherited from another year
// is a believable, wrong figure that the user types into a real return. These
// check the three ways the layer refuses to guess: a year with no table, a
// concept with no row in the table of its year, and the box of another year.

import { describe, expect, it } from "vitest";
import { taxBoxes } from "../../src/tax/boxes/boxes.js";
import {
  BOX_BLOCKS,
  blockOfConcept,
  type ConceptId,
  conceptName,
  SECTIONS,
  transmissionSection,
} from "../../src/tax/boxes/concepts.js";
import type { BoxEntry, TaxBoxes } from "../../src/tax/boxes/report.js";
import { buy, HAND_SETTINGS, sell, taxBuilder, text } from "./helpers.js";

const TODAY = "2035-01-01";

const entry = (boxes: TaxBoxes, concept: string): BoxEntry =>
  boxes.entries.find((item) => item.concept === concept) as BoxEntry;

/** The total of a concept, which is the entry that does not belong to one operation. */
const total = (boxes: TaxBoxes, concept: string): BoxEntry =>
  boxes.entries.find((item) => item.concept === concept && item.row === undefined) as BoxEntry;

const codes = (boxes: TaxBoxes): string[] => boxes.notes.map((note) => note.code);

/** A gain in every section the form separates, in the year given. */
const oneOfEach = (year: number) => {
  const b = taxBuilder(HAND_SETTINGS);
  const trade = (asset: string, bought: string, sold: string) => {
    buy(b, asset, `${year - 1}-02-10`, "10", bought);
    return sell(b, asset, `${year}-09-01`, "10", sold);
  };
  trade("fund_f", "10", "12");
  trade("stock_s", "10", "12");
  trade("coin_c", "10", "12");
  return b.build();
};

describe("a year whose boxes nobody checked", () => {
  it("gives every figure by concept, with no number and no source, and says so", () => {
    const boxes = taxBoxes(oneOfEach(2026), 2026, { today: TODAY });
    expect(boxes.mapping).toBe("none");
    expect(boxes.source).toBeUndefined();
    expect(boxes.entries.length).toBeGreaterThan(10);
    expect(boxes.entries.some((item) => item.box !== undefined)).toBe(false);
    expect(boxes.entries.some((item) => item.label !== undefined)).toBe(false);
    expect(boxes.entries.some((item) => item.certainty !== undefined)).toBe(false);
    expect(codes(boxes)).toContain("tax_boxes_missing_year");
    // The figures are the ones of the report: only the numbering is missing.
    expect(text(entry(boxes, "base.savings").amount_eur)).toBe("60");
  });

  it("never falls back on the boxes of the year that does have a table", () => {
    // 2025 has a table. Neither the year before nor the year after may borrow
    // a single number from it: this is the mutant "land on another year's box".
    for (const year of [2024, 2026]) {
      const boxes = taxBoxes(oneOfEach(year), year, { today: TODAY });
      expect(boxes.mapping).toBe("none");
      expect(boxes.entries.filter((item) => item.box !== undefined)).toEqual([]);
    }
    const checked = taxBoxes(oneOfEach(2025), 2025, { today: TODAY });
    expect(checked.mapping).toBe("checked");
    expect(entry(checked, "base.savings").box).toBe("0460");
  });
});

describe("a concept with no box in the year that does have a table", () => {
  it("gives the figure without a number and names the concept", () => {
    // Annex C.3 has no "pending in future years" column for 2021: a balance of
    // 2021 not offset in the return of 2025 expires. So the column exists as a
    // concept and has no box, and the layout says which.
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2024-02-10", "10", "10");
    sell(b, "stock_s", "2025-09-01", "10", "16");
    b.filed({
      tax_year: 2024,
      filed_at: "2025-06-20",
      declared: {
        savings_base_eur: "0",
        pending_losses: [{ origin_year: 2021, category: "capital_gain", amount_eur: "-100" }],
        deferred_losses_eur: "0",
      },
    });
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    expect(entry(boxes, "annex.capital_gain.start").box).toBe("1259");
    expect(entry(boxes, "annex.capital_gain.applied").box).toBe("1260");
    const left = entry(boxes, "annex.capital_gain.left");
    expect(left.origin_year).toBe(2021);
    expect(left.box).toBeUndefined();
    expect(text(left.amount_eur)).toBe("40");
    expect(codes(boxes)).toContain("tax_box_missing");
    const missing = boxes.notes.filter((note) => note.code === "tax_box_missing")[0] as {
      details: Record<string, unknown>;
    };
    expect(missing.details.concepts).toContain("annex.capital_gain.left:2021");
  });

  it("leaves an ETC declared a capital gain with no box, because no text says where it goes", () => {
    const b = taxBuilder({
      ...HAND_SETTINGS,
      income_category: { ...HAND_SETTINGS.income_category, etc: "capital_gain" },
    });
    buy(b, "etc_e", "2024-02-10", "10", "100");
    sell(b, "etc_e", "2025-09-01", "10", "120");
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    expect(transmissionSection("etc", "capital_gain")).toBe("other");
    const gain = entry(boxes, "gp.other.gain");
    expect(text(gain.amount_eur)).toBe("200");
    expect(gain.box).toBeUndefined();
    // And it never reaches box 0031, which is where it goes when the settings
    // put it in movable capital income: that box is there, as the whole block
    // of page 5 always is, and it holds nothing.
    expect(boxes.entries.some((item) => item.box === "0031" && item.row !== undefined)).toBe(false);
    expect(text(total(boxes, "rcm.transmission").amount_eur)).toBe("0");
    expect(codes(boxes)).toContain("tax_box_missing");
  });
});

describe("what the layout says it cannot fill in", () => {
  const b = taxBuilder(HAND_SETTINGS);
  buy(b, "fund_f", "2024-02-10", "10", "10");
  sell(b, "fund_f", "2025-09-01", "10", "12");
  buy(b, "fund_g", "2025-10-01", "10", "10");
  const boxes = taxBoxes(b.build(), 2025, { today: TODAY });

  it("says the ledger does not hold the NIF of the fund, and does not invent one", () => {
    const nif = entry(boxes, "gp.iic.nif");
    expect(nif.box).toBe("0311");
    expect(nif.missing).toBe(true);
    expect(nif.amount_eur).toBeUndefined();
    expect(codes(boxes)).toContain("tax_box_value_missing");
  });

  it("names the boxes it computes only in part, with the reason", () => {
    expect(entry(boxes, "base.savings_taxable").partial).toBe("reductions_unknown");
    expect(entry(boxes, "base.savings_taxable").amount_eur).toBeUndefined();
    const partial = boxes.notes.filter((note) => note.code === "tax_box_partial");
    expect(partial.map((note) => (note.details as { reason: string }).reason)).toContain(
      "reductions_unknown",
    );
  });
});

describe("the rounding of a row (ficha F2)", () => {
  it("shows what the form will subtract when it differs a cent from the engine", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2024-02-10", "1", "50.004");
    sell(b, "stock_s", "2025-09-01", "1", "100.005");
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    // The form rounds each value once and subtracts: 100,01 − 50,00 = 50,01.
    // The engine rounds the result once: 50,001 → 50,00.
    expect(text(entry(boxes, "gp.listed_shares.transmission").amount_eur)).toBe("100.01");
    expect(text(entry(boxes, "gp.listed_shares.acquisition").amount_eur)).toBe("50");
    expect(text(entry(boxes, "gp.listed_shares.gain").amount_eur)).toBe("50");
    expect(text(entry(boxes, "gp.listed_shares.gain").form_eur)).toBe("50.01");
    expect(codes(boxes)).toContain("tax_box_rounding_differs");
  });
});

describe("the layout as a whole", () => {
  it("says where every box was read and when it was checked", () => {
    const boxes = taxBoxes(oneOfEach(2025), 2025, { today: TODAY });
    expect(boxes.source?.document).toContain("Orden HAC/277/2026");
    expect(boxes.source?.checked_at).toBe("2026-09-23");
    expect(boxes.scope).toBe("fiscal_total");
    for (const item of boxes.entries.filter((candidate) => candidate.box !== undefined)) {
      expect(item.source?.url).toMatch(/^https:\/\/www\.boe\.es\/datos\/imagenes\//);
      expect(item.certainty).toBe("high");
      expect(item.label?.length).toBeGreaterThan(10);
    }
  });

  it("routes every kind of disposal to the section the criterion of 2025 gives it", () => {
    expect(SECTIONS).toContain("etf");
    expect(transmissionSection("fund", "capital_gain")).toBe("iic");
    expect(transmissionSection("money_market", "capital_gain")).toBe("iic");
    expect(transmissionSection("etf", "capital_gain")).toBe("etf");
    expect(transmissionSection("stock", "capital_gain")).toBe("listed_shares");
    expect(transmissionSection("crypto", "capital_gain")).toBe("crypto");
    expect(transmissionSection("etc", "movable_capital")).toBe("movable_capital");
    expect(transmissionSection("etp", "movable_capital")).toBe("movable_capital");
  });

  it("says that the repurchase is a mark and not a numbered box", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2025-01-10", "10", "100");
    sell(b, "stock_s", "2025-03-02", "10", "90");
    buy(b, "stock_s", "2025-04-01", "10", "90");
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    expect(codes(boxes)).toContain("tax_box_repurchase_has_no_number");
  });
});

describe("the two ways the savings base can cross categories", () => {
  it("takes a released loss of movable capital income to box 0031, in the row that frees it", () => {
    // A deferred loss of an ETC travels into a fund through a restructuring,
    // and the sale of the fund releases it. The engine integrates it where the
    // loss came from —movable capital income— and so does the form: box 0031,
    // in the year it is freed and in the row of the security that frees it
    // (ficha F5, added after Q2; there is no "earlier years" section there).
    const b = taxBuilder({
      ...HAND_SETTINGS,
      income_category: { ...HAND_SETTINGS.income_category, etc: "movable_capital" },
    });
    buy(b, "etc_e", "2024-01-11", "10", "100");
    sell(b, "etc_e", "2024-02-01", "10", "90");
    buy(b, "etc_e", "2024-02-10", "10", "90");
    b.corporateAction({
      kind: "issuer_restructuring",
      asset_id: "etc_e",
      effective_date: "2024-03-01",
      effects: [{ op: "convert", to_asset_id: "fund_f", ratio: "1" }],
    });
    // A year later, so that the deferral is open at 31/12/2024 and the layout
    // of 2025 has to decide what to do with a loss of the **other** category
    // left over from an earlier year: nothing, because it has no section of
    // earlier years and is already inside the figure that frees it.
    const sale = sell(b, "fund_f", "2025-06-01", "10", "95");
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    const freed = boxes.entries.filter(
      (item) => item.box === "0031" && item.row?.event_id === sale.id,
    );
    expect(freed.map((item) => text(item.exact_eur))).toEqual(["-100"]);
    expect(text(total(boxes, "rcm.transmission").amount_eur)).toBe("-100");
    // And the sale itself is a gain of 50,00 in the section of the funds, with
    // nothing at all in the section of earlier years.
    expect(text(entry(boxes, "gp.iic.gain").amount_eur)).toBe("50");
    expect(boxes.entries.filter((item) => item.concept === "gp.prior_years.loss")).toEqual([]);
  });

  it("offsets a negative balance of capital gains against the income of the year, in 0446", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2024-01-05", "10", "100");
    sell(b, "stock_s", "2025-03-03", "10", "90");
    b.interest({ account_id: "acc_a", value_date: "2025-06-02", gross: "1000" });
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    // The balance of capital gains is negative, so it goes in 0425 and not 0424.
    expect(entry(boxes, "gp.balance").box).toBe("0425");
    expect(text(entry(boxes, "gp.balance").amount_eur)).toBe("100");
    // And it offsets the income of the year up to 25 % of it, which is plenty.
    expect(entry(boxes, "offset.gp_against_rcm").box).toBe("0446");
    expect(text(entry(boxes, "offset.gp_against_rcm").amount_eur)).toBe("100");
    expect(text(entry(boxes, "base.savings").amount_eur)).toBe("900");
  });
});

describe("the same crossing, the other way round", () => {
  it("keeps a released loss of capital gains in the section of earlier years", () => {
    // The mirror of the case above: the deferred loss is a capital gain, it
    // travels into an ETC and the sale of the ETC —movable capital income—
    // frees it. It is integrated where it came from, so the form declares it
    // in the section of earlier years and **not** in box 0031.
    const b = taxBuilder({
      ...HAND_SETTINGS,
      income_category: { ...HAND_SETTINGS.income_category, etc: "movable_capital" },
    });
    buy(b, "fund_f", "2024-01-11", "10", "100");
    sell(b, "fund_f", "2024-02-01", "10", "90");
    buy(b, "fund_f", "2024-02-10", "10", "90");
    b.corporateAction({
      kind: "issuer_restructuring",
      asset_id: "fund_f",
      effective_date: "2024-03-01",
      effects: [{ op: "convert", to_asset_id: "etc_e", ratio: "1" }],
    });
    const sale = sell(b, "etc_e", "2025-06-01", "10", "95");
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    // Box 0031 holds only what the ETC itself made: +50,00.
    expect(
      boxes.entries
        .filter((item) => item.box === "0031" && item.row?.event_id === sale.id)
        .map((item) => text(item.exact_eur)),
    ).toEqual(["50"]);
    expect(text(total(boxes, "rcm.transmission").amount_eur)).toBe("50");
    // And the −100,00 freed goes where the loss was born.
    expect(text(entry(boxes, "gp.prior_years.loss").amount_eur)).toBe("100");
    expect(entry(boxes, "gp.prior_years.loss").box).toBe("0395");
    expect(entry(boxes, "gp.balance").box).toBe("0425");
  });

  it("offsets a pending loss of an earlier year against the other category, in its own box", () => {
    const b = taxBuilder(HAND_SETTINGS);
    b.interest({ account_id: "acc_a", value_date: "2025-06-02", gross: "1000" });
    b.filed({
      tax_year: 2024,
      filed_at: "2025-06-20",
      declared: {
        savings_base_eur: "0",
        pending_losses: [{ origin_year: 2023, category: "capital_gain", amount_eur: "-100" }],
        deferred_losses_eur: "0",
      },
    });
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    // There is no positive balance of its own category to take it, so it
    // crosses, with the joint limit of 25 % of 1.000,00, which is plenty.
    const crossed = entry(boxes, "pending.capital_gain.against_other");
    expect(crossed.box).toBe("0455");
    expect(crossed.origin_year).toBe(2023);
    expect(text(crossed.amount_eur)).toBe("100");
    expect(text(entry(boxes, "base.savings").amount_eur)).toBe("900");
  });
});

/**
 * The blocks of the form are **structure**, not presentation: the console and
 * the web group the figures the same way because they ask the same function.
 * Both halves are checked — every concept lands in a block, and every block is
 * reachable — so a concept added tomorrow cannot quietly fall out of both
 * screens at once.
 */
describe("the blocks the form is read in", () => {
  it("places every concept of the layout, and reaches every block", () => {
    const concepts: ConceptId[] = [
      "rcm.interest",
      "rcm.balance",
      "gp.iic.gains",
      "gp.etf.transmission",
      "gp.listed_shares.losses",
      "gp.crypto.gain_imputable",
      "gp.other.loss",
      "gp.prior_years.loss",
      "gp.gains_total",
      "gp.losses_total",
      "gp.balance",
      "offset.rcm_against_gp",
      "pending.capital_gain.against_other",
      "annex.movable_capital.left",
      "base.savings",
      "ddi.deduction",
      "withholding.rcm",
    ];
    const blocks = concepts.map(blockOfConcept);
    expect(blocks).toEqual([
      "rcm",
      "rcm",
      "iic",
      "etf",
      "listed_shares",
      "crypto",
      "other",
      "prior_years",
      "offsetting",
      "offsetting",
      "offsetting",
      "offsetting",
      "offsetting",
      "annex",
      "base",
      "deductions",
      "deductions",
    ]);
    expect(new Set(blocks).size).toBe(BOX_BLOCKS.length);
  });

  it("leaves no figure of a real return without a block", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "fund_f", "2024-02-10", "10", "100");
    sell(b, "fund_f", "2025-09-01", "10", "120");
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    expect(boxes.entries.length).toBeGreaterThan(5);
    for (const item of boxes.entries) {
      expect(BOX_BLOCKS).toContain(blockOfConcept(item.concept));
    }
  });
});

/**
 * A row of the layout says **which operation** a field belongs to, and both
 * interfaces print it as "activo · fecha". The deduction for double taxation
 * used to hand over `{ event_id } as BoxRow`: it compiled, the other three
 * fields were undefined at run time, and the screens printed "undefined
 * undefined" beside the deduction of a foreign dividend.
 *
 * So the invariant is checked over a return that has one of everything, and it
 * is checked on the **whole row**, not on the concept that failed: the cast
 * that broke it can be written again anywhere.
 */
describe("the operation a row names", () => {
  it("is complete wherever there is one, deduction for double taxation included", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "stock_s", "2024-02-10", "10", "100");
    sell(b, "stock_s", "2025-09-01", "10", "120");
    b.dividend({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2025-03-10",
      gross: "100",
      withholding_origin: "15",
      source_country: "US",
    });
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    // The deduction is there: otherwise this would pass by checking nothing.
    expect(boxes.entries.some((item) => item.concept === "ddi.income")).toBe(true);
    for (const item of boxes.entries) {
      if (item.row === undefined) {
        continue;
      }
      expect(Object.keys(item.row).sort()).toEqual([
        "account_id",
        "asset_id",
        "event_id",
        "fiscal_date",
      ]);
      expect(item.row.fiscal_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("only gives a deduction to the dividend that was taxed abroad", () => {
    // Two dividends, one taxed at source and one not: the deduction is about
    // the first and names it, and the second produces no line at all.
    const b = taxBuilder(HAND_SETTINGS);
    b.dividend({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2025-03-10",
      gross: "100",
      withholding_origin: "15",
      source_country: "US",
    });
    b.dividend({
      account_id: "acc_a",
      asset_id: "fund_f",
      value_date: "2025-05-10",
      gross: "40",
      withholding_origin: "0",
    });
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    const ddi = boxes.entries.filter((item) => item.concept.startsWith("ddi."));
    expect(ddi.length).toBeGreaterThan(0);
    const named = ddi.filter((item) => item.row !== undefined);
    expect(named.map((item) => item.row?.asset_id)).toEqual(["stock_s", "stock_s"]);
    expect(named.every((item) => item.row?.fiscal_date === "2025-03-10")).toBe(true);
  });
});

/**
 * Box 0327 of 2025, "Denominación de los valores transmitidos (entidad
 * emisora)", and its siblings 2226 and 1802.
 *
 * This is the **only** field of the layout whose value is copied word for word
 * into Renta WEB, so what it holds is not a matter of taste. It held
 * `line.asset_id` for two whole blocks and both interfaces painted
 * `ast_epsilon` where the issuer goes; no test saw it because the test builder
 * gives every asset `name: asset_id`, which makes the identifier and the name
 * the same string. So each case here **names the asset something else**.
 */
describe("the denomination of the securities transmitted", () => {
  const named = (id: string, name: string, year: number) => {
    const b = taxBuilder(HAND_SETTINGS);
    b.asset(id, { asset_type: "stock", transferable: false, name });
    buy(b, id, `${year - 1}-02-10`, "10", "10");
    sell(b, id, `${year}-09-01`, "10", "12");
    return taxBoxes(b.build(), year, { today: TODAY });
  };

  it("is what the catalogue calls the security, never the identifier of the ledger", () => {
    const boxes = named("stock_acme", "Acme Corporation, S.A.", 2025);
    const name = entry(boxes, "gp.listed_shares.name");
    expect(name.text).toBe("Acme Corporation, S.A.");
    expect(name.box).toBe("0327");
    // The identifier appears nowhere in what the user copies into the form.
    expect(boxes.entries.some((item) => item.text === "stock_acme")).toBe(false);
  });

  it("says the same by concept in a year with no checked table", () => {
    const boxes = named("stock_acme", "Acme Corporation, S.A.", 2026);
    const name = entry(boxes, "gp.listed_shares.name");
    expect(name.text).toBe("Acme Corporation, S.A.");
    expect(name.box).toBeUndefined();
  });

  it("falls back to the identifier when the catalogue holds no name for it", () => {
    // Worse than a name, much better than a blank the user does not notice.
    const boxes = named("stock_anon", "", 2025);
    expect(entry(boxes, "gp.listed_shares.name").text).toBe("stock_anon");
  });
});

/**
 * What each figure **is**, in Spanish.
 *
 * It matters more than the literal label of the form: 2025 is the only year
 * with a checked box table and the user's first real return is 2026, so in the
 * normal case there is no label at all and this is the only thing that tells
 * the reader which number is the transmission value and which the acquisition
 * one. Both interfaces read it from here for the same reason they read the
 * blocks from here.
 */
describe("what every figure is called", () => {
  it("names a field of a disposal by the field, not by its section", () => {
    // The section is already said by the block the row is in, and saying it
    // again in every row is what made the card unreadable.
    expect(conceptName("gp.listed_shares.transmission")).toBe("Importe de las transmisiones");
    expect(conceptName("gp.iic.transmission")).toBe("Importe de las transmisiones");
    expect(conceptName("gp.crypto.acquisition")).toBe("Valor de adquisición");
    expect(conceptName("gp.etf.loss_imputable")).toBe("Pérdida patrimonial computable");
  });

  it("names the two totals a section prints under its rows", () => {
    expect(conceptName("gp.iic.gains")).toBe("Suma de ganancias patrimoniales");
    expect(conceptName("gp.other.losses")).toBe("Suma de pérdidas patrimoniales");
  });

  it("names the concepts that do not belong to one disposal", () => {
    expect(conceptName("rcm.interest")).toBe("Intereses");
    expect(conceptName("base.savings")).toBe("Base imponible del ahorro");
    // `prior_years` is not a section, although `loss` is a field of a row:
    // the name is read off the concept itself, not off the field.
    expect(conceptName("gp.prior_years.loss")).toBe(
      "Pérdida de un ejercicio anterior imputable a este",
    );
  });

  it("leaves no figure of a real return without a name", () => {
    const b = taxBuilder(HAND_SETTINGS);
    buy(b, "fund_f", "2024-02-10", "10", "100");
    sell(b, "fund_f", "2025-09-01", "10", "80");
    buy(b, "stock_s", "2024-02-10", "10", "100");
    sell(b, "stock_s", "2025-09-01", "10", "120");
    b.dividend({
      account_id: "acc_a",
      asset_id: "stock_s",
      value_date: "2025-03-10",
      gross: "100",
      withholding_origin: "15",
      source_country: "US",
    });
    const boxes = taxBoxes(b.build(), 2025, { today: TODAY });
    expect(boxes.entries.length).toBeGreaterThan(20);
    for (const item of boxes.entries) {
      expect(conceptName(item.concept)).toMatch(/\S/);
    }
  });
});
