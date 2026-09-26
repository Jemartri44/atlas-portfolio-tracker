// Feature 015, E3, block 4: `atlas sync …` end to end, the console syncing its
// folder with the API composed with its doubles (`apps/api/test/harness.ts`).
// Each order explicit; `sync/remote.json` written by initialising and joining,
// first of their one write (P16); the session of the folder by identity (B2);
// and the four states of plan §7, each recognised and failsafe.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { encodeLine, type LedgerEvent } from "@atlas/domain";
import { markerFor, serializeMarker } from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import { SELF } from "../../../api/test/harness.js";
import { CLI_SETTINGS, Events } from "../events.js";
import { type ConsoleUnderTest, setupConsole } from "../support/console.js";

const LEDGER_KEY = "ledger/ledger.jsonl";

const base = (): string[] => {
  const b = new Events();
  b.settings(CLI_SETTINGS);
  b.account("acc_ib", "IE");
  b.deposit("acc_ib", "2027-01-04", "70000");
  return b.build().map(encodeLine);
};

/** A deposit of its own id and fingerprint: two consoles never collide unless asked. */
const deposit = (n: number, amount: string, fingerprint = `sha256:deposit-${n}`): string =>
  encodeLine({
    schema_version: 1,
    id: `01ARYZ6S41TSV4RRFFQ6${String(n).padStart(6, "0")}`,
    recorded_at: "2026-09-20T10:00:00.000Z",
    type: "cash_deposit",
    account_id: "acc_ib",
    value_date: "2027-02-01",
    amount,
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2027-02-01",
    fingerprint,
  } as unknown as LedgerEvent);

const textOf = (lines: readonly string[]) => lines.map((line) => `${line}\n`).join("");
const ledgerFile = (c: ConsoleUnderTest) => join(c.ledger, "ledger.jsonl");
const readLedger = (c: ConsoleUnderTest) => readFile(ledgerFile(c), "utf8");
const append = async (c: ConsoleUnderTest, lines: readonly string[]) =>
  writeFile(ledgerFile(c), (await readLedger(c)) + textOf(lines));

/** A console signed in from its folder, with a ledger of its own. */
const console_ = async (lines: readonly string[] = base()) => {
  const c = await setupConsole();
  await writeFile(ledgerFile(c), textOf(lines));
  expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
  return c;
};

describe("atlas sync, from the first console", () => {
  it("refuses before the folder chose to sync, and initialises only when told, naming the origin", async () => {
    const c = await console_();
    expect(await c.exec(["sync"])).toBe(1);
    expect(c.err.join("\n")).toContain("sync_not_configured");
    expect(await c.exec(["sync", "init"])).toBe(1);
    expect(c.err.join("\n")).toContain("sync_origin_missing");
    expect(await c.exec(["sync", "init", "--origin", SELF])).toBe(0);
    expect(c.api.s3.text(LEDGER_KEY)).toBe(await readLedger(c));
    const remote = JSON.parse(await readFile(join(c.ledger, "sync", "remote.json"), "utf8"));
    const [entry] = Object.values((await c.readCredentialsFile()).entries) as {
      device_id: string;
    }[];
    expect(remote).toEqual({ format: 1, origin: SELF, device_id: entry?.device_id });
    expect(await c.exec(["sync", "init", "--origin", SELF])).toBe(1);
    expect(c.err.join("\n")).toContain("sync_already_configured");
  });

  it("uploads what the folder added, and says what is pending and when it synced", async () => {
    const c = await console_();
    await c.exec(["sync", "init", "--origin", SELF]);
    await append(c, [deposit(1, "10")]);
    c.out.length = 0;
    expect(await c.exec(["sync", "status"])).toBe(0);
    expect(c.out.join("\n")).toContain("Pendientes: 1");
    expect(await c.exec(["sync"])).toBe(0);
    expect(c.out.join("\n")).toContain("1 líneas subidas");
    expect(c.api.s3.text(LEDGER_KEY)).toBe(await readLedger(c));
    // The token went only to its origin, only in its header, never followed a redirect.
    expect(c.seen.every((request) => request.url.startsWith(`${SELF}/api/`))).toBe(true);
    expect(c.seen.every((request) => request.redirect === "error")).toBe(true);
  });

  it("refuses to initialise over a remote that has another ledger, and sends to join", async () => {
    const c = await console_();
    c.api.s3.seed(LEDGER_KEY, textOf([...base(), deposit(9, "99")]));
    expect(await c.exec(["sync", "init", "--origin", SELF])).toBe(1);
    expect(c.err.join("\n")).toContain("init_remote_not_empty");
    expect(c.err.join("\n")).toContain("atlas sync join --from-remote");
  });
});

