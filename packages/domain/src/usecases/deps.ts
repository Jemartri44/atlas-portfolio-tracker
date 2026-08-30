import type { Clock } from "../ports/clock.js";
import type { LedgerStore } from "../ports/ledger-store.js";
import type { RandomSource } from "../ports/random.js";

/** Ports every use case receives; composed by the CLI, the API or the tests. */
export interface UseCaseDeps {
  store: LedgerStore;
  clock: Clock;
  random: RandomSource;
}
