// Drafts from the console (feature 012, block 5; ADR-0029, point 9): over a
// real folder with the synthetic history, and a double of the ECB source —
// no test touches the network. Mutants 12 and 23 of prompt 012 §5.

import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FileEcbHistoryStore, LOCK_FILE } from "@atlas/adapters";
import type { FxRateSource } from "@atlas/domain/ecb";
import { describe, expect, it } from "vitest";
import type { Io } from "../../src/context.js";
import { run } from "../../src/main.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../tests/fixtures/ecb");

const line = (fields: Record<string, unknown>, id: string): string =>
  JSON.stringify({ schema_version: 1, id, recorded_at: "2026-01-01T10:00:00.000Z", ...fields });

const catalogue = [
  line(
    {
      type: "account_created",
      account_id: "acc",
      name: "IBKR",
      platform: "ibkr",
      book: "core",
      base_currency: "EUR",
      country: "IE",
      active: true,
    },
    "01ARYZ6S41TSV4RRFFQ69G5FA0",
  ),
  line(
    {
      type: "asset_created",
      asset_id: "gold",
      asset_type: "etc",
      book: "core",
      asset_class: "gold",
      name: "Oro",
      currency: "USD",
      transferable: false,
      active: true,
    },
    "01ARYZ6S41TSV4RRFFQ69G5FA1",
  ),
];

/** The fixture reaches 2026-03-31; this one adds 2026-04-01, dollar at 1.1104. */
const laterCsv = async (): Promise<Buffer> => {
  const [header, newest, ...rest] = (
    await readFile(join(fixtures, "eurofxref-hist.csv"), "utf8")
  ).split("\n");
  const next = (newest as string).replace("2026-03-31,1.1091,", "2026-04-01,1.1104,");
  return Buffer.from([header, next, newest, ...rest].join("\n"));
};

const source =
  (bytes: Buffer): (() => FxRateSource) =>
  () => ({
    download: async () => ({
      source: "zip",
      url: "https://example.invalid/hist.zip",
      fetched_at: "2026-04-02T10:00:00.000Z",
      bytes,
    }),
  });

const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-012-draft-"));
  const ledger = join(dir, "ledger.jsonl");
  await writeFile(ledger, `${catalogue.join("\n")}\n`);
  await new FileEcbHistoryStore(dir).activate({
    source: "zip",
    bytes: await readFile(join(fixtures, "eurofxref-hist.csv")),
    url: "https://example.invalid/hist.zip",
    fetched_at: "2026-04-01T10:00:00.000Z",
  });
  const atlas = async (
    options: { answer?: boolean; fx?: () => FxRateSource },
    ...argv: string[]
  ) => {
    const out: string[] = [];
    const err: string[] = [];
    const io: Io = {
      out: (t) => out.push(t),
      err: (t) => err.push(t),
      confirm: async () => options.answer,
    };
    const code = await run(["--ledger", ledger, ...argv], io, undefined, options.fx);
    return { code, out: out.join("\n"), err: err.join("\n"), text: [...out, ...err].join("\n") };
  };
  const ledgerText = () => readFile(ledger, "utf8");
  const drafts = async () => readdir(join(dir, "drafts")).catch(() => [] as string[]);
  return { dir, atlas, ledgerText, drafts };
};

const goldBuy = [
  "add",
  "buy",
  "--account",
  "acc",
  "--asset",
  "gold",
  "--trade-date",
  "2026-04-01",
  "--value-date",
  "2026-04-03",
  "--quantity",
  "1",
  "--unit-price",
  "100",
  "--currency",
  "USD",
];

const idOf = (text: string): string => {
  const match = /borrador ([0-9A-Z]{26})/.exec(text);
  if (match === null) {
    throw new Error(`no draft id in: ${text}`);
  }
  return match[1] as string;
};

describe("atlas add --draft", () => {
  it("says how to keep it as a draft, and keeps nothing without being told", async () => {
    const { atlas, ledgerText, drafts } = await setup();
    const before = await ledgerText();
    const result = await atlas({}, ...goldBuy, "--yes");
    expect(result.code).toBe(1);
    expect(result.text).toContain("repite el comando con --draft");
    expect(await ledgerText()).toBe(before);
    expect(await drafts()).toEqual([]);
  });

  it("keeps the operation without a rate, outside the ledger", async () => {
    const { atlas, ledgerText, drafts, dir } = await setup();
    const before = await ledgerText();
    const result = await atlas({}, ...goldBuy, "--draft");
    expect(result.code).toBe(0);
    const id = idOf(result.out);
    expect(await drafts()).toEqual([`${id}.json`]);
    const saved = JSON.parse(await readFile(join(dir, "drafts", `${id}.json`), "utf8"));
    expect(saved.event).not.toHaveProperty("fx_rate");
    expect(saved.event).not.toHaveProperty("fx_rate_date");
    expect(await ledgerText()).toBe(before);
  });

  it("is refused for an operation whose rate is already published", async () => {
    const { atlas, drafts } = await setup();
    const published = goldBuy.map((word) => (word === "2026-04-01" ? "2026-03-31" : word));
    const result = await atlas({}, ...published, "--draft");
    expect(result.code).toBe(64);
    expect(await drafts()).toEqual([]);
  });

  it("writes no draft while the folder is locked (mutant 23)", async () => {
    const { atlas, drafts, dir } = await setup();
    await writeFile(
      join(dir, LOCK_FILE),
      `${JSON.stringify({ holder: "cli", token: "other", since: "2026-04-01T10:00:00.000Z" })}\n`,
    );
    expect((await atlas({}, ...goldBuy, "--draft")).code).toBe(6);
    expect(await drafts()).toEqual([]);
  });
});

