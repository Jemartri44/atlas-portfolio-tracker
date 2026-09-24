// The ECB rate proposed and checked when recording from the console
// (feature 012, block 3), over a real folder with the synthetic history.

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

const catalogueLines = [
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
  line(
    {
      type: "asset_created",
      asset_id: "fund",
      asset_type: "fund",
      book: "core",
      asset_class: "equity",
      name: "Fondo",
      currency: "EUR",
      transferable: true,
      active: true,
    },
    "01ARYZ6S41TSV4RRFFQ69G5FA2",
  ),
  line(
    {
      type: "asset_created",
      asset_id: "uk",
      asset_type: "stock",
      book: "core",
      asset_class: "equity",
      name: "UK",
      currency: "GBP",
      transferable: false,
      active: true,
    },
    "01ARYZ6S41TSV4RRFFQ69G5FA3",
  ),
];

const setup = async (withHistory = true) => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-rates-"));
  const ledger = join(dir, "ledger.jsonl");
  await writeFile(ledger, `${catalogueLines.join("\n")}\n`);
  if (withHistory) {
    await new FileEcbHistoryStore(dir).activate({
      source: "zip",
      bytes: await readFile(join(fixtures, "eurofxref-hist.csv")),
      url: "https://example.invalid/hist.zip",
      fetched_at: "2026-04-01T10:00:00.000Z",
    });
  }
  const atlas = async (answer: boolean | undefined, ...argv: string[]) => {
    const lines: string[] = [];
    const io: Io = {
      out: (t) => lines.push(t),
      err: (t) => lines.push(t),
      confirm: async () => answer,
    };
    const code = await run(["--ledger", ledger, ...argv], io);
    return { code, text: lines.join("\n") };
  };
  const last = async (): Promise<Record<string, unknown>> => {
    const lines = (await readFile(ledger, "utf8")).trimEnd().split("\n");
    return JSON.parse(lines[lines.length - 1] as string);
  };
  return { atlas, last };
};

const buy = (asset: string, currency: string, trade: string, value: string) => [
  "add",
  "buy",
  "--account",
  "acc",
  "--asset",
  asset,
  "--trade-date",
  trade,
  "--value-date",
  value,
  "--quantity",
  "1",
  "--unit-price",
  "100",
  "--currency",
  currency,
];

describe("atlas add with the ECB history", () => {
  it("proposes the official rate of the fiscal date and records it as the history writes it", async () => {
    const { atlas, last } = await setup();
    const result = await atlas(
      undefined,
      ...buy("gold", "USD", "2026-01-02", "2026-01-06"),
      "--yes",
    );
    expect(result.code).toBe(0);
    expect(result.text).toContain(
      "Tipo del BCE propuesto para USD: 1.1169 del 02/01/2026, el publicado en o antes de la fecha fiscal (02/01/2026)",
    );
    expect(await last()).toMatchObject({ fx_rate: "1.1169", fx_rate_date: "2026-01-02" });
  });

  it("dates a purchase in euros from its fiscal date, not from trade_date (mutant 19)", async () => {
    const { atlas, last } = await setup(false);
    // A fund: fiscal date = value date, a Saturday → the Friday before.
    expect(
      await atlas(undefined, ...buy("fund", "EUR", "2026-01-02", "2026-01-10"), "--yes"),
    ).toMatchObject({ code: 0 });
    expect(await last()).toMatchObject({ fx_rate: "1", fx_rate_date: "2026-01-09" });
  });

  it("asks for the explicit yes when the typed rate is not the official one (mutant 6)", async () => {
    const { atlas, last } = await setup();
    const typed = [
      ...buy("gold", "USD", "2026-01-02", "2026-01-06"),
      "--fx-rate",
      "1.2",
      "--fx-rate-date",
      "2026-01-02",
    ];
    const noTty = await atlas(undefined, ...typed, "--yes");
    expect(noTty.code).toBe(4);
    expect(noTty.text).toContain("el BCE publicó 1.1169 el 02/01/2026");
    expect(noTty.text).toContain("--confirm-fx-rate (--yes no basta");
    const declined = await atlas(false, ...typed, "--yes");
    expect(declined.text).toContain("Cancelado.");
    const confirmed = await atlas(undefined, ...typed, "--yes", "--confirm-fx-rate");
    expect(confirmed.code).toBe(0);
    expect(await last()).toMatchObject({ fx_rate: "1.2" });
  });

  it("does not ask when the typed rate is the same number: 0.85950 is 0.8595", async () => {
    const { atlas, last } = await setup();
    const typed = [
      ...buy("uk", "GBP", "2026-01-05", "2026-01-07"),
      "--fx-rate",
      "0.85950",
      "--fx-rate-date",
      "2026-01-05",
    ];
    const result = await atlas(undefined, ...typed, "--yes");
    expect(result.code).toBe(0);
    expect(result.text).not.toContain("no es el oficial");
    expect(await last()).toMatchObject({ fx_rate: "0.85950" });
  });

  it("does not record a rate nobody typed and the ECB has not published yet", async () => {
    const { atlas } = await setup();
    const result = await atlas(
      undefined,
      ...buy("gold", "USD", "2026-04-01", "2026-04-03"),
      "--yes",
    );
    expect(result.code).toBe(1);
    expect(result.text).toContain("El BCE todavía no ha publicado el tipo de USD del 01/04/2026");
    const typed = await atlas(
      undefined,
      ...buy("gold", "USD", "2026-04-01", "2026-04-03"),
      "--fx-rate",
      "1.1",
      "--fx-rate-date",
      "2026-04-01",
      "--yes",
    );
    expect(typed.code).toBe(0);
    expect(typed.text).toContain("el tecleado no se puede comprobar contra el oficial");
  });

  it("asks the same yes when a correction leaves a rate that is not the official one", async () => {
    const { atlas, last } = await setup();
    await atlas(undefined, ...buy("gold", "USD", "2026-01-02", "2026-01-06"), "--yes");
    const id = String((await last()).id);
    const edit = await atlas(
      undefined,
      "edit",
      id,
      "--reason",
      "tipo",
      "--fx-rate",
      "1.3",
      "--yes",
    );
    expect(edit.code).toBe(4);
    expect(edit.text).toContain("el BCE publicó 1.1169");
    const confirmed = await atlas(
      undefined,
      "edit",
      id,
      "--reason",
      "tipo",
      "--fx-rate",
      "1.3",
      "--yes",
      "--confirm-fx-rate",
    );
    expect(confirmed.code).toBe(0);
  });

  it("proposes nothing without a history: the rate is typed as always", async () => {
    const { atlas } = await setup(false);
    const result = await atlas(
      undefined,
      ...buy("gold", "USD", "2026-01-02", "2026-01-06"),
      "--yes",
    );
    expect(result.code).toBe(1);
    expect(result.text).not.toContain("propuesto");
    expect(result.text).toContain("fx_rate");
  });
});

