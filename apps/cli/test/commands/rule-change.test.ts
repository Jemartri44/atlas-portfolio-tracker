// The ECB rates after a change of `fiscal_date_rule`, from the console
// (feature 012, block 6; ADR-0029, point 10; criterion 25), over a real folder
// with the synthetic history. Mutants 15 and 20 of prompt 012 §5.

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FileEcbHistoryStore } from "@atlas/adapters";
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

/** A purchase of gold on Friday 2026-01-02, settled on Tuesday the 6th, at the rate of the 2nd. */
const goldBuy = [
  "add",
  "buy",
  "--account",
  "acc",
  "--asset",
  "gold",
  "--trade-date",
  "2026-01-02",
  "--value-date",
  "2026-01-06",
  "--quantity",
  "1",
  "--unit-price",
  "100",
  "--currency",
  "USD",
  "--fx-rate",
  "1.1169",
  "--fx-rate-date",
  "2026-01-02",
  "--yes",
];

const setup = async (withHistory = true) => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-012-rule-"));
  const ledger = join(dir, "ledger.jsonl");
  await writeFile(ledger, `${catalogue.join("\n")}\n`);
  if (withHistory) {
    await new FileEcbHistoryStore(dir).activate({
      source: "zip",
      bytes: await readFile(join(fixtures, "eurofxref-hist.csv")),
      url: "https://example.invalid/hist.zip",
      fetched_at: "2026-04-01T10:00:00.000Z",
    });
  }
  const atlas = async (answers: (boolean | undefined)[], ...argv: string[]) => {
    const lines: string[] = [];
    /** What had been said when each question was asked. */
    const asked: string[] = [];
    const queue = [...answers];
    const io: Io = {
      out: (t) => lines.push(t),
      err: (t) => lines.push(t),
      confirm: async (question) => {
        asked.push(`${lines.join("\n")}\n${question}`);
        return queue.shift();
      },
    };
    const code = await run(["--ledger", ledger, ...argv], io);
    return { code, text: lines.join("\n"), asked };
  };
  const text = () => readFile(ledger, "utf8");
  expect((await atlas([], ...goldBuy)).code).toBe(0);
  const id = String(JSON.parse((await text()).trimEnd().split("\n").at(-1) as string).id);
  return { atlas, text, id };
};

describe("atlas settings set --fiscal-date-rule and the ECB rates (mutant 15)", () => {
  it("says, before the question, which lines stop having the rate of their fiscal date", async () => {
    const { atlas, text, id } = await setup();
    const before = await text();
    const declined = await atlas(
      [false],
      "settings",
      "set",
      "--fiscal-date-rule",
      "etc=value_date",
    );
    expect(declined.asked).toHaveLength(1);
    const first = declined.asked[0] as string;
    expect(first).toContain("deja una línea con un tipo del BCE");
    expect(first).toContain(
      `${id} fx_rate (USD): 1.1169 del 02/01/2026; su fecha fiscal pasa del 02/01/2026 al 06/01/2026. Deja de ser el tipo de su fecha fiscal. El oficial es 1.1195 del 06/01/2026.`,
    );
    expect(declined.text).toContain("Cancelado.");
    expect(await text()).toBe(before);

    const accepted = await atlas(
      [],
      "settings",
      "set",
      "--fiscal-date-rule",
      "etc=value_date",
      "--yes",
    );
    expect(accepted.code).toBe(0);
    expect(accepted.text).toContain("Para proponer su corrección: `atlas fx correct`");
    // Nothing recalculated, nothing corrected: only the settings were written.
    const after = (await text()).trimEnd().split("\n");
    expect(after).toHaveLength(before.trimEnd().split("\n").length + 1);
    expect(JSON.parse(after.at(-1) as string).type).toBe("settings_changed");
  });

  it("without a history, says what is known and what cannot be verified", async () => {
    const { atlas } = await setup(false);
    const result = await atlas([false], "settings", "set", "--fiscal-date-rule", "etc=value_date");
    expect(result.asked[0]).toContain("No se puede verificar contra el oficial.");
    expect(result.asked[0]).toContain("Sin histórico del BCE junto al libro");
  });

  it("asks nothing more for a change that moves no fiscal date", async () => {
    const { atlas } = await setup();
    const result = await atlas(
      [],
      "settings",
      "set",
      "--fiscal-date-rule",
      "fund=trade_date",
      "--yes",
    );
    expect(result.code).toBe(0);
    expect(result.text).not.toContain("criterio 25");
  });
});

describe("atlas fx correct (mutant 20)", () => {
  it("proposes the whole chain and writes it in one go after a yes", async () => {
    const { atlas, text, id } = await setup();
    await atlas([], "settings", "set", "--fiscal-date-rule", "etc=value_date", "--yes");
    const before = await text();
    const declined = await atlas([false], "fx", "correct");
    expect(declined.asked[0]).toContain(
      `${id} fx_rate (USD): 1.1169 del 02/01/2026 → 1.1195 del 06/01/2026 (fecha fiscal 06/01/2026).`,
    );
    expect(declined.text).toContain("Cancelado.");
    expect(await text()).toBe(before);

    const written = await atlas([], "fx", "correct", "--yes");
    expect(written.code).toBe(0);
    expect(written.text).toContain("Corrección escrita: 1 línea anulada y registrada de nuevo.");
    const lines = (await text())
      .trimEnd()
      .split("\n")
      .map((entry) => JSON.parse(entry));
    expect(lines.slice(-2).map((entry) => entry.type)).toEqual(["reversal", "buy"]);
    expect(lines.at(-2)).toMatchObject({
      reverses_id: id,
      reason:
        "Tipo del BCE de la fecha fiscal vigente, tras cambiar fiscal_date_rule (criterio 25)",
    });
    expect(lines.at(-1)).toMatchObject({
      corrects_id: id,
      fx_rate: "1.1195",
      fx_rate_date: "2026-01-06",
    });
    // Nothing left to correct.
    expect((await atlas([], "fx", "correct")).text).toContain("no hay nada que corregir");
  });

  it("says what it cannot correct without a history", async () => {
    const { atlas } = await setup(false);
    await atlas([], "settings", "set", "--fiscal-date-rule", "etc=value_date", "--yes");
    expect((await atlas([], "fx", "correct")).text).toContain(
      "No hay nada que se pueda corregir sin el histórico del BCE",
    );
  });
});
