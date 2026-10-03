import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./lib/terraform.js";

// Family 17 (no personal data in a versioned file) and family 16 (no literal `dev` or
// `prod` in `infra/modules/`), read from the tracked files, not from the plan.
const tracked = (...paths: string[]): string[] =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", ...paths], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => file !== "");

describe("no personal data in a versioned file of infra/ or of the spec", () => {
  const files = tracked("infra", "specs/017-infrastructure-as-code").filter(
    (file) => !/\.(hcl|json|png)$/.test(file) || file.endsWith("permissions.json"),
  );

  it("has no address but the evident placeholders", () => {
    const found = files.flatMap((file) =>
      [...readFileSync(join(repoRoot, file), "utf8").matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)]
        .map((match) => match[0])
        .filter((address) => !/@(example\.invalid|users\.noreply\.github\.com)$/.test(address))
        .filter((address) => !/^(aws-portal|lambda|sts|scheduler|ssm)\./.test(address))
        .map((address) => `${file}: ${address}`),
    );
    expect(found).toEqual([]);
  });

  it("has no account identifier but the evident ones", () => {
    const found = files.flatMap((file) =>
      [...readFileSync(join(repoRoot, file), "utf8").matchAll(/(?<![0-9])[0-9]{12}(?![0-9])/g)]
        .map((match) => match[0])
        .filter((id) => !["000000000000", "111122223333"].includes(id))
        .map((id) => `${file}: ${id}`),
    );
    expect(found).toEqual([]);
  });

  it("has no key that looks like a credential", () => {
    const found = files.filter((file) =>
      /AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(
        readFileSync(join(repoRoot, file), "utf8").replaceAll("AKIAFAKEFAKEFAKEFAKE", ""),
      ),
    );
    expect(found).toEqual([]);
  });
});

describe("no literal environment in infra/modules/", () => {
  it("names neither dev nor prod: the environment arrives as a variable", () => {
    const found = tracked("infra/modules").filter((file) =>
      /(?<![a-z-])(dev|prod)(?![a-z])/.test(readFileSync(join(repoRoot, file), "utf8")),
    );
    expect(found).toEqual([]);
  });
});