describe("a pending draft (mutant 12)", () => {
  it("counts in no figure, and every command reminds it", async () => {
    const { atlas } = await setup();
    const positions = await atlas({}, "positions");
    const cash = await atlas({}, "cash");
    await atlas({}, ...goldBuy, "--draft");
    const after = await atlas({}, "positions");
    expect(after.out).toBe(positions.out);
    expect((await atlas({}, "cash")).out).toBe(cash.out);
    // Said always, on the error channel so that --json stays clean.
    expect(after.err).toContain("Pendiente: hay un borrador sin registrar en drafts/");
    const json = await atlas({}, "positions", "--json");
    expect(() => JSON.parse(json.out)).not.toThrow();
    // Also after a command that failed.
    expect((await atlas({}, "positions", "--date", "nope")).err).toContain("Pendiente");
  });

  it("is never confirmed by itself, not even when its rate arrives", async () => {
    const { atlas, ledgerText, drafts } = await setup();
    const id = idOf((await atlas({}, ...goldBuy, "--draft")).out);
    const waiting = await atlas({}, "draft", "list");
    expect(waiting.out).toContain("Esperando el tipo de USD del 01/04/2026");
    expect(waiting.err).not.toContain("Pendiente"); // the list says it itself
    expect((await atlas({}, "draft", "confirm", id, "--yes")).code).toBe(1);

    const before = await ledgerText();
    const update = await atlas({ fx: source(await laterCsv()) }, "fx", "update");
    expect(update.code).toBe(0);
    expect(await ledgerText()).toBe(before);
    expect(await drafts()).toEqual([`${id}.json`]);
    expect((await atlas({}, "draft", "list")).out).toContain(
      "se puede registrar con `atlas draft confirm`. USD: 1.1104 del 01/04/2026.",
    );
    expect(await ledgerText()).toBe(before);
  });

  it("is recorded with the official rate on confirm, and then leaves drafts/", async () => {
    const { atlas, ledgerText, drafts } = await setup();
    const id = idOf((await atlas({}, ...goldBuy, "--draft")).out);
    await atlas({ fx: source(await laterCsv()) }, "fx", "update");
    const declined = await atlas({ answer: false }, "draft", "confirm", id);
    expect(declined.out).toContain("Cancelado.");
    expect(await drafts()).toEqual([`${id}.json`]);
    const confirmed = await atlas({}, "draft", "confirm", id, "--yes");
    expect(confirmed.code).toBe(0);
    expect(confirmed.out).toContain("Tipo del BCE propuesto para USD: 1.1104 del 01/04/2026");
    expect(confirmed.out).toContain(`Borrador ${id} registrado`);
    const last = JSON.parse((await ledgerText()).trimEnd().split("\n").pop() as string);
    expect(last).toMatchObject({ type: "buy", fx_rate: "1.1104", fx_rate_date: "2026-04-01" });
    expect(await drafts()).toEqual([]);
    expect((await atlas({}, "positions")).err).not.toContain("Pendiente");
  });

  it("left in both places by a cut, is caught by the fingerprint on the second confirm", async () => {
    const { atlas, drafts, dir, ledgerText } = await setup();
    const id = idOf((await atlas({}, ...goldBuy, "--draft")).out);
    const file = join(dir, "drafts", `${id}.json`);
    const copy = await readFile(file);
    await atlas({ fx: source(await laterCsv()) }, "fx", "update");
    await atlas({}, "draft", "confirm", id, "--yes");
    // The cut: the ledger has the line and the draft is still there.
    await writeFile(file, copy);
    const lines = (await ledgerText()).split("\n").length;
    const again = await atlas({}, "draft", "confirm", id, "--yes");
    expect(again.code).toBe(3);
    expect((await ledgerText()).split("\n").length).toBe(lines);
    expect(await drafts()).toEqual([`${id}.json`]);
  });

  it("can be discarded, after a yes", async () => {
    const { atlas, drafts, ledgerText } = await setup();
    const before = await ledgerText();
    const id = idOf((await atlas({}, ...goldBuy, "--draft")).out);
    expect((await atlas({ answer: false }, "draft", "discard", id)).out).toContain("Cancelado.");
    expect(await drafts()).toEqual([`${id}.json`]);
    expect((await atlas({}, "draft", "discard", id, "--yes")).out).toContain("descartado");
    expect(await drafts()).toEqual([]);
    expect(await ledgerText()).toBe(before);
    expect((await atlas({}, "draft", "discard", id, "--yes")).code).toBe(1);
    expect((await atlas({}, "draft", "discard")).code).toBe(64);
    expect((await atlas({}, "draft", "list")).out).toContain("No hay borradores pendientes.");
  });

  it("names a draft file it cannot read, in the list and in the reminder", async () => {
    const { atlas, dir } = await setup();
    await atlas({}, ...goldBuy, "--draft");
    await writeFile(join(dir, "drafts", "01K00000000000000000000009.json"), "{");
    expect((await atlas({}, "draft", "list")).out).toContain(
      "drafts/01K00000000000000000000009.json no se puede leer",
    );
    expect((await atlas({}, "positions")).err).toContain("hay 2 borradores");
  });
});
