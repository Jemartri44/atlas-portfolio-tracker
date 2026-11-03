// The fiscal criteria of `docs/fiscal-questions.md`, as data.
//
// Every figure of the tax report says which of these it depends on, and the
// report has a section of its own for the doubtful ones: a figure computed
// under a disputed criterion must never look like one computed under article
// 35, which nobody disputes.
//
// The table below is a copy of the certainty and the direction of risk the
// document declares, and a test (`tests/fiscal-criteria.test.ts`) compares them
// row by row: when the document changes, this has to follow.

/** How sure the reading of the law is (`docs/fiscal-questions.md`, "Grado"). */
export type Certainty = "high" | "medium" | "low" | "disputed";

/**
 * If the criterion is wrong, what happened: paid too much, declared too little,
 * either, or neither (#22: the order of compensation changes no total, only
 * what expires).
 */
export type RiskDirection = "conservative" | "aggressive" | "both" | "neutral";

export interface FiscalCriterion {
  /** The number of the criterion in `docs/fiscal-questions.md`. */
  doc: string;
  certainty: Certainty;
  risk: RiskDirection;
}

/**
 * The criteria the engine applies. Criterion #2 is labelled by the window
 * **actually applied**, not by the type of asset: a stock
 * the user set to one year applies the prudent side of the dispute, and saying
 * "two months, aggressive" of it would state the opposite of what was done.
 *
 * - `2:listed`: two months for a listed security — right in the EU and in the
 *   markets of third countries with an equivalence decision (DGT V0778-25 and
 *   V0951-25: Nasdaq, NYSE), wrong in a market without one, and the system
 *   does not govern the window by the market: **medium**; **aggressive** if
 *   wrong.
 * - `2:listed_1y`: one year for a listed security — the other side, right only
 *   in a market without an equivalence decision; **conservative** if wrong.
 * - `2:crypto`: one year **after** the sale for crypto, article 33.5.e) LIRPF,
 *   which the Renta manual words as "un año posterior a la transmisión" for
 *   other assets; nothing before the sale — **medium** (no consultation on
 *   crypto itself); conservative.
 * - `2:crypto_2m`: two months after the sale for crypto — a configuration, not a
 *   legal reading; aggressive.
 * - `2:fund_admitted_2m`: two months for a fund whose units count as
 *   admitted (`fundAdmitted`): Spanish, which article 4.9 of RD 1082/2012
 *   deems listed (V0011-00, 1897-01, 0881-02, V2067-06), or a class on an EU
 *   regulated market. The default since 2026-11-03; aggressive, but backed by
 *   binding consultations (art. 179.2.d LGT).
 * - `2:fund_unlisted_2m`: two months for a fund that is **not** admitted (a
 *   foreign UCITS only on a multilateral facility), only by configuration: what
 *   the CNMV guide and common practice do, without a source. Aggressive. A new
 *   identifier: `2:fund_2m` meant two months for any fund, and it is no longer
 *   emitted.
 * - `2:fund_1y`: one year for a fund, the default of one not admitted (article
 *   33.5.g, the five steps of `DEFAULT_WASH_SALE_WINDOW`) and the conservative
 *   side for an admitted one.
 *   The document grades `2:fund_admitted_2m` and `2:fund_1y` medium-high; the
 *   catalogue has no such grade and keeps **medium**, so that the other
 *   reading of each fund still shows its figure in the doubtful section.
 * - `2:movable_capital`: two months for an asset that yields movable capital
 *   income (an ETC or an ETP by default), article 25.2.b) LIRPF: its own rule,
 *   with no market and no one-year variant — **high**; aggressive if wrong.
 * - `2:other`: any other window —a number of days— that no reading of the
 *   document supports. Two months for a fund is **not** one of these: it is
 *   `2:fund_unlisted_2m`, a reading the document names.
 *
 * **A new reading gets a new identifier; an identifier never changes meaning.**
 * That is why the year of funds is `2:fund_1y` and not the old bare `2:fund`,
 * which meant "one year, undisputed": keeping the name would have made the same
 * identifier say one thing in yesterday's documents and another in today's,
 * with nothing to give it away. `2:listed` and `2:crypto` keep their names
 * because renaming them now would be a large change for symmetry alone.
 *
 * Criterion #24, the income category of an ETC or an ETP, is labelled the same
 * way, by the reading in force (`income_category`), and that is why it has four
 * variants and not two: the certainty and, with it, whether the criterion is
 * doubtful depend on which reading is applied.
 *
 * - `24:etc`, `24:etp`: movable capital income, what the document says. The ETC
 *   is **medium**: the ratio of the binding ruling V0267-25 is not "it is an
 *   ETC" but "it is a debt security, because it carries **obligations to pay**
 *   for the issuer", and a physical-gold ETC with a right to delivery obliges
 *   the issuer to **deliver**, not to pay — which the ruling does not resolve.
 *   The ETP is **low**: there is no consultation at all on crypto ETPs, and the
 *   DGT does have settled doctrine that crypto held directly is a capital gain.
 * - `24:etc_gain`, `24:etp_gain`: a capital gain, the opposite of the document.
 *
 * All four are **`both`**, and that is the correction of 2026-09-22: article
 * 49.1 is symmetric and the first reading of it looked at one half only. With a
 * **loss** on the ETC and **dividends** elsewhere, treating it as movable
 * capital absorbs the dividends in full instead of up to 25 % and pays **less**
 * (aggressive); with a **gain** on the ETC and capital losses elsewhere it is
 * the other way round and pays more (conservative). Both are ordinary in this
 * portfolio.
 *
 * #25 is the ECB rate of a line after a change of `fiscal_date_rule` (ADR-0029,
 * point 10): the rate is the one of the fiscal date in force, and a line with
 * another one is corrected by rectification, never recalculated. **Medium**,
 * the certainty of #1 and #5 it rests on; **both**, because the stored rate can
 * be above or below the right one, and so can the figure the proposed
 * correction leaves.
 *
 * Where the document gives a criterion two certainties (#21 "media-baja", #22
 * "alta (orden) / media (redondeo)"), the catalogue keeps the more doubtful
 * one: a figure is never presented as firmer than the weakest part of what it
 * depends on.
 */
