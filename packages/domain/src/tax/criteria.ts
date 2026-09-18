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

/** If the criterion is wrong, what happened: paid too much, declared too little, or either. */
export type RiskDirection = "conservative" | "aggressive" | "both";

export interface FiscalCriterion {
  /** The number of the criterion in `docs/fiscal-questions.md`. */
  doc: string;
  certainty: Certainty;
  risk: RiskDirection;
}

/**
 * The criteria the engine applies. Criterion #2 has three variants because the
 * document gives it three certainties: the two months of listed securities are
 * **disputed** outside the EU and the system cannot tell where a security trades
 * (Q15), so every listed security carries the disputed one; one year for crypto
 * is **low**; one year for funds is the letter g) of article 33.5, which the
 * document does not dispute. `etc_etp_category` is the finding the review calls
 * the largest in amount and that has no number: whether the disposal of an ETC
 * or an ETP is a capital gain or movable capital income.
 *
 * #18 to #23 were numbered by the direction on 2026-09-18 (questions Q1, Q2 and
 * Q5 of the feature 009); the document receives them from the direction.
 */
export const FISCAL_CRITERIA = {
  "1": { doc: "1", certainty: "medium", risk: "conservative" },
  "2:listed": { doc: "2", certainty: "disputed", risk: "aggressive" },
  "2:crypto": { doc: "2", certainty: "low", risk: "conservative" },
  "2:fund": { doc: "2", certainty: "high", risk: "conservative" },
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
  "19": { doc: "19", certainty: "low", risk: "aggressive" },
  "20": { doc: "20", certainty: "medium", risk: "both" },
  "21": { doc: "21", certainty: "low", risk: "conservative" },
  "22": { doc: "22", certainty: "medium", risk: "conservative" },
  "23": { doc: "23", certainty: "high", risk: "aggressive" },
  etc_etp_category: { doc: "ETC/ETP", certainty: "disputed", risk: "both" },
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
  "2:crypto",
  "2:fund",
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
  "etc_etp_category",
];

/** Doubtful is anything that is not high certainty (feature 009, Q8). */
export const isDoubtful = (id: CriterionId): boolean => FISCAL_CRITERIA[id].certainty !== "high";

/** A set of criteria in the catalogue's order: stable output, easy to read and to compare. */
export const sortCriteria = (ids: Iterable<CriterionId>): CriterionId[] => {
  const present = new Set(ids);
  return CRITERION_IDS.filter((id) => present.has(id));
};