describe("the four states of plan §7, each recognised", () => {
  it("S1 after an initialisation cut before the marker: init finishes it, by the bytes", async () => {
    const c = await console_();
    const [entry] = Object.values((await c.readCredentialsFile()).entries) as {
      device_id: string;
    }[];
    // Cut after uploading and after remote.json, before the marker.
    c.api.s3.seed(LEDGER_KEY, await readLedger(c));
    await mkdir(join(c.ledger, "sync"));
    await writeFile(
      join(c.ledger, "sync", "remote.json"),
      `{"format":1,"origin":"${SELF}","device_id":"${entry?.device_id}"}\n`,
    );
    // A sync reconstructs the marker too; init says it finished it.
    expect(await c.exec(["sync", "init"])).toBe(0);
    expect(c.out.join("\n")).toContain("Inicialización terminada");
    const marker = JSON.parse(await readFile(join(c.ledger, "sync", "state.json"), "utf8"));
    expect(marker.synced_lines).toBe(base().length);
  });

  it("S1 with another origin asked: refused, remote.json says which", async () => {
    const c = await console_();
    const [entry] = Object.values((await c.readCredentialsFile()).entries) as {
      device_id: string;
    }[];
    await mkdir(join(c.ledger, "sync"));
    await writeFile(
      join(c.ledger, "sync", "remote.json"),
      `{"format":1,"origin":"${SELF}","device_id":"${entry?.device_id}"}\n`,
    );
    expect(await c.exec(["sync", "init", "--origin", "https://other.example"])).toBe(1);
    expect(c.err.join("\n")).toContain("sync_remote_mismatch");
  });

  it("S3, a folder of feature 014 synced without remote.json: nothing deduced, join associates it", async () => {
    const c = await console_();
    c.api.s3.seed(LEDGER_KEY, await readLedger(c));
    await mkdir(join(c.ledger, "sync"));
    const lines = base();
    await writeFile(
      join(c.ledger, "sync", "state.json"),
      serializeMarker(markerFor(lines, lines.length)),
    );
    for (const argv of [["sync"], ["sync", "init", "--origin", SELF], ["sync", "redownload"]]) {
      c.err.length = 0;
      expect(await c.exec(argv), argv.join(" ")).toBe(1);
      expect(c.err.join("\n")).toContain("sync_remote_unknown");
    }
    expect(await c.exec(["sync", "join", "--from-remote", "--origin", SELF])).toBe(0);
    expect(await readFile(join(c.ledger, "sync", "remote.json"), "utf8")).toContain(SELF);
    expect(await c.exec(["sync"])).toBe(0);
  });
});

describe("the session of the folder (B2)", () => {
  it("never starts with the session of another folder, even the only one of that origin", async () => {
    const c = await console_();
    const other = join(c.root, "otra");
    await mkdir(other);
    await writeFile(join(other, "ledger.jsonl"), textOf(base()));
    c.err.length = 0;
    const code = await c.exec([
      "--ledger",
      join(other, "ledger.jsonl"),
      "sync",
      "init",
      "--origin",
      SELF,
    ]);
    expect(code).toBe(1);
    expect(c.err.join("\n")).toContain("credentials_no_entry_for_folder");
  });

  it("says the token is missing when remote.json names a device without one", async () => {
    const c = await console_();
    await c.exec(["sync", "init", "--origin", SELF]);
    await c.exec(["remote", "logout", "--local-only"]);
    c.err.length = 0;
    expect(await c.exec(["sync"])).toBe(1);
    expect(c.err.join("\n")).toContain("sync_credential_missing");
  });
});