export const FISCAL_CRITERIA = {
  "1": { doc: "1", certainty: "medium", risk: "conservative" },
  "2:listed": { doc: "2", certainty: "medium", risk: "aggressive" },
  "2:listed_1y": { doc: "2", certainty: "medium", risk: "conservative" },
  "2:crypto": { doc: "2", certainty: "medium", risk: "conservative" },
  "2:crypto_2m": { doc: "2", certainty: "low", risk: "aggressive" },
  "2:fund_admitted_2m": { doc: "2", certainty: "medium", risk: "aggressive" },
  "2:fund_unlisted_2m": { doc: "2", certainty: "medium", risk: "aggressive" },
  "2:fund_1y": { doc: "2", certainty: "medium", risk: "conservative" },
  "2:other": { doc: "2", certainty: "low", risk: "both" },
  "2:movable_capital": { doc: "2", certainty: "high", risk: "aggressive" },
  "2b": { doc: "2b", certainty: "medium", risk: "conservative" },
  "3": { doc: "3", certainty: "high", risk: "conservative" },
  // First in currency since spec 029 (V1740-17, V2422-20, V0152-26): medium, not
  // disputed; the other reading is computed by running the chain with `each_leg`.
  "4": { doc: "4", certainty: "medium", risk: "both" },
  // A lot acquired in another currency than that of the disposal: leg by leg,
  // with the currency invested imputed on the sale.
  "4:mixed_currency": { doc: "4", certainty: "low", risk: "both" },
  // A collective investment undertaking in currency: leg by leg, and the
  // currency invested imputed on the sale (V0777-21, V0207-24). Low: a US
  // (non-UCITS) ETF falls outside those consultations, and the catalogue does
  // not know the domicile, so it keeps the weaker, like `2:fund_unlisted_2m`.
  "4:iic": { doc: "4", certainty: "low", risk: "both" },
  // The order of the currency lots: FIFO per currency across accounts.
  "4:currency_fifo": { doc: "4", certainty: "medium", risk: "both" },
  // The wash-sale rule on currency, one year after (art. 33.5.e, V1613-25): the
  // rule is certain, what counts as acquiring and transmitting it is not.
  "4:currency_wash_sale": { doc: "4", certainty: "medium", risk: "both" },
  // What the broker converted itself, valued at the euros it settled (ADR-0030).
  "4:auto_conversion": { doc: "4", certainty: "low", risk: "both" },
  "5": { doc: "5", certainty: "medium", risk: "conservative" },
  "6": { doc: "6", certainty: "high", risk: "conservative" },
  "7": { doc: "7", certainty: "disputed", risk: "aggressive" },
  "8": { doc: "8", certainty: "disputed", risk: "aggressive" },
  "9": { doc: "9", certainty: "high", risk: "conservative" },
  "10": { doc: "10", certainty: "high", risk: "conservative" },
  "11": { doc: "11", certainty: "medium", risk: "conservative" },
  "12": { doc: "12", certainty: "high", risk: "conservative" },
  // The cash of an exchange recorded as a `forced_sale`: the fractions the
  // depositary sells, a transmission. Right only when that is what happened.
  "13": { doc: "13", certainty: "medium", risk: "both" },
  // The cash of an exchange under the neutrality regime lowers the value of
  // what is received (arts. 80.3 and 81.2 LIS, literal).
  "13:cost_adjustment": { doc: "13", certainty: "high", risk: "both" },
  "14": { doc: "14", certainty: "high", risk: "conservative" },
  "15": { doc: "15", certainty: "disputed", risk: "conservative" },
  "16": { doc: "16", certainty: "high", risk: "conservative" },
  "17": { doc: "17", certainty: "medium", risk: "aggressive" },
  "18": { doc: "18", certainty: "high", risk: "aggressive" },
  // A lone purchase in the window before the sale is not a repurchase (V3282-18);
  // for an asset that yields movable capital it is an analogy.
  "18:single_purchase": { doc: "18", certainty: "high", risk: "aggressive" },
  "18:single_purchase_etc": { doc: "18", certainty: "medium", risk: "aggressive" },
  "19": { doc: "19", certainty: "high", risk: "aggressive" },
  // The deferred loss rides the repurchased units closest to the sale; the
  // other reading, the oldest, releases it sooner.
  "19b": { doc: "19b", certainty: "medium", risk: "conservative" },
  "20": { doc: "20", certainty: "medium", risk: "aggressive" },
  "21": { doc: "21", certainty: "medium", risk: "both" },
  "22": { doc: "22", certainty: "medium", risk: "neutral" },
  "23": { doc: "23", certainty: "high", risk: "aggressive" },
  "24:etc": { doc: "24", certainty: "medium", risk: "both" },
  "24:etc_gain": { doc: "24", certainty: "low", risk: "both" },
  "24:etp": { doc: "24", certainty: "medium", risk: "both" },
  "24:etp_gain": { doc: "24", certainty: "low", risk: "both" },
  "25": { doc: "25", certainty: "medium", risk: "both" },
  // Share premium and returns of contributions of a listed security lower the
  // cost of each lot down to zero; the excess is movable capital income.
  "26": { doc: "26", certainty: "high", risk: "aggressive" },
  // The estimated quota of the savings base: scale of the year, second limit of art. 80.
  "27": { doc: "27", certainty: "medium", risk: "conservative" },
  // Savings income from outside the portfolio, integrated with it in the estimate.
  "28": { doc: "28", certainty: "high", risk: "neutral" },
  // The tax of the portfolio for its return after tax: what it adds, split between the books.
  "29": { doc: "29", certainty: "medium", risk: "neutral" },
} as const satisfies Record<string, FiscalCriterion>;

