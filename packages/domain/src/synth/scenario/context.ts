// What every block of the scenario shares: the builder that records the events, the parameters the
// seed drew, and two figures one block leaves for a later one.

import type { Decimal } from "../../money/decimal.js";
import type { DividendEvent } from "../../schema/events.js";
import { ScenarioBuilder } from "../builder.js";
import { Prng } from "../random.js";
import { drawParams, type Params } from "./data.js";

export interface ScenarioContext {
  readonly b: ScenarioBuilder;
  readonly p: Params;
  minWorldNav: Decimal | undefined;
  wrongDividend: DividendEvent | undefined;
}

export const createContext = (seed: number): ScenarioContext => {
  const rng = new Prng(seed);
  return {
    p: drawParams(rng),
    b: new ScenarioBuilder(rng, seed),
    minWorldNav: undefined,
    wrongDividend: undefined,
  };
};