describe("what is held, resolved from the console", () => {
  it("lists it with its reason, confirms it, and uploads it on the next sync", async () => {
    const c = await console_();
    await c.exec(["sync", "init", "--origin", SELF]);
    // Another device uploaded the same operation first.
    const twin = deposit(20, "50", "sha256:twin");
    const remoteText = c.api.s3.text(LEDGER_KEY) as string;
    c.api.s3.seed(LEDGER_KEY, remoteText + textOf([twin]));
    await append(c, [deposit(21, "50", "sha256:twin")]);
    expect(await c.exec(["sync"])).toBe(0);
    expect(c.out.join("\n")).toContain("Retenida (new_duplicate)");
    c.out.length = 0;
    expect(await c.exec(["sync", "held"])).toBe(0);
    const unit = /Unidad ([0-9a-f]{64})/.exec(c.out.join("\n"))?.[1] as string;
    expect(c.out.join("\n")).toContain("Se puede: confirmar, rehacer, descartar");
    expect(await c.exec(["sync", "confirm", unit])).toBe(0);
    expect(await c.exec(["sync"])).toBe(0);
    expect(c.api.s3.text(LEDGER_KEY)).toContain(deposit(21, "50", "sha256:twin"));
  });

  it("redoes it, showing the plan and asking, with the sealed id", async () => {
    const c = await console_();
    await c.exec(["sync", "init", "--origin", SELF]);
    const remoteText = c.api.s3.text(LEDGER_KEY) as string;
    c.api.s3.seed(LEDGER_KEY, remoteText + textOf([deposit(30, "5", "sha256:same")]));
    await append(c, [deposit(31, "5", "sha256:same")]);
    await c.exec(["sync"]);
    await c.exec(["sync", "held"]);
    const unit = /Unidad ([0-9a-f]{64})/.exec(c.out.join("\n"))?.[1] as string;
    c.out.length = 0;
    // Without a terminal and without --yes, nothing is recorded.
    expect(await c.exec(["sync", "redo", unit])).toBe(4);
    const before = await readLedger(c);
    expect(await c.exec(["--yes", "--confirm-duplicate", "sync", "redo", unit])).toBe(0);
    expect(c.out.join("\n")).toContain("Se registrará la operación");
    const recorded = (await readLedger(c)).slice(before.length);
    const sealed = /Se registrará la operación ([0-9A-Z]{26})/.exec(c.out.join("\n"))?.[1];
    expect(recorded).toContain(sealed as string);
    expect(await c.exec(["sync", "held"])).toBe(0);
    expect(c.out.join("\n")).toContain("No hay nada retenido");
  });

  it("discards it, and it stays in sync/discarded.jsonl", async () => {
    const c = await console_();
    await c.exec(["sync", "init", "--origin", SELF]);
    const remoteText = c.api.s3.text(LEDGER_KEY) as string;
    c.api.s3.seed(LEDGER_KEY, remoteText + textOf([deposit(40, "5", "sha256:d")]));
    await append(c, [deposit(41, "5", "sha256:d")]);
    await c.exec(["sync"]);
    await c.exec(["sync", "held"]);
    const unit = /Unidad ([0-9a-f]{64})/.exec(c.out.join("\n"))?.[1] as string;
    expect(await c.exec(["sync", "discard", unit])).toBe(0);
    const discarded = (await readFile(join(c.ledger, "sync", "discarded.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((record) => JSON.parse(record).line);
    expect(discarded).toEqual([deposit(41, "5", "sha256:d")]);
  });
});

describe("deactivating and coming back", () => {
  it("deactivates only without pending lines, and the way back is joining, said with its order", async () => {
    const c = await console_();
    await c.exec(["sync", "init", "--origin", SELF]);
    await append(c, [deposit(50, "1")]);
    expect(await c.exec(["sync", "deactivate"])).toBe(1);
    expect(c.err.join("\n")).toContain("deactivate_refused_pending");
    await c.exec(["sync"]);
    expect(await c.exec(["sync", "deactivate"])).toBe(0);
    c.err.length = 0;
    expect(await c.exec(["sync"])).toBe(1);
    expect(c.err.join("\n")).toContain("sync_deactivated");
    expect(c.err.join("\n")).toContain("atlas sync join --from-remote");
    expect(c.err.join("\n")).toContain("atlas sync join --with-own-lines");
    expect(await c.exec(["sync", "join", "--from-remote"])).toBe(0);
    expect(await c.exec(["sync"])).toBe(0);
  });

  it("downloads again only when asked, after the remote was rewritten", async () => {
    const c = await console_();
    await c.exec(["sync", "init", "--origin", SELF]);
    await append(c, [deposit(60, "1")]);
    await c.exec(["sync"]);
    // An administration rewrite: the remote without the last line.
    c.api.s3.seed(LEDGER_KEY, textOf(base()));
    c.err.length = 0;
    expect(await c.exec(["sync"])).toBe(1);
    expect(c.err.join("\n")).toContain("remote_rewritten");
    expect(await c.exec(["sync", "redownload"])).toBe(0);
    expect(await readLedger(c)).toBe(textOf(base()));
    expect(await c.exec(["sync", "held"])).toBe(0);
    expect(c.out.join("\n")).toContain("absent_after_rewrite");
  });
});
