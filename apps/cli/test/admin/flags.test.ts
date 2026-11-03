// An order of `atlas admin` refuses the options it does not take, instead of
// ignoring them in silence: `--force` or `--from` on the wrong order is a mistake
// the person has to hear about before anything is read from the cloud.

import { describe, expect, it } from "vitest";
import { EXIT } from "../../src/context.js";
import { harness } from "../harness.js";

const refused: [string[], string][] = [
  [["pull", "--force"], "--force"],
  [["pull", "--from", "x"], "--from no vale en «atlas admin pull»"],
  [["compact", "--from", "x"], "--from no vale en «atlas admin compact»"],
  [["restore", "--from", "x", "--accept-unverified", "y"], "--accept-unverified no vale"],
  [["prices", "push", "--from", "x"], "--from no vale en «atlas admin prices push»"],
  [["compact", "--to", "x"], "--to no vale en «atlas admin compact»"],
  [["pull", "--accept-invalid"], "--accept-invalid no vale en «atlas admin pull»"],
  [["pull", "--confirm-duplicate"], "--confirm-duplicate no vale"],
  [["constructor"], "se esperaba atlas admin"],
  [["prices"], "se esperaba atlas admin"],
];

describe("atlas admin options", () => {
  it.each(refused)("%j is a usage error", async (order, message) => {
    const h = harness();
    expect(await h.exec(["admin", ...order, "--env", "test"])).toBe(EXIT.usage);
    expect(h.text()).toContain(message);
  });
});
