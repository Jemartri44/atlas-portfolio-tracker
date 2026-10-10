import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { infraRoot } from "./lib/terraform.js";

// Family 19 for the stack: the plan JSON hides which provider a module's resource uses
// (the address is not in `root_module.resources`), so this reads the HCL. Everything is
// in eu-west-1 except the certificate, the web ACL, the CSP function and the distribution
// (CloudFront, ACM and WAF for a distribution are global: us-east-1; ADR-0028 row 4).
const code = (file: string): string =>
  readFileSync(join(infraRoot, "modules", "atlas", file), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");

const resources = (text: string): { type: string; name: string; provider: boolean }[] =>
  [...text.matchAll(/resource "(aws_[a-z0-9_]+)" "([a-z0-9_]+)" \{([\s\S]*?)\n\}\n/g)].map((m) => ({
    type: m[1] as string,
    name: m[2] as string,
    provider: /provider\s+=\s+aws\.us_east_1/.test(m[3] as string),
  }));

describe("regions of the stack", () => {
  const all = ["api.tf", "data.tf", "edge.tf", "spa.tf", "ssm.tf"].flatMap((file) =>
    resources(code(file)),
  );

  it("puts exactly the global types in us-east-1, through the aliased provider", () => {
    const edge = all.filter((entry) => entry.provider).map((entry) => entry.type);
    expect(edge.sort()).toEqual([
      "aws_acm_certificate",
      "aws_acm_certificate_validation",
      "aws_cloudfront_distribution",
      "aws_cloudfront_function",
      "aws_cloudfront_function",
      "aws_wafv2_web_acl",
    ]);
    expect(
      all.filter((entry) => !entry.provider && /acm|cloudfront|wafv2/.test(entry.type)),
    ).toEqual([]);
  });

  it("the roots wire the two providers into the module", () => {
    for (const env of ["dev", "prod"]) {
      const main = readFileSync(join(infraRoot, "envs", env, "main.tf"), "utf8");
      expect(main).toMatch(/aws\.us_east_1\s+=\s+aws\.us_east_1/);
      const providers = readFileSync(join(infraRoot, "envs", env, "providers.tf"), "utf8");
      expect(providers).toMatch(/alias\s+=\s+"us_east_1"\s+region\s+=\s+"us-east-1"/);
    }
  });
});
