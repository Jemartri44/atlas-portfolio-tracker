import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./lib/terraform.js";

// Prompt 017 §5, flow 1: the verification of infra/ has a job of its own, with the
// least permissions, and its actions are pinned by SHA.
const workflow = readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
const job = (name: string): string => {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  const rest = workflow.slice(start + 1);
  const end = rest.slice(1).search(/\n {2}[a-z-]+:\n/);
  const body = end === -1 ? rest : rest.slice(0, end + 1);
  return body
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
};

describe("the infra job of the CI", () => {
  const text = job("infra");

  it("exists, and reads the repository and nothing else", () => {
    expect(text).toContain("infra:");
    expect(text).toMatch(/permissions:\n\s+contents: read\n/);
    expect(text).not.toContain("id-token");
    expect(text).not.toContain("environment:");
  });

  it("pins every action by SHA, setup-terraform included, and Terraform by exact version", () => {
    const uses = [...text.matchAll(/uses: (\S+)/g)].map((match) => match[1] ?? "");
    expect(uses.length).toBe(3);
    for (const use of uses) {
      expect(use, use).toMatch(/^[\w./-]+@[0-9a-f]{40}$/);
    }
    expect(uses.some((use) => use.startsWith("hashicorp/setup-terraform@"))).toBe(true);
    expect(text).toContain("terraform_version: 1.16.5");
  });

  it("runs the infra suite, and test:others leaves it out so verify needs no Terraform", () => {
    expect(text).toContain("npm run test:infra");
    const scripts = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"))
      .scripts as Record<string, string>;
    expect(scripts["test:others"]).not.toContain("infra");
    expect(scripts["test:others"]).not.toContain("domain");
    expect(job("verify")).not.toContain("terraform");
  });

  it("holds no credential: no secret, no AWS variable, no role", () => {
    expect(text).not.toMatch(/secrets\./);
    expect(text).not.toMatch(/AWS_|role-to-assume|configure-aws-credentials/);
  });
});
