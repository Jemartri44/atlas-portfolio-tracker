// Synthetic data (feature 003, decision (a)): lives in the domain, imports
// from it, and nothing in the domain imports from here.

export { type Pico, ScenarioBuilder } from "./builder.js";
export { addDays, dateOf, monthAt } from "./calendar.js";
export { SyntheticClock } from "./clock.js";
export { Prng, seededRandom } from "./random.js";
export { type GenerateOptions, generateLedger, SYNTHETIC_EXPECTED_WARNINGS } from "./scenario.js";
export { type LedgerSummary, summarizeLedger } from "./summary.js";
