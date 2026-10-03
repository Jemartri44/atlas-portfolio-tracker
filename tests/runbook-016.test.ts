// The procedures of feature 016 (E4, block 4; §5 family 9; mutant 33): their
// blocks, **exactly as the runbooks have them**, run by `dash` — the `sh` of
// Ubuntu — one after the other **in the state the previous one left**,
// against an `aws` simulated on the PATH. No AWS is reached. What needs AWS
// for real is said as such in each runbook, for the 018.
//
// - `ecb-history-in-the-cloud.md`, steps 1 and 5: the schedule of the ECB is
//   stopped changing **only** its state, and left afterwards exactly as it
//   was — its time zone too — with the fields `update-schedule` does not take
//   left out (review of PR #108, round 2).
// - `scheduled-warnings.md`: a monthly dump checked against its record, each
//   object `bien` or `MAL`.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** A runbook of the 016, in `docs/runbooks/`. */
const runbook = (name: string): string =>
  readFileSync(join(repoRoot, "docs", "runbooks", name), "utf8");

/** The fenced block right after `<!-- ensayo: <name> -->`. */
const block = (text: string, name: string): string => {
  const at = text.indexOf(`<!-- ensayo: ${name} -->`);
  expect(at, name).toBeGreaterThan(0);
  const open = text.indexOf("```sh\n", at);
  const close = text.indexOf("```", open + 6);
  return text.slice(open + 6, close);
};

/**
 * An `aws` with what the procedures ask of it. `update-schedule` refuses the
 * fields it does not take as input, as the CLI does, and keeps them from the
 * schedule it replaces; everything else it is given replaces the schedule.
 */
const FAKE_AWS = `#!/bin/sh
case "$1 $2" in
  "scheduler get-schedule") cat "$FAKE/schedule.json" ;;
  "scheduler update-schedule")
    input=""
    while [ $# -gt 0 ]; do
      case "$1" in --cli-input-json) input=\${2#file://}; shift ;; esac
      shift
    done
    if jq -e 'has("Arn") or has("CreationDate") or has("LastModificationDate")' "$input" > /dev/null; then
      printf 'Unknown parameter in input\\n' >&2
      exit 252
    fi
    jq -s '.[1] + {Arn: .[0].Arn, CreationDate: .[0].CreationDate, LastModificationDate: "2026-10-02T10:00:00+02:00"}' \\
      "$FAKE/schedule.json" "$input" > "$FAKE/next.json"
    mv "$FAKE/next.json" "$FAKE/schedule.json"
    ;;
  "s3api get-object")
    key=""; out=""
    shift 2
    while [ $# -gt 0 ]; do
      case "$1" in
        --bucket) shift ;;
        --key) key=$2; shift ;;
        *) out=$1 ;;
      esac
      shift
    done
    # NoSuchKey or AccessDenied: the CLI fails and writes nothing.
    [ -f "$FAKE/s3/$key" ] || { printf 'An error occurred (NoSuchKey)\\n' >&2; exit 254; }
    cp "$FAKE/s3/$key" "$out"
    printf '{}\\n'
    ;;
  *) exit 64 ;;
esac
`;

const world = () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-runbook-016-"));
  const work = join(dir, "work");
  mkdirSync(join(dir, "bin"));
  mkdirSync(work);
  writeFileSync(join(dir, "bin", "aws"), FAKE_AWS);
  chmodSync(join(dir, "bin", "aws"), 0o755);
  const shell =
    (flags: readonly string[]) =>
    (script: string): string =>
      execFileSync("dash", [...flags, "-c", script], {
        cwd: work,
        env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, FAKE: dir },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
  /**
   * `-e`, so a step that fails stops the rehearsal; and `interactive`, as it
   * runs when pasted into a shell, which never stops (review of PR #109, copias N2).
   */
  return { dir, work, run: shell(["-e"]), interactive: shell([]) };
};

/** The schedule of the ECB as `get-schedule` gives it, every optional field set. */
const SCHEDULE = {
  Arn: "arn:aws:scheduler:eu-west-1:000000000000:schedule/atlas-prod-jobs/atlas-prod-job-ecb",
  CreationDate: "2026-10-01T10:00:00+02:00",
  LastModificationDate: "2026-10-01T10:00:00+02:00",
  GroupName: "atlas-prod-jobs",
  Name: "atlas-prod-job-ecb",
  ScheduleExpression: "cron(15 17 * * ? *)",
  ScheduleExpressionTimezone: "Europe/Madrid",
  State: "ENABLED",
  FlexibleTimeWindow: { Mode: "OFF" },
  ActionAfterCompletion: "NONE",
  Target: {
    Arn: "arn:aws:lambda:eu-west-1:000000000000:function:atlas-prod-job-ecb",
    RoleArn: "arn:aws:iam::000000000000:role/atlas-prod-scheduler",
    Input: '{"event_format":1,"tasks":["ecb_update"]}',
    RetryPolicy: { MaximumEventAgeInSeconds: 3600, MaximumRetryAttempts: 2 },
  },
};

