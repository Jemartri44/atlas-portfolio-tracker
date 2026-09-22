// Degraded projection in read-only commands (ADR-0015): one invalid event must
// never leave the ledger unreadable, because reading it is the only way to
// repair it. Mutations keep demanding a valid ledger.

import { access, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { EXIT } from "../../src/context.js";
import { COMMANDS } from "../../src/main.js";
import { harness, seed } from "../harness.js";

/** Enough configuration for `contribute` to have something to answer. */
const configured = () => [
  ...seed(),
  {
    schema_version: 1 as const,
    id: "01ARYZ6S41TSV4RRFFQ69G5SET",
    recorded_at: "2026-09-01T17:00:00.000Z",
    type: "settings_changed" as const,
    settings: {
      ...DEFAULT_SETTINGS,
      target_weights: { ast_world: "60", ast_bonds: "40" },
      bucket_pct_of_contribution: "10",
    },
  },
];

/** A cash movement on an account that does not exist: valid in shape, invalid in projection. */
const brokenLedger = () =>
  harness({
    events: [
      ...configured(),
      {
        schema_version: 1,
        id: "01ARYZ6S41TSV4RRFFQ69G5FZZ",
        recorded_at: "2026-09-01T18:00:00.000Z",
        type: "cash_deposit",
        account_id: "acc_missing",
        fx_rate_date: "2026-09-01",
        value_date: "2026-09-01",
        amount: "1",
        currency: "EUR",
        fx_rate: "1",
        fingerprint: "sha256:x",
      },
    ],
    confirm: true,
  });

/**
 * Every command of the CLI, with a representative invocation. `readOnly` ones
 * answer with the warning header on a degraded ledger; the rest are rejected.
 * The last test checks the table covers `COMMANDS`, so a new command cannot be
 * added without deciding which side it is on.
 */
const INVOCATIONS: { command: string; argv: string[]; readOnly: boolean }[] = [
  { command: "positions", argv: ["positions"], readOnly: true },
  { command: "weights", argv: ["weights"], readOnly: true },
  { command: "contribute", argv: ["contribute", "--amount", "100"], readOnly: true },
  { command: "costs", argv: ["costs"], readOnly: true },
  { command: "networth", argv: ["networth"], readOnly: true },
  { command: "bucket", argv: ["bucket"], readOnly: true },
  { command: "lots", argv: ["lots"], readOnly: true },
  { command: "cash", argv: ["cash"], readOnly: true },
  { command: "gains", argv: ["gains", "2027"], readOnly: true },
  { command: "income", argv: ["income", "2027"], readOnly: true },
  { command: "valuations", argv: ["valuations"], readOnly: true },
  { command: "account", argv: ["account", "list"], readOnly: true },
  { command: "asset", argv: ["asset", "list"], readOnly: true },
  { command: "settings", argv: ["settings", "show"], readOnly: true },
  { command: "thesis", argv: ["thesis", "list"], readOnly: true },
  { command: "order", argv: ["order", "list"], readOnly: true },
  { command: "transfer", argv: ["transfer", "pending"], readOnly: true },
  { command: "transfers", argv: ["transfers", "pending"], readOnly: true },
  { command: "export", argv: ["export", "--format", "csv"], readOnly: true },
  // `check` is the tool that lists the invalid events: it reports them, it does not warn about itself.
  { command: "check", argv: ["check"], readOnly: true },
  // `tax` writes nothing, but on a degraded ledger it refuses instead of warning:
  // a savings base computed over a skipped event is approximate, and the answer
  // to that is the list of what to repair (feature 009, Q11).
  { command: "tax", argv: ["tax", "2027"], readOnly: false },
  // The informative returns refuse for the same reason: they value the
  // quantities of one day, and a projection that skipped an event holds the
  // wrong ones.
  { command: "m720", argv: ["m720", "2027"], readOnly: false },
  { command: "m721", argv: ["m721", "2027"], readOnly: false },
  {
    command: "add",
    argv: [
      "add",
      "cash-in",
      "--account",
      "acc_fund",
      "--value-date",
      "2027-01-11",
      "--fx-rate-date",
      "2027-01-11",
      "--amount",
      "10",
      "--currency",
      "EUR",
      "--fx-rate",
      "1",
      "--yes",
    ],
    readOnly: false,
  },
  {
    command: "ca",
    argv: [
      "ca",
      "split",
      "--asset",
      "ast_world",
      "--ratio",
      "2",
      "--effective-date",
      "2027-02-01",
      "--source-document",
      "doc",
      "--yes",
    ],
    readOnly: false,
  },
  {
    command: "edit",
    argv: ["edit", "01ARYZ6S41TSV4RRFFQ6900000", "--reason", "x"],
    readOnly: false,
  },
  {
    command: "delete",
    argv: ["delete", "01ARYZ6S41TSV4RRFFQ6900000", "--reason", "x"],
    readOnly: false,
  },
  { command: "compact", argv: ["compact", "--yes"], readOnly: false },
  { command: "synth", argv: ["synth", "--out", "/dev/null"], readOnly: false },
  { command: "backup", argv: ["backup", "--to", "/dev/null"], readOnly: false },
];

const HEADER = "inválido";

describe("degraded projection on read-only commands", () => {
  const readOnly = INVOCATIONS.filter((entry) => entry.readOnly && entry.command !== "check");

  it.each(readOnly)("$command answers and warns on a degraded ledger", async ({ argv }) => {
    const h = brokenLedger();
    expect(await h.exec(argv)).toBe(0);
    expect(h.text()).toContain(HEADER);
    expect(h.text()).toContain("atlas check");
  });

  it.each(readOnly)("$command reports invalid_count in --json", async ({ argv, command }) => {
    const h = brokenLedger();
    expect(await h.exec([...argv, "--json"])).toBe(0);
    if (command === "export") {
      return; // export writes the ledger, not a JSON envelope
    }
    expect(h.invalidCount()).toBe(1);
    // No header inside the JSON: it would break every script that reads it.
    expect(h.out.join("\n")).not.toContain(HEADER);
  });

  it.each(readOnly)("$command says nothing on a healthy ledger", async ({ argv, command }) => {
    const h = harness({ events: configured(), confirm: true });
    expect(await h.exec(argv)).toBe(0);
    expect(h.text()).not.toContain(HEADER);
    if (command === "export") {
      return;
    }
    h.reset();
    expect(await h.exec([...argv, "--json"])).toBe(0);
    expect(h.invalidCount()).toBe(0);
  });

  it("keeps the export data clean: the warning goes to the error channel", async () => {
    const h = brokenLedger();
    expect(await h.exec(["export", "--format", "jsonl"])).toBe(0);
    expect(h.err.join("\n")).toContain(HEADER);
    expect(h.out.join("\n")).not.toContain(HEADER);
    expect(h.out.join("\n")).toContain('"account_created"');
  });

  it("still refuses every mutation on a degraded ledger", async () => {
    for (const { argv, command } of INVOCATIONS.filter((entry) => !entry.readOnly)) {
      const h = brokenLedger();
      const before = (await h.store.load()).lines.length;
      const code = await h.exec(argv);
      const after = (await h.store.load()).lines.length;
      expect({ command, wrote: after !== before }).toEqual({ command, wrote: false });
      expect({ command, code: code === 0 }).toEqual({ command, code: false });
    }
  });

  it("blames the invalid event, not the mutation being recorded", async () => {
    const h = brokenLedger();
    expect(
      await h.exec([
        "add",
        "cash-in",
        "--account",
        "acc_fund",
        "--value-date",
        "2027-01-11",
        "--amount",
        "10",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-01-11",
        "--yes",
      ]),
    ).toBe(EXIT.domain);
    expect(h.text()).toContain("01ARYZ6S41TSV4RRFFQ69G5FZZ");
    expect(h.text()).toContain("cash_deposit");
    expect(h.text()).toContain("atlas check");
  });

  it("covers every command of the CLI", () => {
    expect(INVOCATIONS.map((entry) => entry.command).sort()).toEqual(Object.keys(COMMANDS).sort());
  });
});

describe("writing inside a git working tree", () => {
  const outside = join(tmpdir(), "atlas-outside-repo");

  it("asks before writing an export inside the repository and honours the answer", async () => {
    const declined = harness({ events: seed(), confirm: false });
    expect(await declined.exec(["export", "--format", "csv", "--out", "./ledger-copy.csv"])).toBe(
      0,
    );
    expect(declined.text()).toContain("dentro del repositorio");
    expect(declined.text()).toContain("Cancelado.");
    await expect(access("./ledger-copy.csv")).rejects.toThrow();

    const accepted = harness({ events: seed(), confirm: true });
    const target = join(tmpdir(), `atlas-export-${process.pid}.csv`);
    expect(await accepted.exec(["export", "--format", "csv", "--out", target])).toBe(0);
    expect(accepted.text()).not.toContain("dentro del repositorio");
    await rm(target, { force: true });
  });

  it("rejects when it cannot ask and --yes was not given", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(["export", "--format", "csv", "--out", "./ledger-copy.csv"])).toBe(
      EXIT.noTty,
    );
    expect(h.text()).toContain("--yes");
  });

  it("does not ask for a destination outside any repository", async () => {
    await mkdir(outside, { recursive: true });
    const target = join(outside, `atlas-export-${process.pid}.csv`);
    const h = harness({ events: seed(), confirm: false });
    expect(await h.exec(["export", "--format", "csv", "--out", target])).toBe(0);
    expect(h.text()).not.toContain("dentro del repositorio");
    await rm(target, { force: true });
  });
});
