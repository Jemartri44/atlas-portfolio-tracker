// The alternative of `docs/runbooks/revoke-all-tokens.md` with the AWS CLI
// (feature 015, E5; review of PR #98, N3): its two blocks, **exactly as the
// runbook has them**, run by `dash` — the `sh` of Ubuntu, whose `echo` reads
// `\` and `\n` — against a simulated `aws` on the PATH. No AWS is reached.
// What it writes must be the bytes the API writes (`revokedRecord`,
// `serializeTokenRecord`), and what cannot be read must be counted.

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  newTokenRecord,
  revokedRecord,
  serializeTokenRecord,
  type TokenRecord,
} from "@atlas/domain/access";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runbook = readFileSync(join(repoRoot, "docs", "runbooks", "revoke-all-tokens.md"), "utf8");

/** The fenced block right after `<!-- ensayo: <name> -->`, without its indentation. */
const block = (name: string): string => {
  const at = runbook.indexOf(`<!-- ensayo: ${name} -->`);
  expect(at).toBeGreaterThan(0);
  const open = runbook.indexOf("```sh\n", at);
  const close = runbook.indexOf("```", open + 6);
  const lines = runbook.slice(open + 6, close).split("\n");
  const indent = /^ */.exec(lines[0] as string)?.[0].length ?? 0;
  return lines.map((line) => line.slice(indent)).join("\n");
};

/** An `aws` that answers the listing from a file and keeps every write apart. */
const FAKE_AWS = `#!/bin/sh
case "$2" in
  get-parameters-by-path) cat "$FAKE_SSM/params.json" ;;
  put-parameter)
    shift 2
    n=""; v=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --name) n=$2; shift ;;
        --value=*) v=\${1#--value=} ;;
      esac
      shift
    done
    i=$(ls "$FAKE_SSM/put" | wc -l)
    printf '%s' "$n" > "$FAKE_SSM/put/$i.name"
    printf '%s' "$v" > "$FAKE_SSM/put/$i.value"
    ;;
  *) exit 64 ;;
esac
`;

const record = (tokenId: string, deviceName: string): TokenRecord =>
  newTokenRecord({
    tokenId,
    secretSha256: "0".repeat(64),
    sub: "108234567890123456789",
    email: "user@example.test",
    deviceId: "D".repeat(22),
    deviceName,
    issuedAtMs: Date.UTC(2026, 9, 1, 10, 0, 0),
    lifetimeDays: 90,
  });

const world = (parameters: { Name: string; Value: string }[]) => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-runbook-"));
  mkdirSync(join(dir, "bin"));
  mkdirSync(join(dir, "put"));
  writeFileSync(join(dir, "bin", "aws"), FAKE_AWS);
  chmodSync(join(dir, "bin", "aws"), 0o755);
  writeFileSync(join(dir, "params.json"), JSON.stringify({ Parameters: parameters }));
  const run = (script: string): string =>
    execFileSync("dash", ["-c", script], {
      env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, FAKE_SSM: dir },
      encoding: "utf8",
    });
  const puts = () =>
    readdirSync(join(dir, "put"))
      .filter((file) => file.endsWith(".name"))
      .sort()
      .map((file) => ({
        name: readFileSync(join(dir, "put", file), "utf8"),
        value: readFileSync(join(dir, "put", file.replace(".name", ".value")), "utf8"),
      }));
  return { dir, run, puts };
};

const PATH = "/atlas/prod/device-tokens/";

describe("the AWS CLI alternative of revoking every token, run by dash", () => {
  it("writes the API's exact bytes, leaves the revoked and the unreadable, and counts the unreadable", () => {
    const hard = record("A".repeat(22), 'portátil «casa» "x" \\ y\nz');
    const revoked = revokedRecord(record("B".repeat(22), "vieja"), Date.UTC(2026, 9, 2));
    const w = world([
      { Name: `${PATH}${hard.token_id}`, Value: serializeTokenRecord(hard) },
      { Name: `${PATH}${revoked.token_id}`, Value: serializeTokenRecord(revoked) },
      { Name: `${PATH}${"U".repeat(22)}`, Value: "{" },
    ]);
    w.run(block("revocar"));
    const puts = w.puts();
    expect(puts.map((put) => put.name)).toEqual([`${PATH}${hard.token_id}`]);
    const written = puts[0]?.value as string;
    const at = (JSON.parse(written) as { revoked_at: string }).revoked_at;
    expect(at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(written).toBe(serializeTokenRecord(revokedRecord(hard, Date.parse(at))));
    // The check, over the parameters as they are now: only the unreadable one.
    writeFileSync(
      join(w.dir, "params.json"),
      JSON.stringify({
        Parameters: [
          { Name: `${PATH}${hard.token_id}`, Value: written },
          { Name: `${PATH}${revoked.token_id}`, Value: serializeTokenRecord(revoked) },
          { Name: `${PATH}${"U".repeat(22)}`, Value: "{" },
        ],
      }),
    );
    expect(w.run(block("comprobar")).trim()).toBe("1");
  });

  it("gives 0 in the check once every record is revoked and readable", () => {
    const revoked = revokedRecord(record("C".repeat(22), "una"), Date.UTC(2026, 9, 2));
    const w = world([{ Name: `${PATH}${revoked.token_id}`, Value: serializeTokenRecord(revoked) }]);
    w.run(block("revocar"));
    expect(w.puts()).toEqual([]);
    expect(w.run(block("comprobar")).trim()).toBe("0");
  });
});
