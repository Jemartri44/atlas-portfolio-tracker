import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./lib/terraform.js";

// ADR-0034, row 20: a PR that touches `infra/bootstrap/` has to say what was applied by
// hand, `dev` first, and when `prod` will be.
const template = readFileSync(join(repoRoot, ".github", "pull_request_template.md"), "utf8");

describe("the box of the bootstrap in the PR template", () => {
  const box = template.split("\n").find((line) => line.startsWith("- [ ] **Bootstrap**")) ?? "";

  it("exists, as a checkbox, in English like the rest of the template", () => {
    expect(box).not.toBe("");
  });

  it("names infra/bootstrap/, the order (dev first) and prod", () => {
    expect(box).toContain("infra/bootstrap/");
    expect(box).toContain("`dev` first");
    expect(box).toContain("`prod`");
    expect(box).toContain("by hand");
  });
});
