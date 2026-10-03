// Feature 017, E4, block 2: the flat-rate plan script against a fake `aws` on the PATH. The
// calls the fake received are asserted one by one. Nothing here reaches AWS.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../lib/terraform.js";

const SCRIPT = join(repoRoot, "infra", "scripts", "flat-rate-plan.sh");
const FAKES = join(repoRoot, "infra", "test", "fakes");
const DIST = "arn:aws:cloudfront::000000000000:distribution/EDEV1";
const ACL =
  "arn:aws:wafv2:us-east-1:000000000000:global/webacl/atlas-dev-edge/0a0a0a0a-0000-0000-0000-000000000000";
const tags = (env: string) => [{ Key: "env", Value: env }];

interface State {
  subscriptions: object[];
  tags?: Record<string, object[]>;
  fail?: string[];
}
const free = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    arn: `other-${i}`,
    planFamily: "CloudFront",
    planTier: "FREE",
    status: "ACTIVE",
    resourceArns: [`arn:aws:cloudfront::000000000000:distribution/EOTHER${i}`],
    eTag: `e${i}`,
  }));
const setup = (state: State) => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-017-e4-"));
  const file = join(dir, "state.json");
  const log = join(dir, "calls.log");
  writeFileSync(
    file,
    JSON.stringify({ tags: { [DIST]: tags("dev"), [ACL]: tags("dev") }, ...state }),
  );
  writeFileSync(log, "");
  const env = {
    PATH: `${FAKES}:${process.env.PATH}`,
    FAKE_AWS_STATE: file,
    FAKE_AWS_LOG: log,
    HOME: dir,
  };
  const calls = () => readFileSync(log, "utf8").split("\n").filter(Boolean);
  const stateNow = () => JSON.parse(readFileSync(file, "utf8")) as State;
  return { env, calls, stateNow };
};
const args = (order: string, extra: string[] = []) => [
  SCRIPT,
  order,
  "--env",
  "dev",
  "--distribution-arn",
  DIST,
  "--web-acl-arn",
  ACL,
  ...extra,
];
const run = (order: string, env: Record<string, string>, extra: string[] = []) =>
  spawnSync("bash", args(order, extra), { env, encoding: "utf8" });
const mutating = (calls: string[]) =>
  calls.filter((c) => /create-subscription|cancel-subscription/.test(c));

describe("flat-rate-plan.sh", () => {
  it("subscribes once with the deterministic token and says so the second time (idempotent)", () => {
    const s = setup({ subscriptions: [] });
    const first = run("subscribe", s.env);
    expect(first.status).toBe(0);
    expect(mutating(s.calls())).toEqual([
      `--region us-east-1 pricing-plan-manager create-subscription --plan-family CloudFront --plan-tier FREE --usage-level DEFAULT --resource-arns ${DIST} ${ACL} --approval-mode IMMEDIATE --client-token atlas-dev-flat-rate-free --output json`,
    ]);
    const second = run("subscribe", s.env);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("ya esta suscrito");
    expect(mutating(s.calls())).toHaveLength(1);
    expect(s.stateNow().subscriptions).toHaveLength(1);
  });

  it("refuses with three Free plans in the account, and writes nothing", () => {
    const s = setup({ subscriptions: free(3) });
    const result = run("subscribe", s.env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("tres planes Free");
    expect(mutating(s.calls())).toEqual([]);
  });

  it("does not join a plan to a resource of the other environment", () => {
    const s = setup({ subscriptions: [], tags: { [DIST]: tags("prod"), [ACL]: tags("dev") } });
    const result = run("subscribe", s.env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("etiqueta env=dev");
    expect(mutating(s.calls())).toEqual([]);
  });

  it("reports the state and prints no ARN", () => {
    const s = setup({
      subscriptions: [
        {
          arn: "s",
          planFamily: "CloudFront",
          planTier: "FREE",
          status: "ACTIVE",
          resourceArns: [DIST, ACL],
          eTag: "e",
        },
      ],
    });
    const result = run("status", s.env);
    expect(result.stdout).toContain("dev: cubierto por un plan FREE");
    expect(`${result.stdout}${result.stderr}`).not.toContain("000000000000");
  });

  it("refuses --yes, an unknown option and a bad environment", () => {
    const s = setup({ subscriptions: [] });
    expect(run("cancel", s.env, ["--yes"]).status).toBe(64);
    expect(
      spawnSync(
        "bash",
        [
          SCRIPT,
          "subscribe",
          "--env",
          "__proto__",
          "--distribution-arn",
          DIST,
          "--web-acl-arn",
          ACL,
        ],
        { env: s.env, encoding: "utf8" },
      ).status,
    ).toBe(64);
    expect(s.calls()).toEqual([]);
  });

  const covered = (extra: object = {}) => [
    {
      arn: "sub-1",
      planFamily: "CloudFront",
      planTier: "FREE",
      status: "ACTIVE",
      resourceArns: [DIST, ACL],
      eTag: "etag-1",
      ...extra,
    },
  ];

  it("does not cancel without a terminal", () => {
    const s = setup({ subscriptions: covered() });
    const result = spawnSync("bash", args("cancel"), {
      env: s.env,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      input: "dev\n",
    });
    expect(result.status).toBe(4);
    expect(mutating(s.calls())).toEqual([]);
  });

  it("cancels only with the environment typed on a terminal, on the ETag it read", () => {
    const wrong = setup({ subscriptions: covered() });
    const refused = spawnSync(
      "script",
      ["-qefc", `bash ${args("cancel").join(" ")}`, "/dev/null"],
      { env: wrong.env, encoding: "utf8", input: "prod\n" },
    );
    expect(refused.stdout).toContain("Cancelado: no se ha tocado nada");
    expect(mutating(wrong.calls())).toEqual([]);
    const right = setup({ subscriptions: covered() });
    spawnSync("script", ["-qefc", `bash ${args("cancel").join(" ")}`, "/dev/null"], {
      env: right.env,
      encoding: "utf8",
      input: "dev\n",
    });
    expect(mutating(right.calls())).toEqual([
      "--region us-east-1 pricing-plan-manager cancel-subscription --arn sub-1 --if-match etag-1 --output json",
    ]);
    // Already scheduled: nothing more, and no question.
    const again = run("cancel", { ...right.env });
    expect(again.stdout).toContain("ya esta programada");
  });

  it("says nothing of what AWS answered when it fails", () => {
    const s = setup({ subscriptions: [], fail: ["create-subscription"] });
    const result = run("subscribe", s.env);
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("SECRET-IN-MESSAGE");
  });
});