describe("the schedule of the ECB, stopped and left as it was (ecb-history-in-the-cloud.md)", () => {
  const text = runbook("ecb-history-in-the-cloud.md");
  const stored = (dir: string) => JSON.parse(readFileSync(join(dir, "schedule.json"), "utf8"));
  const without = (value: Record<string, unknown>, ...keys: string[]) =>
    Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

  it("changes only the state in step 1, and gives it back with everything else in step 5", () => {
    const w = world();
    writeFileSync(join(w.dir, "schedule.json"), `${JSON.stringify(SCHEDULE)}\n`);
    w.run(block(text, "parar"));
    const stopped = stored(w.dir);
    expect(stopped.State).toBe("DISABLED");
    expect(without(stopped, "State", "LastModificationDate")).toEqual(
      without(SCHEDULE, "State", "LastModificationDate"),
    );
    // Its check, on the state the step left: the difference is empty.
    expect(w.run(block(text, "comprobar-parada"))).toBe("");
    w.run(block(text, "reactivar"));
    expect(without(stored(w.dir), "LastModificationDate")).toEqual(
      without(SCHEDULE, "LastModificationDate"),
    );
    expect(w.run(block(text, "comprobar-reactivada"))).toBe("");
  });

  it("leaves a schedule of dev idle as it was, never enabled by the procedure", () => {
    const w = world();
    const idle = { ...SCHEDULE, State: "DISABLED" };
    writeFileSync(join(w.dir, "schedule.json"), `${JSON.stringify(idle)}\n`);
    w.run(block(text, "parar"));
    w.run(block(text, "reactivar"));
    expect(stored(w.dir).State).toBe("DISABLED");
    expect(w.run(block(text, "comprobar-reactivada"))).toBe("");
  });
});

describe("a monthly dump checked against its record (scheduled-warnings.md)", () => {
  const text = runbook("scheduled-warnings.md");
  const sha = (bytes: string) => createHash("sha256").update(bytes).digest("hex");

  it("says `bien` of every object that is what its record kept, and `MAL` of one that is not", () => {
    const w = world();
    const objects: Record<string, string> = {
      "backups/2026-10/ledger.jsonl": '{"line":1}\n',
      "backups/2026-10/positions.json": "{}\n",
      "backups/2026-10/prices/%2Ex.jsonl": "",
    };
    for (const [key, body] of Object.entries(objects)) {
      mkdirSync(dirname(join(w.dir, "s3", key)), { recursive: true });
      writeFileSync(join(w.dir, "s3", key), body);
    }
    const record = {
      objects: Object.entries(objects).map(([key, body]) => ({ key, sha256: sha(body) })),
    };
    mkdirSync(join(w.dir, "s3", "jobs", "backup", "monthly_backup"), { recursive: true });
    writeFileSync(
      join(w.dir, "s3", "jobs", "backup", "monthly_backup", "2026-10.json"),
      `${JSON.stringify(record)}\n`,
    );
    // Somebody changed the positions after the dump wrote them.
    writeFileSync(join(w.dir, "s3", "backups", "2026-10", "positions.json"), "{ }\n");
    expect(w.run(block(text, "comprobar-volcado"))).toBe(
      [
        "bien backups/2026-10/ledger.jsonl",
        "MAL backups/2026-10/positions.json",
        "bien backups/2026-10/prices/%2Ex.jsonl",
        "",
      ].join("\n"),
    );
    // It leaves nothing behind in the folder where it ran.
    expect(existsSync(join(w.work, "objeto.tmp"))).toBe(false);
    expect(existsSync(join(w.work, "registro.json"))).toBe(false);
  });

  it("says `MAL` of an object it cannot read, pasted into a shell without -e (copias N2)", () => {
    const w = world();
    const same = '{"line":1}\n';
    // Two objects with the same bytes: the second one cannot be read. A stale
    // `objeto.tmp` of the first would pass it off as `bien`.
    const record = {
      objects: [
        { key: "backups/2026-10/ledger.jsonl", sha256: sha(same) },
        { key: "backups/2026-10/prices/a.jsonl", sha256: sha(same) },
        { key: "backups/2026-10/prices/b.jsonl", sha256: sha("") },
      ],
    };
    mkdirSync(join(w.dir, "s3", "backups", "2026-10", "prices"), { recursive: true });
    writeFileSync(join(w.dir, "s3", "backups", "2026-10", "ledger.jsonl"), same);
    writeFileSync(join(w.dir, "s3", "backups", "2026-10", "prices", "b.jsonl"), "");
    mkdirSync(join(w.dir, "s3", "jobs", "backup", "monthly_backup"), { recursive: true });
    writeFileSync(
      join(w.dir, "s3", "jobs", "backup", "monthly_backup", "2026-10.json"),
      `${JSON.stringify(record)}\n`,
    );
    expect(w.interactive(block(text, "comprobar-volcado"))).toBe(
      [
        "bien backups/2026-10/ledger.jsonl",
        "MAL backups/2026-10/prices/a.jsonl (no se lee)",
        "bien backups/2026-10/prices/b.jsonl",
        "",
      ].join("\n"),
    );
    expect(existsSync(join(w.work, "objeto.tmp"))).toBe(false);
  });
});
