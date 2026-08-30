import type { UseCaseDeps } from "../../src/usecases/deps.js";
import type { TestStore } from "../memory-store.js";

export const testDeps = (store: TestStore, instant = "2027-08-30T10:00:00.000Z"): UseCaseDeps => {
  let counter = 0;
  return {
    store,
    clock: { now: () => new Date(instant) },
    random: (target) => {
      counter += 1;
      target.fill(counter % 256);
    },
  };
};
