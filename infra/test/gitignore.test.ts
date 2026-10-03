import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { repoRoot } from "./lib/terraform.js";

// Family 17 (prompt 017 §9): the personal values and the state never enter the repository.
const scratch = join(repoRoot, "infra", ".gitignore-probe");
const probe = (path: string): boolean =>
  spawnSync("git", ["check-ignore", "-q", path], { cwd: repoRoot }).status === 0;

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe(".gitignore keeps Terraform's private files out", () => {
  it.each([
    "terraform.tfvars",
    "prod.auto.tfvars",
    "terraform.tfstate",
    "terraform.tfstate.backup",
    "saved.tfplan",
    ".terraform/providers/x",
  ])("ignores a real %s created in the tree", (name) => {
    mkdirSync(join(scratch, name, ".."), { recursive: true });
    writeFileSync(join(scratch, name), "x");
    expect(probe(join("infra", ".gitignore-probe", name))).toBe(true);
  });

  it("does not ignore the placeholders nor the lock file, which are versioned", () => {
    expect(probe("infra/bootstrap/account/terraform.tfvars.example")).toBe(false);
    expect(probe("infra/bootstrap/account/.terraform.lock.hcl")).toBe(false);
  });

  it("tracks no tfvars or tfstate file at all", () => {
    const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
      .split("\n")
      .filter((file) => /\.tfvars$|\.tfstate|\.tfplan$/.test(file));
    expect(tracked).toEqual([]);
  });
});