export type CriterionId = keyof typeof FISCAL_CRITERIA;

/** The readings of #2 a fund can apply; each one's other window is measured apart. */
export const FUND_CRITERIA = ["2:fund_admitted_2m", "2:fund_unlisted_2m", "2:fund_1y"] as const;
export type FundCriterion = (typeof FUND_CRITERIA)[number];

/**
 * The order of the document, which is the order of every list of criteria the
 * report prints. Written out because `Object.keys` would put the numeric keys
 * first and "2:listed" after "23".
 */
export const CRITERION_IDS: readonly CriterionId[] = [
  "1",
  "2:listed",
  "2:listed_1y",
  "2:crypto",
  "2:crypto_2m",
  "2:fund_admitted_2m",
  "2:fund_unlisted_2m",
  "2:fund_1y",
  "2:other",
  "2:movable_capital",
  "2b",
  "3",
  "4",
  "4:mixed_currency",
  "4:iic",
  "4:currency_fifo",
  "4:currency_wash_sale",
  "4:auto_conversion",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "13:cost_adjustment",
  "14",
  "15",
  "16",
  "17",
  "18",
  "18:single_purchase",
  "18:single_purchase_etc",
  "19",
  "19b",
  "20",
  "21",
  "22",
  "23",
  "24:etc",
  "24:etc_gain",
  "24:etp",
  "24:etp_gain",
  "25",
  "26",
  "27",
  "28",
  "29",
];

/** Which variant of criterion #24 an ETC or an ETP applies, by the reading in force. */
export const categoryCriterion = (
  type: "etc" | "etp",
  category: "capital_gain" | "movable_capital",
): CriterionId => (category === "movable_capital" ? `24:${type}` : `24:${type}_gain`);

/** Doubtful is anything that is not high certainty. */
export const isDoubtful = (id: CriterionId): boolean => FISCAL_CRITERIA[id].certainty !== "high";

/** A set of criteria in the catalogue's order: stable output, easy to read and to compare. */
export const sortCriteria = (ids: Iterable<CriterionId>): CriterionId[] => {
  const present = new Set(ids);
  return CRITERION_IDS.filter((id) => present.has(id));
};
