// The fiscal criteria of `docs/fiscal-questions.md`, as data (feature 009).
//
// Every figure of the tax report says which of these it depends on, and the
// report has a section of its own for the doubtful ones: a figure computed
// under a disputed criterion must never look like one computed under article
// 35, which nobody disputes (decision (b) of the prompt).
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
 * **actually applied**, not by the type of asset (feature 009 review): a stock
 * the user set to one year applies the prudent side of the dispute, and saying
 * "two months, aggressive" of it would state the opposite of what was done.
 *
 * - `2:listed`: two months for a listed security — **disputed** outside the EU,
 *   and the system cannot tell where a security trades (Q15), so every listed
 *   security carries it; **aggressive** if wrong.
 * - `2:listed_1y`: one year for a listed security — the other side of the same
 *   dispute; **conservative** if wrong.
 * - `2:crypto`: one year for crypto, by prudence — **low**; conservative.
 * - `2:crypto_2m`: two months for crypto — the less prudent side; aggressive.
 * - `2:fund_2m`: two months for a fund, which is what the document says since
 *   2026-09-22 — a fund that publishes its net asset value daily is a security
 *   "admitted to trading" (art. 4.9 RD 1082/2012), and that is letter f). Its
 *   certainty is **medium**, not high: the regulatory ground is written for
 *   Spanish funds managed by a SGIIC, and nothing resolves a foreign UCITS,
 *   which is what is usually bought in Spain.
 * - `2:fund_1y`: one year for a fund, the other side of the same dispute and
 *   the conservative one.
 * - `2:other`: any other window (days, or two months for a fund): no reading
 *   of the document supports it.
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
 * #18 to #23 were numbered by the direction on 2026-09-18 (questions Q1, Q2 and
 * Q5 of the feature 009). Where the document gives a criterion two certainties
 * (#21 "media-baja", #22 "alta (orden) / media (redondeo)"), the catalogue
 * keeps the more doubtful one: a figure is never presented as firmer than the
 * weakest part of what it depends on.
 */
export const FISCAL_CRITERIA = {
  "1": { doc: "1", certainty: "medium", risk: "conservative" },
  "2:listed": { doc: "2", certainty: "disputed", risk: "aggressive" },
  "2:listed_1y": { doc: "2", certainty: "disputed", risk: "conservative" },
  "2:crypto": { doc: "2", certainty: "low", risk: "conservative" },
  "2:crypto_2m": { doc: "2", certainty: "low", risk: "aggressive" },
  "2:fund_2m": { doc: "2", certainty: "medium", risk: "aggressive" },
  "2:fund_1y": { doc: "2", certainty: "medium", risk: "conservative" },
  "2:other": { doc: "2", certainty: "low", risk: "both" },
  "2b": { doc: "2b", certainty: "medium", risk: "conservative" },
  "3": { doc: "3", certainty: "high", risk: "conservative" },
  "4": { doc: "4", certainty: "disputed", risk: "both" },
  "5": { doc: "5", certainty: "medium", risk: "conservative" },
  "6": { doc: "6", certainty: "high", risk: "conservative" },
  "7": { doc: "7", certainty: "disputed", risk: "aggressive" },
  "8": { doc: "8", certainty: "disputed", risk: "aggressive" },
  "9": { doc: "9", certainty: "high", risk: "conservative" },
  "10": { doc: "10", certainty: "high", risk: "conservative" },
  "11": { doc: "11", certainty: "medium", risk: "conservative" },
  "12": { doc: "12", certainty: "high", risk: "conservative" },
  "13": { doc: "13", certainty: "disputed", risk: "conservative" },
  "14": { doc: "14", certainty: "high", risk: "conservative" },
  "15": { doc: "15", certainty: "disputed", risk: "conservative" },
  "16": { doc: "16", certainty: "high", risk: "conservative" },
  "17": { doc: "17", certainty: "medium", risk: "aggressive" },
  "18": { doc: "18", certainty: "medium", risk: "aggressive" },
  "19": { doc: "19", certainty: "high", risk: "aggressive" },
  "20": { doc: "20", certainty: "medium", risk: "aggressive" },
  "21": { doc: "21", certainty: "low", risk: "conservative" },
  "22": { doc: "22", certainty: "medium", risk: "neutral" },
  "23": { doc: "23", certainty: "high", risk: "conservative" },
  "24:etc": { doc: "24", certainty: "medium", risk: "both" },
  "24:etc_gain": { doc: "24", certainty: "low", risk: "both" },
  "24:etp": { doc: "24", certainty: "low", risk: "both" },
  "24:etp_gain": { doc: "24", certainty: "medium", risk: "both" },
} as const satisfies Record<string, FiscalCriterion>;

export type CriterionId = keyof typeof FISCAL_CRITERIA;

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
  "2:fund_2m",
  "2:fund_1y",
  "2:other",
  "2b",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24:etc",
  "24:etc_gain",
  "24:etp",
  "24:etp_gain",
];

/** Which variant of criterion #24 an ETC or an ETP applies, by the reading in force. */
export const categoryCriterion = (
  type: "etc" | "etp",
  category: "capital_gain" | "movable_capital",
): CriterionId => (category === "movable_capital" ? `24:${type}` : `24:${type}_gain`);

/** Doubtful is anything that is not high certainty (feature 009, Q8). */
export const isDoubtful = (id: CriterionId): boolean => FISCAL_CRITERIA[id].certainty !== "high";

/** A set of criteria in the catalogue's order: stable output, easy to read and to compare. */
export const sortCriteria = (ids: Iterable<CriterionId>): CriterionId[] => {
  const present = new Set(ids);
  return CRITERION_IDS.filter((id) => present.has(id));
};
