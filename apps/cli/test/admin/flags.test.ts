// An order of `atlas admin` refuses the options it does not take, instead of
// ignoring them in silence: `--force` or `--from` on the wrong order is a mistake
// the person has to hear about before anything is read from the cloud.

import { describe, expect, it } from "vitest";
import { EXIT } from "../../src/context.js";
import { harness } from "../harness.js";

const refused: [string[], string][] = [
  [["devices", "--force"], "--force"],
  [["devices", "--from", "x"], "--from no vale en «atlas admin devices»"],
  [["revoke-all-tokens", "--accept-unverified", "x"], "--accept-unverified no vale"],
  [["compact", "--from", "x"], "--from no vale en «atlas admin compact»"],
  [["restore", "--from", "x", "--accept-unverified", "y"], "--accept-unverified no vale"],
  [["prices", "push", "--from", "x"], "--from no vale en «atlas admin prices push»"],
  [["forget-device", "--from", "x"], "--from no vale en «atlas admin forget-device»"],
  [["devices", "--accept-invalid"], "--accept-invalid no vale en «atlas admin devices»"],
  [["devices", "--confirm-duplicate"], "--confirm-duplicate no vale"],
  [["constructor"], "uso: atlas admin"],
  [["prices"], "uso: atlas admin"],
];

describe("atlas admin options", () => {
  it.each(refused)("%j is a usage error", async (order, message) => {
    const h = harness();
    expect(await h.exec(["admin", ...order, "--env", "test"])).toBe(EXIT.usage);
    expect(h.text()).toContain(message);
  });
});
