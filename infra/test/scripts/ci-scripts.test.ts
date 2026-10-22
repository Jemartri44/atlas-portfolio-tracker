// Feature 017, E4, block 3 (Z7): the workflows of the plan and of the deployments, read as
// text, and the scripts they call, run against a fake `aws`. Mutants 32, 33, 34, 41, 54 of
// prompt 017 §10 die here.

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../lib/terraform.js";

const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");
const code = (path: string) =>
  read(path)
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
const WORKFLOWS = ["infra-plan.yml", "deploy-dev.yml", "deploy-prod.yml"];
const flow = (name: string) => code(`.github/workflows/${name}`);
const SCRIPTS = join(repoRoot, "infra", "scripts", "ci");
const FAKES = join(repoRoot, "infra", "test", "fakes");

describe("every new workflow", () => {
  it("pins each action by SHA, declares permissions, and is inert until a repository variable says so", () => {
    for (const name of WORKFLOWS) {
      const text = flow(name);
      const uses = [...text.matchAll(/uses: (\S+)/g)].map((match) => match[1] ?? "");
      expect(uses.length, name).toBeGreaterThan(0);
      for (const use of uses) {
        expect(use, `${name} ${use}`).toMatch(/^[\w./-]+@[0-9a-f]{40}$/);
      }
      expect(text).toMatch(/^permissions:\n {2}contents: read\n/m);
      expect(text).toMatch(
        /if: \$\{\{ vars\.ATLAS_(INFRA_PLAN|DEPLOY)_?E?N?A?B?L?E?D? ?== 'true'|if: \$\{\{ vars\.ATLAS_[A-Z_]+ == 'true'/,
      );
      expect(text).not.toContain("pull_request_target");
      expect(text).not.toContain("upload-artifact");
      expect(text).not.toContain("configure-aws-credentials");
    }
    // `id-token: write` only where a role is assumed, never at the top of a file.
    for (const name of WORKFLOWS) {
      expect(flow(name)).not.toMatch(/^permissions:\n(?: {2}.*\n)*? {2}id-token/m);
    }
  });
});

describe("checkouts and concurrency", () => {
  it("never persist the token in the checkout, and a deployment of an environment never overlaps itself", () => {
    for (const name of WORKFLOWS) {
      const text = flow(name);
      const checkouts =
        text.match(
          /actions\/checkout@[0-9a-f]{40} # v4\n\s+with:\n\s+persist-credentials: false/g,
        ) ?? [];
      expect(checkouts.length, name).toBe((text.match(/actions\/checkout@/g) ?? []).length);
    }
    for (const env of ["dev", "prod"]) {
      expect(flow(`deploy-${env}.yml`)).toMatch(
        new RegExp(`concurrency:\\n {2}group: atlas-deploy-${env}\\n {2}cancel-in-progress: false`),
      );
    }
  });
});

describe("the plan workflow (mutant 32)", () => {
  const text = flow("infra-plan.yml");
  it("declares no environment, runs no npm, and only for a branch of this repository", () => {
    expect(text).not.toContain("environment:");
    expect(text).not.toMatch(/npm |setup-node/);
    expect(text).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(text).toContain("terraform-run.sh dev plan");
    expect(text).toContain("terraform-run.sh prod plan");
    // The plan of one environment never falls back on the secrets of the other.
    for (const [env, other] of [
      ["DEV", "PROD"],
      ["PROD", "DEV"],
    ] as const) {
      const steps = text
        .split("      - name:")
        .filter((step) => step.includes(`ATLAS_PLAN_${env}_`));
      expect(steps.length).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step).not.toContain(`ATLAS_PLAN_${other}_`);
      }
    }
    expect(code("infra/scripts/ci/terraform-run.sh")).toContain("faltan los secretos");
  });
  it("runs with -lock=false and never shows a plan unfiltered", () => {
    const run = code("infra/scripts/ci/terraform-run.sh");
    expect(run).toMatch(/\[ "\$mode" = plan \] && lock=\(-lock=false\)/);
    expect(run).toContain('"${lock[@]}"');
    const shows = run.split("\n").filter((line) => /\bshow\b/.test(line));
    expect(shows.length).toBeGreaterThan(0);
    for (const line of shows) {
      expect(line).toContain("summarize-plan.sh");
    }
  });
});

describe("the deployments (mutants 33, 34, 41, 54)", () => {
  it("sends everything terraform prints to a file that is not uploaded", () => {
    const run = code("infra/scripts/ci/terraform-run.sh");
    const calls = run
      .split("\n")
      .filter(
        (line) =>
          /^\s*tf (init|plan|apply)|\|\| fail/.test(line) &&
          /\btf\b/.test(line) &&
          !line.startsWith("tf()"),
      );
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const line of calls) {
      expect(line, line).toContain('>>"$log" 2>&1');
    }
    for (const name of ["deploy-dev.yml", "deploy-prod.yml"]) {
      for (const line of flow(name)
        .split("\n")
        .filter((l) => /aws s3 (cp|sync)/.test(l))) {
        expect(line, line).toMatch(/--only-show-errors/);
        expect(line, line).toMatch(/> "\$RUNNER_TEMP\/[\w.-]+\.log" 2>&1/);
      }
    }
  });
  it("deploys prod only from main, through the prod environment, and does not build", () => {
    const text = flow("deploy-prod.yml");
    expect(text).toMatch(/on:\n {2}push:\n {4}branches: \[main\]\n/);
    expect(text).toContain("environment: prod");
    expect(text).toContain("github.ref == 'refs/heads/main'");
    expect(text).not.toMatch(/npm |setup-node|package\.sh|s3 cp "\$RUNNER_TEMP\/artifact/);
    expect(text).toContain("promote.sh");
  });
  it("lets only the dev deployment write the artifacts, and never uploads .vite nor maps", () => {
    const dev = flow("deploy-dev.yml");
    expect(dev).toMatch(/on:\n {2}push:\n {4}branches: \[develop\]\n/);
    expect(dev).toContain("s3://$ARTIFACT_BUCKET/builds/$TREE/");
    expect(dev).not.toContain("environment:");
    for (const name of ["deploy-dev.yml", "deploy-prod.yml"]) {
      const sync =
        flow(name)
          .split("\n")
          .find((l) => l.includes("aws s3 sync")) ?? "";
      expect(sync).toContain("--exclude '.vite/*'");
      expect(sync).toContain("--exclude '*.map'");
    }
    expect(code("infra/scripts/ci/package.sh")).toContain("--exclude='.vite' --exclude='*.map'");
  });
});

describe("the scripts of the CI", () => {
  const tmp = () => mkdtempSync(join(tmpdir(), "atlas-017-ci-"));

  it("summarize-plan prints the address and the action of a change and no value", () => {
    const plan = {
      resource_changes: [
        {
          address: "module.atlas.aws_s3_bucket.spa",
          change: { actions: ["create"], after: { bucket: "SENTINEL-BUCKET" } },
        },
        { address: "aws_x.same", change: { actions: ["no-op"] } },
        {
          address: "aws_x.swap",
          change: { actions: ["delete", "create"], before: { v: "SENTINEL-OLD" } },
        },
      ],
      variables: { domain: { value: "SENTINEL-DOMAIN" } },
    };
    const result = spawnSync("bash", [join(SCRIPTS, "summarize-plan.sh")], {
      input: JSON.stringify(plan),
      encoding: "utf8",
    });
    expect(result.stdout).toBe("create module.atlas.aws_s3_bucket.spa\ndelete+create aws_x.swap\n");
  });

  const fixture = () => {
    const root = tmp();
    mkdirSync(join(root, "apps/api/dist-lambda"), { recursive: true });
    mkdirSync(join(root, "apps/jobs/dist-lambda"), { recursive: true });
    mkdirSync(join(root, "apps/web/dist/.vite"), { recursive: true });
    mkdirSync(join(root, "apps/web/dist/assets"), { recursive: true });
    writeFileSync(join(root, "apps/api/dist-lambda/lambda.zip"), "api");
    writeFileSync(join(root, "apps/jobs/dist-lambda/jobs.zip"), "jobs");
    writeFileSync(join(root, "apps/web/dist/index.html"), "<html>");
    writeFileSync(join(root, "apps/web/dist/.vite/manifest.json"), "{}");
    writeFileSync(join(root, "apps/web/dist/assets/app.js"), "x");
    writeFileSync(join(root, "apps/web/dist/assets/app.js.map"), "map");
    return root;
  };

  it("package.sh leaves .vite and the maps out of the SPA and writes the SHA-256 of the three files", () => {
    const root = fixture();
    const out = join(root, "out");
    expect(
      spawnSync("bash", [join(SCRIPTS, "package.sh"), out], { cwd: root, encoding: "utf8" }).status,
    ).toBe(0);
    const listing = spawnSync("tar", ["-tzf", join(out, "spa.tgz")], { encoding: "utf8" }).stdout;
    expect(listing).toContain("assets/app.js");
    expect(listing).not.toMatch(/\.vite|\.map/);
    expect(
      readFileSync(join(out, "SHA256SUMS"), "utf8")
        .trim()
        .split("\n")
        .map((l) => l.split("  ")[1]),
    ).toEqual(["lambda.zip", "jobs.zip", "spa.tgz"]);
  });

  const TREE = "a".repeat(40);
  const promote = (tamper: boolean) => {
    const root = fixture();
    const out = join(root, "built");
    spawnSync("bash", [join(SCRIPTS, "package.sh"), out], { cwd: root });
    const bucket = join(root, "bucket", "builds", TREE);
    mkdirSync(bucket, { recursive: true });
    cpSync(out, bucket, { recursive: true });
    if (tamper) {
      writeFileSync(join(bucket, "lambda.zip"), "another build");
    }
    writeFileSync(join(root, "state.json"), "{}");
    writeFileSync(join(root, "log"), "");
    const result = spawnSync("bash", [join(SCRIPTS, "promote.sh"), join(root, "got"), TREE], {
      encoding: "utf8",
      env: {
        PATH: `${FAKES}:${process.env.PATH}`,
        ARTIFACT_BUCKET: "b",
        FAKE_S3_DIR: join(root, "bucket"),
        FAKE_AWS_LOG: join(root, "log"),
        FAKE_AWS_STATE: join(root, "state.json"),
      },
    });
    return { result, root };
  };

  it("promote.sh takes what dev wrote and refuses a set whose SHA-256 differs (mutant 34)", () => {
    const good = promote(false);
    expect(good.result.status, good.result.stderr).toBe(0);
    expect(good.result.stdout).toContain("artefacto verificado");
    const bad = promote(true);
    expect(bad.result.status).toBe(1);
    expect(bad.result.stderr).toContain("no coincide");
  });

  it("artifact-env.sh gives the key and the base64 digest the Terraform variables validate", () => {
    const root = fixture();
    spawnSync("bash", [join(SCRIPTS, "package.sh"), join(root, "o")], { cwd: root });
    const env = spawnSync("bash", [join(SCRIPTS, "artifact-env.sh"), join(root, "o"), TREE], {
      encoding: "utf8",
    }).stdout;
    expect(env).toContain(`TF_VAR_artifact_key=builds/${TREE}/lambda.zip`);
    expect(env).toMatch(/TF_VAR_artifact_sha256_base64=[A-Za-z0-9+/]{43}=\n/);
    expect(env).toMatch(/TF_VAR_jobs_artifact_sha256_base64=[A-Za-z0-9+/]{43}=\n/);
  });
});
