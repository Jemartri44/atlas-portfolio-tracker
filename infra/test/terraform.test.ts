import { describe, expect, it } from "vitest";
import { assertEnoughMemory, infraRoot, terraform } from "./lib/terraform.js";

// Layers A and B of prompt 017 §4: syntax, schema, and a plan with a simulated provider.
// The only network is the HashiCorp registry, in `init` (the provider is not AWS).

const ROOTS = ["bootstrap/account", "bootstrap/env"];

describe("terraform fmt", () => {
  it("leaves nothing to format in infra/", () => {
    const run = terraform(infraRoot, ["fmt", "-check", "-recursive", "-no-color"]);
    expect({ status: run.status, files: run.stdout }).toEqual({ status: 0, files: "" });
  });
});

describe.each(ROOTS)("the root %s", (root) => {
  const dir = `${infraRoot}/${root}`;

  it("initialises without a backend, pins the provider exactly and validates", () => {
    assertEnoughMemory();
    const init = terraform(
      dir,
      ["init", "-backend=false", "-input=false", "-no-color", "-lockfile=readonly"],
      { network: true },
    );
    expect(init.status, init.stderr).toBe(0);
    const validate = terraform(dir, ["validate", "-no-color"]);
    expect(validate.status, validate.stdout + validate.stderr).toBe(0);
  });

  it("passes every run of terraform test with the simulated provider", () => {
    assertEnoughMemory();
    const run = terraform(dir, ["test", "-no-color"]);
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(run.stdout).toMatch(/\d+ passed, 0 failed/);
  });
});
