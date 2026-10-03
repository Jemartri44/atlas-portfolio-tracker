import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseApiConfig } from "@atlas/domain/access";
import { describe, expect, it } from "vitest";
import { costTypes } from "./lib/cost.js";
import { UNTAGGABLE } from "./lib/exempt.js";
import {
  costTypes as costTypesGuardian,
  regions,
  secrets,
  tags,
  wildcards,
} from "./lib/guardians.js";
import { parsePolicy, type Statement } from "./lib/iam.js";
import { changes, ofType, only, type Plan } from "./lib/plan.js";
import { ACCOUNT, renderStack, SUFFIX } from "./lib/renders.js";
import { type Contract, contractStatements, lineSet, roleOf, roleStatements } from "./lib/roles.js";
import { infraRoot, repoRoot } from "./lib/terraform.js";

// Z3 (data and identity) and Z4 (edge) of E2, on the rendered plan of `envs/<env>`.

const contract = JSON.parse(
  readFileSync(join(infraRoot, "test", "contract", "permissions.json"), "utf8"),
) as Contract;
const ENVS = ["dev", "prod"] as const;
const stack = (env: (typeof ENVS)[number]): Plan => renderStack(env);
const attrs = (plan: Plan, type: string, name?: string): Record<string, unknown> =>
  only(plan, type, name).change.after as Record<string, unknown>;
