// atlas weights · contribute · costs, and atlas transfer simulate.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SETTINGS } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { EXIT } from "../../src/context.js";
import { harness, seed } from "../harness.js";

const goldenLines = (): string[] =>
  readFileSync(
    join(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../../tests/fixtures/ledger"),
      "synthetic-v1.jsonl",
    ),
    "utf8",
  )
    .split("\n")
    .filter((line) => line !== "");

const DATE = "2027-06-30";

const settingsEvent = (settings: Record<string, unknown>) => ({
  schema_version: 1 as const,
  id: "01ARYZ6S41TSV4RRFFQ69G5SET",
  recorded_at: "2026-09-01T17:00:00.000Z",
  type: "settings_changed" as const,
  settings: { ...DEFAULT_SETTINGS, ...settings },
});

const CONFIG = {
  target_weights: { ast_world: "60", ast_bonds: "40" },
  bucket_pct_of_contribution: "10",
  monthly_contribution_eur: "500",
  deviation_threshold_pp: "5",
  stale_price_days: 5,
};

/** A core worth 600 EUR of ast_world and 400 of ast_bonds, priced at DATE. */
const portfolio = async (settings: Record<string, unknown> = CONFIG) => {
  const h = harness({ events: [...seed(), settingsEvent(settings)], confirm: true });
  const buy = (asset: string, quantity: string) => [
    "add",
    "buy",
    "--account",
    "acc_fund",
    "--asset",
    asset,
    "--trade-date",
    "2027-01-11",
    "--value-date",
    "2027-01-12",
    "--quantity",
    quantity,
    "--unit-price",
    "100",
    "--currency",
    "EUR",
    "--fx-rate",
    "1",
    "--fx-rate-date",
    "2027-01-12",
    "--yes",
  ];
  const value = (asset: string, quantity: string, unit: string) => [
    "add",
    "valuation",
    "--account",
    "acc_fund",
    "--asset",
    asset,
    "--date",
    DATE,
    "--quantity",
    quantity,
    "--unit-value",
    unit,
    "--currency",
    "EUR",
    "--fx-rate",
    "1",
    "--yes",
  ];
  for (const argv of [
    buy("ast_world", "6"),
    buy("ast_bonds", "4"),
    value("ast_world", "6", "100"),
    value("ast_bonds", "4", "100"),
  ]) {
    expect(await h.exec(argv)).toBe(0);
  }
  h.reset();
  return h;
};

