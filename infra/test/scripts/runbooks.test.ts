// Feature 017, E4, block 4: the runbooks of docs/runbooks/ that this feature writes. Each one
// is read for what no runbook may say, every script it names exists, and the commands of the
// flat-rate one are walked in order against the fake `aws`, each in the state the last left.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../lib/terraform.js";

const NAMES = ["atlas-admin-secrets", "flat-rate-plan", "bootstrap-and-ci"];
const text = (name: string) =>
  readFileSync(join(repoRoot, "docs", "runbooks", `${name}.md`), "utf8");

describe("the runbooks of E4", () => {
  it("never take --yes, a secret in a command line or an auto-approved apply", () => {
    for (const name of NAMES) {
      const body = text(name).replace(/`[^`]*no acepta[^`]*`/g, "");
      expect(body, name).not.toMatch(/terraform apply[^\n]*-auto-approve/);
      expect(body, name).not.toMatch(/ -var[ =]/);
      expect(
        body
          .split("\n")
          .filter(
            (l) => /--yes/.test(l) && !/no hay|ni `--yes`|sin `--yes`|No acepta|rechaza/.test(l),
          ),
        name,
      ).toEqual([]);
    }
  });

  it("only name scripts that exist", () => {
    for (const name of NAMES) {
      for (const match of text(name).matchAll(/infra\/scripts\/[\w./-]+\.sh/g)) {
        expect(existsSync(join(repoRoot, match[0])), `${name}: ${match[0]}`).toBe(true);
      }
    }
  });

  it("walk the flat-rate steps in the state each one leaves (status, subscribe, subscribe, status)", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-017-rb-"));
    const dist = "arn:aws:cloudfront::000000000000:distribution/EDEV1";
    const acl =
      "arn:aws:wafv2:us-east-1:000000000000:global/webacl/atlas-dev-edge/0a0a0a0a-0000-0000-0000-000000000000";
    const tags = [{ Key: "env", Value: "dev" }];
    writeFileSync(
      join(dir, "state.json"),
      JSON.stringify({ subscriptions: [], tags: { [dist]: tags, [acl]: tags } }),
    );
    writeFileSync(join(dir, "log"), "");
    const env = {
      PATH: `${join(repoRoot, "infra", "test", "fakes")}:${process.env.PATH}`,
      FAKE_AWS_STATE: join(dir, "state.json"),
      FAKE_AWS_LOG: join(dir, "log"),
    };
    const steps = [
      ...text("flat-rate-plan").matchAll(
        /`infra\/scripts\/flat-rate-plan\.sh (status|subscribe) [^`]*`/g,
      ),
    ].map((m) => m[1] as string);
    expect(steps).toEqual(["status", "subscribe"]);
    const said: string[] = [];
    for (const order of [...steps, "subscribe", "status"]) {
      const result = spawnSync(
        "bash",
        [
          join(repoRoot, "infra/scripts/flat-rate-plan.sh"),
          order,
          "--env",
          "dev",
          "--distribution-arn",
          dist,
          "--web-acl-arn",
          acl,
        ],
        { env, encoding: "utf8" },
      );
      expect(result.status, `${order}: ${result.stderr}`).toBe(0);
      said.push(result.stdout.trim());
    }
    expect(said).toEqual([
      "dev: sin plan; planes Free en la cuenta: 0 de 3.",
      "dev: suscrito al plan Free.",
      "dev: ya esta suscrito; no se hace nada.",
      "dev: cubierto por un plan FREE, estado ACTIVE; planes Free en la cuenta: 1 de 3.",
    ]);
  });
});