/** A `.tf` file without its comments: the rules read what is configured, not what is said. */
const code = (path: string): string =>
  readFileSync(join(infraRoot, path), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
const STAR = [
  { action: "logs:DescribeLogGroups", source: "Service Authorization Reference" },
  { action: "cloudfront:CreateDistribution", source: "Service Authorization Reference" },
  { action: "cloudfront:CreateFunction", source: "Service Authorization Reference" },
  { action: "acm:RequestCertificate", source: "Service Authorization Reference" },
];

describe.each(ENVS)("the API role of %s", (env) => {
  it("has exactly the lines of the contract: no more, no fewer", () => {
    const rendered = lineSet(roleStatements(stack(env), `atlas-${env}-api`));
    const wanted = lineSet(contractStatements(contract, "api", env));
    expect(rendered.filter((line) => !wanted.includes(line))).toEqual([]);
    expect(wanted.filter((line) => !rendered.includes(line))).toEqual([]);
  });

  it("never deletes, never labels a parameter, and has access/ among the listed prefixes", () => {
    const text = JSON.stringify(roleStatements(stack(env), `atlas-${env}-api`));
    expect(text).not.toMatch(/Delete|LabelParameterVersion|kms:/);
    expect(text).toContain('"access/*"');
  });

  it("is assumed only by lambda.amazonaws.com and carries the boundary of its environment", () => {
    const role = roleOf(stack(env), `atlas-${env}-api`);
    expect(role.permissions_boundary).toBe(`arn:aws:iam::${ACCOUNT}:policy/atlas-${env}-boundary`);
    const trust = (JSON.parse(String(role.assume_role_policy)) as { Statement: Statement[] })
      .Statement;
    expect(trust).toHaveLength(1);
    expect(trust[0]?.Principal).toEqual({ Service: "lambda.amazonaws.com" });
  });
});

describe.each(ENVS)("the data bucket of %s", (env) => {
  const bucket = `atlas-${env}-data-${SUFFIX}`;
  const policyOf = (plan: Plan): Statement[] =>
    parsePolicy(
      changes(plan).find(
        (change) => change.type === "aws_s3_bucket_policy" && change.address.includes("data"),
      )?.change.after?.policy,
    );

  it("is private, versioned Enabled, SSE-S3, never force-destroyed and expires old versions at 365 days", () => {
    const plan = stack(env);
    expect(attrs(plan, "aws_s3_bucket", "this").force_destroy).toBe(false);
    expect(attrs(plan, "aws_s3_bucket", "this").bucket).toBe(bucket);
    const versioning = ofType(plan, "aws_s3_bucket_versioning").find((c) =>
      c.address.endsWith(".data"),
    );
    expect(versioning?.change.after?.versioning_configuration).toMatchObject([
      { status: "Enabled" },
    ]);
    const lifecycle = JSON.stringify(
      ofType(plan, "aws_s3_bucket_lifecycle_configuration").find((c) => c.address.endsWith(".data"))
        ?.change.after?.rule,
    );
    expect(lifecycle).toContain('"noncurrent_days":365');
    expect(lifecycle).toContain('"days_after_initiation":7');
    const sse = JSON.stringify(
      ofType(plan, "aws_s3_bucket_server_side_encryption_configuration").find((c) =>
        c.address.endsWith(".data"),
      )?.change.after,
    );
    expect(sse).toContain("AES256");
    expect(sse).not.toContain("kms");
  });

  it("denies objects and listings to every principal that is not a role of this environment (resource lock)", () => {
    const statements = policyOf(stack(env));
    const objects = statements.find((s) => s.Sid === "DenyObjectActionsOutsideTheEnvironment");
    const roles = (objects?.Condition?.ArnNotLike?.["aws:PrincipalArn"] ?? []) as string[];
    expect([...roles].sort()).toEqual(
      ["api", "admin", "job-ecb", "job-prices", "job-mail", "job-backup", "job-integrity"]
        .map((name) => `arn:aws:iam::${ACCOUNT}:role/atlas-${env}-${name}`)
        .sort(),
    );
    const listing = statements.find((s) => s.Sid === "DenyListOutsideTheEnvironment");
    const listers = (listing?.Condition?.ArnNotLike?.["aws:PrincipalArn"] ?? []) as string[];
    // Deploy and plan escape only the denial of `s3:ListBucket`, nothing else (B1).
    expect(listers.filter((arn) => !roles.includes(arn)).sort()).toEqual([
      `arn:aws:iam::${ACCOUNT}:role/atlas-${env}-deploy`,
      `arn:aws:iam::${ACCOUNT}:role/atlas-${env}-plan`,
    ]);
    expect([listing?.Action].flat()).toEqual(["s3:ListBucket"]);
    const versions = statements.find((s) => s.Sid === "DenyVersionAndUploadListsOutsideTheRoles");
    expect([versions?.Action].flat().sort()).toEqual([
      "s3:ListBucketMultipartUploads",
      "s3:ListBucketVersions",
    ]);
    expect(versions?.Condition?.ArnNotLike?.["aws:PrincipalArn"]).toEqual(roles);
  });

  it("denies configuration changes to everyone but deploy and admin, and backups/ without If-None-Match", () => {
    const statements = policyOf(stack(env));
    const config = statements.find((s) => s.Sid === "DenyConfigurationChangesExceptDeployAndAdmin");
    expect(config?.Condition?.ArnNotLike?.["aws:PrincipalArn"]).toEqual([
      `arn:aws:iam::${ACCOUNT}:role/atlas-${env}-deploy`,
      `arn:aws:iam::${ACCOUNT}:role/atlas-${env}-admin`,
    ]);
    const backups = statements.find((s) => s.Sid === "BackupsOnlyIfAbsent");
    expect(backups).toMatchObject({
      Effect: "Deny",
      Action: "s3:PutObject",
      Resource: `arn:aws:s3:::${bucket}/backups/*`,
      Condition: { Null: { "s3:if-none-match": "true" } },
    });
    expect(statements.find((s) => s.Sid === "DenyInsecureTransport")).toBeDefined();
  });

  it("is the origin of no distribution, and the SPA bucket is the only S3 origin", () => {
    const distribution = attrs(stack(env), "aws_cloudfront_distribution");
    const origins = JSON.stringify(distribution.origin);
    expect(origins).not.toContain("-data-");
    expect(origins).toContain(`atlas-${env}-spa-${SUFFIX}`);
  });
});

describe.each(ENVS)("the parameters, logs and function of %s", (env) => {
  it("writes exactly two String parameters, never a SecureString (family 13)", () => {
    const plan = stack(env);
    const parameters = ofType(plan, "aws_ssm_parameter").map((c) => [
      c.change.after?.name,
      c.change.after?.type,
    ]);
    expect(parameters.sort()).toEqual([
      [`/atlas/${env}/mail/amounts`, "String"],
      [`/atlas/${env}/mail/recipient`, "String"],
    ]);
    expect(
      ofType(plan, "aws_ssm_parameter").find((c) => c.change.after?.value === "off"),
    ).toBeDefined();
    expect(secrets(plan)).toEqual([]);
  });

  it("creates its log group, with 30 days in prod and 7 in dev", () => {
    const group = attrs(stack(env), "aws_cloudwatch_log_group");
    expect(group.name).toBe(`/aws/lambda/atlas-${env}-api`);
    expect(group.retention_in_days).toBe(env === "prod" ? 30 : 7);
  });

  it("is arm64, 256 MB, 30 s, Node 22, with exactly the variables parseApiConfig accepts", () => {
    const fn = attrs(stack(env), "aws_lambda_function");
    expect(fn).toMatchObject({
      function_name: `atlas-${env}-api`,
      runtime: "nodejs22.x",
      handler: "index.handler",
      architectures: ["arm64"],
      memory_size: 256,
      timeout: 30,
    });
    const variables = (fn.environment as { variables: Record<string, string> }[])[0]
      ?.variables as Record<string, string>;
    // The analyser itself decides: an unknown or a missing variable throws.
    const parsed = parseApiConfig(variables);
    expect(parsed.env).toBe(env);
    expect(parsed.dataBucket).toBe(`atlas-${env}-data-${SUFFIX}`);
    expect(parsed.origin).toBe("https://atlas.example.invalid");
    expect(
      Object.keys(variables).filter(
        (k) => /KEY|SECRET|PASSWORD/.test(k) && !k.endsWith("_SECONDS"),
      ),
    ).toEqual([]);
    expect(() => parseApiConfig({ ...variables, ATLAS_EXTRA: "1" })).toThrow();
  });

  it("has a Function URL with AWS_IAM and no public permission", () => {
    const plan = stack(env);
    expect(attrs(plan, "aws_lambda_function_url").authorization_type).toBe("AWS_IAM");
    const permissions = ofType(plan, "aws_lambda_permission").map((c) => [
      c.change.after?.action,
      c.change.after?.principal,
    ]);
    expect(permissions.sort()).toEqual([
      ["lambda:InvokeFunction", "cloudfront.amazonaws.com"],
      ["lambda:InvokeFunctionUrl", "cloudfront.amazonaws.com"],
    ]);
    expect(
      ofType(plan, "aws_lambda_permission").find(
        (c) => "source_account" in (c.change.after ?? {}) && c.change.after?.source_account,
      ),
    ).toBeUndefined();
  });

  it("reserves concurrency only when asked (C12)", () => {
    expect(attrs(stack(env), "aws_lambda_function").reserved_concurrent_executions).toBe(-1);
    const reserved = renderStack(env, { api_reserved_concurrency: env === "dev" ? 1 : 5 });
    expect(attrs(reserved, "aws_lambda_function").reserved_concurrent_executions).toBe(
      env === "dev" ? 1 : 5,
    );
  });

  it("passes the guardians: tags, closed wildcards, regions, cost.md", () => {
    const plan = stack(env);
    expect(tags(plan, { project: "atlas", env, managed_by: "terraform" }, UNTAGGABLE)).toEqual([]);
    expect(wildcards(plan, STAR)).toEqual([]);
    expect(costTypesGuardian(plan, new Set(costTypes().keys()))).toEqual([]);
  });
});

describe("the edge (Z4)", () => {
  const meta = readFileSync(join(repoRoot, "apps/web/index.html"), "utf8").match(
    /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/,
  )?.[1] as string;
  const directives = (csp: string): Record<string, string> =>
    Object.fromEntries(
      csp
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => [part.split(" ")[0] as string, part.split(" ").slice(1).join(" ")]),
    );

  it.each(ENVS)(
    "the CSP function of %s is the <meta> of the SPA plus frame-ancestors 'none'",
    (env) => {
      const code = String(attrs(stack(env), "aws_cloudfront_function").code);
      const csp = /value: "([^"]+)"/.exec(code)?.[1] as string;
      expect(directives(csp)).toEqual({ ...directives(meta), "frame-ancestors": "'none'" });
    },
  );

  it.each(ENVS)(
    "the distribution of %s serves /api/* with no caching, the full origin policy and no CSP function",
    (env) => {
      const d = attrs(stack(env), "aws_cloudfront_distribution");
      const [api] = d.ordered_cache_behavior as Record<string, unknown>[];
      expect(api).toMatchObject({
        path_pattern: "/api/*",
        cache_policy_id: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
        origin_request_policy_id: "b689b0a8-53d0-40ab-baf2-68738e2966ac",
        compress: false,
      });
      expect(api?.function_association).toEqual([]);
      const [fallback] = d.default_cache_behavior as Record<string, unknown>[];
      expect(JSON.stringify(fallback?.function_association)).toContain("viewer-response");
      expect(fallback?.response_headers_policy_id).toBe("67f7725c-6f97-4210-82d7-5512b31e9d03");
    },
  );

  it("dev is disabled unless dev_active; prod is always enabled", () => {
    expect(attrs(stack("dev"), "aws_cloudfront_distribution").enabled).toBe(false);
    expect(
      attrs(renderStack("dev", { dev_active: true }), "aws_cloudfront_distribution").enabled,
    ).toBe(true);
    expect(attrs(stack("prod"), "aws_cloudfront_distribution").enabled).toBe(true);
  });

  it.each(ENVS)("with the Free plan (C11) %s has a web ACL with one rate rule on /api/", (env) => {
    const acl = attrs(stack(env), "aws_wafv2_web_acl");
    const rules = acl.rule as { name: string; statement: unknown }[];
    expect(rules).toHaveLength(1);
    expect(JSON.stringify(rules[0]?.statement)).toContain("rate_based_statement");
    expect(JSON.stringify(rules[0]?.statement)).toContain("/api/");
  });

  it("without a Free plan, dev has no web ACL", () => {
    const plan = renderStack("dev", { edge_mode: "pay_per_use" });
    expect(ofType(plan, "aws_wafv2_web_acl")).toEqual([]);
    expect(attrs(plan, "aws_cloudfront_distribution").web_acl_id ?? null).toBeNull();
  });

  it("every grant to CloudFront names a distribution with AWS:SourceArn, never SourceAccount (static)", () => {
    const text = ["api.tf", "spa.tf"]
      .map((file) => code(join("modules", "atlas", file)))
      .join("\n");
    expect(text).not.toMatch(/SourceAccount|source_account/);
    expect(text.match(/source_arn\s+=\s+aws_cloudfront_distribution\.this\.arn/g)).toHaveLength(2);
    expect(text).toContain('"AWS:SourceArn" = aws_cloudfront_distribution.this.arn');
  });
});

describe("the protection of the data bucket (static)", () => {
  const read = (path: string): string => code(path);

  it("only the protected module carries prevent_destroy, and only the production root uses it", () => {
    expect(read("modules/data-bucket-protected/main.tf")).toMatch(/prevent_destroy\s*=\s*true/);
    expect(read("modules/data-bucket/main.tf")).not.toMatch(/prevent_destroy/);
    expect(read("envs/prod/main.tf")).toContain("modules/data-bucket-protected");
    expect(read("envs/dev/main.tf")).toContain('modules/data-bucket"');
    expect(read("envs/dev/main.tf")).not.toContain("protected");
  });
});