describe("atlas check and the ECB rates (block 4)", () => {
  it("contrasts the rates with the history, in Spanish, and says until when", async () => {
    const { atlas } = await setup();
    await atlas(undefined, ...buy("gold", "USD", "2026-01-02", "2026-01-06"), "--yes");
    await atlas(
      undefined,
      ...buy("gold", "USD", "2026-01-05", "2026-01-07"),
      "--fx-rate",
      "1.1169",
      "--fx-rate-date",
      "2026-01-02",
      "--yes",
      "--confirm-fx-rate",
    );
    const deep = await atlas(undefined, "check", "--deep");
    expect(deep.text).toContain("fx_rate_date_not_latest");
    expect(deep.text).toContain(
      "para la fecha fiscal (05/01/2026) el tipo aplicable es 1.1182 del 05/01/2026, no el del 02/01/2026",
    );
    expect(deep.text).toContain(
      "Tipos del BCE: 2 contrastados con el histórico oficial, que llega hasta el 31/03/2026.",
    );
    expect(deep.text).not.toContain("is the one of");
  });

  it("never says «sin hallazgos» of rates nobody contrasted (mutants 9 and 25)", async () => {
    const { atlas } = await setup(false);
    await atlas(
      undefined,
      ...buy("gold", "USD", "2026-01-02", "2026-01-06"),
      "--fx-rate",
      "1.1",
      "--fx-rate-date",
      "2026-01-02",
      "--yes",
    );
    const plain = await atlas(undefined, "check");
    expect(plain.text).not.toContain("sin hallazgos");
    expect(plain.text).toContain("Libro íntegro en lo comprobado.");
    expect(plain.text).toContain("Tipos del BCE sin contrastar (1): atlas check no los contrasta");
    const deep = await atlas(undefined, "check", "--deep");
    expect(deep.text).not.toContain("sin hallazgos");
    expect(deep.text).toContain(
      "Tipos del BCE sin contrastar (1): no hay histórico junto al libro",
    );
  });

  it("says «sin hallazgos» when there is nothing in another currency to contrast", async () => {
    const { atlas } = await setup(false);
    await atlas(undefined, ...buy("fund", "EUR", "2026-01-02", "2026-01-06"), "--yes");
    expect((await atlas(undefined, "check")).text).toBe("Libro íntegro: sin hallazgos.");
  });
});

describe("the tax report and the ECB rates (block 4)", () => {
  it("notes the sale whose purchase has a rate that is not the official one, and moves no figure", async () => {
    const { atlas } = await setup();
    await atlas(
      undefined,
      ...buy("gold", "USD", "2026-01-02", "2026-01-06"),
      "--fx-rate",
      "1.2",
      "--fx-rate-date",
      "2026-01-02",
      "--yes",
      "--confirm-fx-rate",
    );
    const sell = [
      "add",
      "sell",
      "--account",
      "acc",
      "--asset",
      "gold",
      "--trade-date",
      "2026-02-02",
      "--value-date",
      "2026-02-04",
      "--quantity",
      "1",
      "--unit-price",
      "120",
      "--currency",
      "USD",
      "--yes",
    ];
    expect((await atlas(undefined, ...sell)).code).toBe(0);
    const report = await atlas(undefined, "tax", "2026");
    expect(report.code).toBe(0);
    expect(report.text).toContain(
      "Esta línea depende de un tipo del BCE que no es el oficial de su fecha (fx_rate_mismatch",
    );
    expect(report.text).toContain("La cifra se calcula con el tipo del libro");
  });
});