describe("atlas weights", () => {
  it("shows value, weight, target and deviation per asset, with subtotals", async () => {
    const h = await portfolio();
    expect(await h.exec(["weights", "--date", DATE])).toBe(0);
    expect(h.text()).toContain("Pesos del núcleo a 2027-06-30");
    expect(h.text()).toMatch(/ast_world\s+equity\s+6\s+100\s+EUR\s+1\s+2027-06-30\s+0\s+600/);
    expect(h.text()).toContain("[equity]");
    expect(h.text()).toContain("TOTAL");
    expect(h.text()).toContain("1000");
  });

  it("marks a stale price and lists the warning", async () => {
    const h = await portfolio();
    expect(await h.exec(["weights", "--date", "2027-07-31"])).toBe(0);
    expect(h.text()).toContain("⚠");
    expect(h.text()).toContain("stale_price");
  });

  it("says 'sin precio' and drops the weights when an asset held has none", async () => {
    const h = await portfolio();
    expect(
      await h.exec([
        "add",
        "buy",
        "--account",
        "acc_etf",
        "--asset",
        "ast_gold",
        "--trade-date",
        "2027-01-11",
        "--value-date",
        "2027-01-12",
        "--quantity",
        "1",
        "--unit-price",
        "100",
        "--currency",
        "USD",
        "--fx-rate",
        "1.1",
        "--fx-rate-date",
        "2027-01-12",
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    expect(await h.exec(["weights", "--date", DATE])).toBe(0);
    expect(h.text()).toContain("sin precio");
    expect(h.text()).toContain("(parcial)");
    expect(h.text()).toContain("partial_core_total");
  });

  it("never prints a full 100 % over a table of zeros", async () => {
    // Target weights in force and nothing bought yet: every row is 0 %.
    const h = harness({
      events: [...seed(), settingsEvent(CONFIG)],
      confirm: true,
      instant: `${DATE}T10:00:00.000Z`,
    });
    expect(await h.exec(["weights", "--date", DATE])).toBe(0);
    expect(h.text()).not.toContain("100.00 %");
    expect(h.text()).toMatch(/TOTAL\s+0\s*$/m);
  });

  it("marks the subtotal of the class that hides a missing price", async () => {
    const h = await portfolio();
    expect(
      await h.exec([
        "add",
        "buy",
        "--account",
        "acc_etf",
        "--asset",
        "ast_gold",
        "--trade-date",
        "2027-01-11",
        "--value-date",
        "2027-01-12",
        "--quantity",
        "1",
        "--unit-price",
        "100",
        "--currency",
        "USD",
        "--fx-rate",
        "1.1",
        "--fx-rate-date",
        "2027-01-12",
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    expect(await h.exec(["weights", "--date", DATE])).toBe(0);
    // The gold subtotal says so instead of showing a clean zero.
    expect(h.text()).toMatch(/\[gold\]\s+0\s+\(parcial\)/);
    expect(h.text()).toMatch(/\[equity\]\s+600\s{2,}/);
  });

  it("answers in JSON with the rows, the subtotals and the warnings", async () => {
    const h = await portfolio();
    expect(await h.exec(["weights", "--date", DATE, "--json"])).toBe(0);
    const data = h.json() as { total_eur: string; rows: unknown[]; by_class: unknown[] };
    expect(data.total_eur).toBe("1000");
    expect(data.rows).toHaveLength(2);
    expect(data.by_class).toHaveLength(2);
    expect(h.invalidCount()).toBe(0);
  });
});

describe("atlas contribute", () => {
  it("separates the bucket budget and splits the rest, without writing", async () => {
    const h = await portfolio();
    const before = (await h.store.load()).etag;
    expect(await h.exec(["contribute", "--amount", "1000", "--date", DATE])).toBe(0);
    expect(h.text()).toContain("Presupuesto del cubo:   100 EUR");
    expect(h.text()).toContain("A repartir en el núcleo: 900 EUR");
    expect(h.text()).toContain("La propuesta no se ha registrado");
    expect((await h.store.load()).etag).toBe(before);
  });

  it("takes the amount from the settings when no flag is given", async () => {
    const h = await portfolio();
    expect(await h.exec(["contribute", "--date", DATE])).toBe(0);
    expect(h.text()).toContain("monthly_contribution_eur");
    expect(h.text()).toContain("Aportación de 500 EUR");
  });

  it("refuses without an amount, without weights and without the bucket percentage", async () => {
    const noAmount = await portfolio({ ...CONFIG, monthly_contribution_eur: undefined });
    expect(await noAmount.exec(["contribute", "--date", DATE])).toBe(EXIT.domain);
    expect(noAmount.text()).toContain("monthly_contribution_eur");

    const noWeights = await portfolio({ bucket_pct_of_contribution: "10" });
    expect(await noWeights.exec(["contribute", "--amount", "100", "--date", DATE])).toBe(
      EXIT.domain,
    );
    expect(noWeights.text()).toContain("target_weights");

    const noBucket = await portfolio({ target_weights: { ast_world: "60", ast_bonds: "40" } });
    expect(await noBucket.exec(["contribute", "--amount", "100", "--date", DATE])).toBe(
      EXIT.domain,
    );
    expect(noBucket.text()).toContain("bucket_pct_of_contribution");
  });

  it("refuses when the plan points at no asset of the table, pointing at the typo", async () => {
    const h = await portfolio({ ...CONFIG, target_weights: { ast_typo: "100" } });
    expect(await h.exec(["contribute", "--amount", "1000", "--date", DATE])).toBe(EXIT.domain);
    expect(h.text()).toContain("unknown_target_weight");
    expect(h.text()).toContain("target_weights");
  });

  it("refuses a non-positive amount and lists the prices that are missing", async () => {
    const h = await portfolio();
    expect(await h.exec(["contribute", "--amount", "0", "--date", DATE])).toBe(EXIT.domain);
    h.reset();
    expect(await h.exec(["contribute", "--amount", "100", "--date", "2027-01-31"])).toBe(
      EXIT.domain,
    );
    expect(h.text()).toContain("ast_world");
  });
});

describe("atlas costs", () => {
  it("prints the core per asset and the bucket per account, in separate tables", async () => {
    const h = await portfolio();
    expect(await h.exec(["costs", "--date", DATE])).toBe(0);
    expect(h.text()).toContain("Núcleo:");
    expect(h.text()).toContain("Cubo (comisiones acumuladas por cuenta");
    expect(h.text()).toContain("ast_world");
    expect(h.text()).toContain("TOTAL");
  });

  it("answers in JSON with the two books apart", async () => {
    const h = await portfolio();
    expect(await h.exec(["costs", "--date", DATE, "--json"])).toBe(0);
    const data = h.json() as { core: { rows: unknown[] }; bucket: { rows: unknown[] } };
    expect(data.core.rows).toHaveLength(2);
    expect(data.bucket.rows).toEqual([]);
  });
});

describe("atlas transfer simulate", () => {
  it("shows the weights before and after and writes nothing", async () => {
    const h = await portfolio();
    const before = (await h.store.load()).etag;
    expect(
      await h.exec([
        "transfer",
        "simulate",
        "--from-asset",
        "ast_world",
        "--to-asset",
        "ast_bonds",
        "--quantity",
        "2",
        "--date",
        DATE,
      ]),
    ).toBe(0);
    expect(h.text()).toContain("no es hecho imponible");
    expect(h.text()).toMatch(/ast_world\s+60 %\s+40 %/);
    expect(h.text()).toContain("Nada se ha registrado.");
    expect((await h.store.load()).etag).toBe(before);
  });

  it("requires exactly one of --quantity or --all", async () => {
    const h = await portfolio();
    expect(
      await h.exec([
        "transfer",
        "simulate",
        "--from-asset",
        "ast_world",
        "--to-asset",
        "ast_bonds",
        "--date",
        DATE,
      ]),
    ).toBe(EXIT.usage);
    h.reset();
    expect(
      await h.exec([
        "transfer",
        "simulate",
        "--from-asset",
        "ast_world",
        "--to-asset",
        "ast_bonds",
        "--quantity",
        "2",
        "--all",
        "--date",
        DATE,
      ]),
    ).toBe(EXIT.usage);
  });

  it("refuses an asset that cannot be transferred", async () => {
    const h = await portfolio();
    expect(
      await h.exec([
        "transfer",
        "simulate",
        "--from-asset",
        "ast_world",
        "--to-asset",
        "ast_gold",
        "--quantity",
        "1",
        "--date",
        DATE,
      ]),
    ).toBe(EXIT.domain);
    expect(h.text()).toContain("not_transferable");
  });
});

describe("read-only views as of the date asked", () => {
  it("reads the golden at a past date with the portfolio of that date", async () => {
    // ast_bonds was emptied by a share-class change in 2028 and ast_bonds_i was
    // born there: in 2027 the table must show the first and not the second.
    const h = harness({ lines: goldenLines() });
    expect(await h.exec(["weights", "--date", "2027-06-30", "--json"])).toBe(0);
    const data = h.json() as { rows: { asset_id: string; quantity: string }[] };
    const bonds = data.rows.find((row) => row.asset_id === "ast_bonds");
    expect(Number(bonds?.quantity)).toBeGreaterThan(0);
    expect(data.rows.map((row) => row.asset_id)).not.toContain("ast_bonds_i");
  });

  it("simulates a transfer of the position held at that date", async () => {
    const h = await portfolio();
    // 94 more of ast_world, well after the date asked.
    expect(
      await h.exec([
        "add",
        "buy",
        "--account",
        "acc_fund",
        "--asset",
        "ast_world",
        "--trade-date",
        "2028-06-01",
        "--value-date",
        "2028-06-02",
        "--quantity",
        "94",
        "--unit-price",
        "100",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2028-06-02",
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    expect(
      await h.exec([
        "transfer",
        "simulate",
        "--from-asset",
        "ast_world",
        "--to-asset",
        "ast_bonds",
        "--all",
        "--date",
        DATE,
        "--json",
      ]),
    ).toBe(0);
    expect((h.json() as { quantity: string }).quantity).toBe("6");
  });

  it("does not count in costs a commission paid after the date asked", async () => {
    const h = await portfolio();
    expect(await h.exec(["costs", "--date", DATE, "--json"])).toBe(0);
    const before = (h.json() as { core: { totals: { fees_eur: string } } }).core.totals.fees_eur;
    h.reset();
    expect(
      await h.exec([
        "add",
        "buy",
        "--account",
        "acc_fund",
        "--asset",
        "ast_world",
        "--trade-date",
        "2028-06-01",
        "--value-date",
        "2028-06-02",
        "--quantity",
        "1",
        "--unit-price",
        "100",
        "--fee",
        "50",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2028-06-02",
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    expect(await h.exec(["costs", "--date", DATE, "--json"])).toBe(0);
    expect((h.json() as { core: { totals: { fees_eur: string } } }).core.totals.fees_eur).toBe(
      before,
    );
  });
});

describe("the --date flag of every view", () => {
  it("rejects a date that is not YYYY-MM-DD as a usage error", async () => {
    const h = await portfolio();
    for (const argv of [
      ["weights", "--date", "manana"],
      ["contribute", "--amount", "100", "--date", "manana"],
      ["costs", "--date", "manana"],
      ["valuations", "--date", "manana"],
      [
        "transfer",
        "simulate",
        "--from-asset",
        "ast_world",
        "--to-asset",
        "ast_bonds",
        "--quantity",
        "1",
        "--date",
        "manana",
      ],
    ]) {
      h.reset();
      expect(await h.exec(argv)).toBe(EXIT.usage);
      expect(h.text()).toContain("--date debe ser una fecha YYYY-MM-DD válida");
    }
  });

  it("rejects a date that looks right but does not exist", async () => {
    const h = await portfolio();
    expect(await h.exec(["weights", "--date", "2027-02-30"])).toBe(EXIT.usage);
  });
});
