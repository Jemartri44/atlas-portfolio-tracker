import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUY_GOLD, BUY_WORLD, harness, seed } from "../harness.js";

const buyGoldIn = (account: string, quantity: string, tradeDate = "2027-02-10") => [
  "add",
  "buy",
  "--account",
  account,
  "--asset",
  "ast_gold",
  "--trade-date",
  tradeDate,
  "--value-date",
  tradeDate,
  "--quantity",
  quantity,
  "--unit-price",
  "100",
  "--currency",
  "USD",
  "--fx-rate",
  "1",
  "--fx-rate-date",
  tradeDate,
  "--yes",
];

const CA = [
  "--effective-date",
  "2027-03-01",
  "--source-document",
  "https://issuer.example/notice.pdf",
];

const lastEvent = async (h: Awaited<ReturnType<typeof harness>>) => {
  const events = (await h.store.load()).events;
  return events[events.length - 1] as Record<string, unknown>;
};

describe("atlas ca", () => {
  it("split: builds scale(ratio), shows the before/after tables and records on confirmation", async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(await h.exec(BUY_WORLD)).toBe(0);
    h.reset();
    expect(await h.exec(["ca", "split", "--asset", "ast_world", "--ratio", "4", ...CA])).toBe(0);
    const text = h.text();
    expect(text).toContain("Posiciones (antes → después)");
    expect(text).toContain("40.493824");
    expect(text).toContain("Lotes abiertos");
    expect(text).toContain("Recuerda copiar el documento fuente");
    expect(text).toContain("Registrado corporate_action");
    const event = await lastEvent(h);
    expect(event.kind).toBe("split");
    expect(event.effects).toEqual([{ op: "scale", ratio: "4" }]);
    expect(event.source_document).toBe("https://issuer.example/notice.pdf");
    expect(event.fingerprint).toMatch(/^sha256:/);
    h.reset();
    expect(await h.exec(["lots"])).toBe(0);
    expect(h.text()).toContain("40.493824");
  });

  it("reverse-split with cash-in-lieu computes the fractional shares per account", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(buyGoldIn("acc_etf", "10", "2027-01-10"))).toBe(0);
    expect(await h.exec(buyGoldIn("acc_fund", "7"))).toBe(0);
    h.reset();
    expect(
      await h.exec([
        "ca",
        "reverse-split",
        "--asset",
        "ast_gold",
        "--ratio",
        "1/4",
        "--cash-per-share",
        "400",
        "--currency",
        "USD",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-03-01",
        "--fees",
        "acc_etf=1",
        ...CA,
        "--yes",
      ]),
    ).toBe(0);
    const event = await lastEvent(h);
    expect(event.effects).toEqual([
      { op: "scale", ratio: "1/4" },
      {
        op: "forced_sale",
        per_account: [
          { account_id: "acc_etf", quantity: "0.5", fee: "1" },
          { account_id: "acc_fund", quantity: "0.75" },
        ],
        unit_price: "400",
        currency: "USD",
        fx_rate: "1",
        fx_rate_date: "2027-03-01",
      },
    ]);
    const text = h.text();
    expect(text).toContain("Ganancias generadas");
    expect(text).toMatch(/acc_etf\s+ast_gold\s+10\s+2/);
    expect(text).toMatch(/acc_fund\s+ast_gold\s+7\s+1/);
    h.reset();
    expect(await h.exec(["gains", "2027"])).toBe(0);
    expect(h.text()).toContain("corporate_action:reverse_split");
    h.reset();
    expect(await h.exec(["positions"])).toBe(0);
    expect(h.text()).toMatch(/acc_etf\s+ast_gold\s+2/);
  });

  it("reverse-split without fractions records no forced_sale and says so", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(buyGoldIn("acc_etf", "8"))).toBe(0);
    h.reset();
    expect(
      await h.exec([
        "ca",
        "reverse-split",
        "--asset",
        "ast_gold",
        "--ratio",
        "0.25",
        "--cash-per-share",
        "400",
        "--currency",
        "USD",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-03-01",
        ...CA,
        "--yes",
      ]),
    ).toBe(0);
    expect(h.text()).toContain("ninguna cuenta queda con picos");
    expect((await lastEvent(h)).effects).toEqual([{ op: "scale", ratio: "0.25" }]);
  });

  it("merger needs an existing destination and proposes asset add and asset update --inactive", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(BUY_GOLD)).toBe(0);
    h.reset();
    expect(
      await h.exec([
        "ca",
        "merger",
        "--asset",
        "ast_gold",
        "--to-asset",
        "ast_new",
        "--ratio",
        "1/2",
        ...CA,
        "--yes",
      ]),
    ).toBe(64);
    expect(h.text()).toContain("atlas asset add --id ast_new");
    expect(
      await h.exec([
        "asset",
        "add",
        "--id",
        "ast_new",
        "--type",
        "etc",
        "--book",
        "core",
        "--asset-class",
        "gold",
        "--name",
        "New Gold",
        "--currency",
        "USD",
        "--not-transferable",
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    expect(
      await h.exec([
        "ca",
        "merger",
        "--asset",
        "ast_gold",
        "--to-asset",
        "ast_new",
        "--ratio",
        "1/2",
        "--cash-per-share",
        "40",
        "--currency",
        "USD",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-03-01",
        ...CA,
        "--yes",
      ]),
    ).toBe(0);
    const event = await lastEvent(h);
    expect(event.effects).toEqual([
      { op: "convert", to_asset_id: "ast_new", ratio: "1/2" },
      {
        op: "forced_sale",
        asset_id: "ast_new",
        per_account: [{ account_id: "acc_etf", quantity: "0.5" }],
        unit_price: "40",
        currency: "USD",
        fx_rate: "1",
        fx_rate_date: "2027-03-01",
      },
    ]);
    expect(h.text()).toContain("atlas asset update ast_gold --inactive");
    h.reset();
    expect(await h.exec(["lots"])).toBe(0);
    expect(h.text()).toContain("corporate_action:merger");
  });

  it("spin-off, fund-merger, share-class-change and fund-liquidation build their effects", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(BUY_WORLD)).toBe(0);
    expect(await h.exec(BUY_GOLD)).toBe(0);
    h.reset();
    expect(
      await h.exec([
        "ca",
        "spin-off",
        "--asset",
        "ast_world",
        "--to-asset",
        "ast_bonds",
        "--ratio",
        "1/4",
        "--cost-share",
        "0.2",
        ...CA,
        "--yes",
      ]),
    ).toBe(0);
    expect((await lastEvent(h)).effects).toEqual([
      { op: "carve_out", to_asset_id: "ast_bonds", ratio: "1/4", cost_share: "0.2" },
    ]);
    expect(
      await h.exec([
        "ca",
        "fund-merger",
        "--asset",
        "ast_world",
        "--to-asset",
        "ast_bonds",
        "--ratio",
        "1.7",
        ...CA,
        "--yes",
      ]),
    ).toBe(0);
    expect((await lastEvent(h)).effects).toEqual([
      { op: "convert", to_asset_id: "ast_bonds", ratio: "1.7" },
    ]);
    expect((await lastEvent(h)).kind).toBe("fund_merger");
    expect(
      await h.exec([
        "ca",
        "share-class-change",
        "--asset",
        "ast_bonds",
        "--to-asset",
        "ast_world",
        "--ratio",
        "1",
        ...CA,
        "--effective-date",
        "2027-04-01",
        "--yes",
      ]),
    ).toBe(0);
    expect((await lastEvent(h)).kind).toBe("share_class_change");
    h.reset();
    expect(
      await h.exec([
        "ca",
        "fund-liquidation",
        "--asset",
        "ast_world",
        "--unit-price",
        "120",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-05-01",
        "--fees",
        "acc_fund=2",
        ...CA,
        "--effective-date",
        "2027-05-01",
        "--yes",
      ]),
    ).toBe(0);
    expect((await lastEvent(h)).effects).toEqual([
      {
        op: "forced_sale",
        per_account: [{ account_id: "acc_fund", quantity: "all", fee: "2" }],
        unit_price: "120",
        currency: "EUR",
        fx_rate: "1",
        fx_rate_date: "2027-05-01",
      },
    ]);
    expect(h.text()).toContain("queda sin posición");
  });

  it("delisting records no effects and reminds that inactive is a separate update", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(BUY_GOLD)).toBe(0);
    h.reset();
    expect(
      await h.exec([
        "ca",
        "delisting",
        "--asset",
        "ast_gold",
        ...CA,
        "--notes",
        "removed",
        "--yes",
      ]),
    ).toBe(0);
    expect(h.text()).toContain("atlas asset update ast_gold --inactive");
    const event = await lastEvent(h);
    expect(event.effects).toEqual([]);
    expect(event.notes).toBe("removed");
  });

  it("raw validates the effects against the table and rejects bad input with code 1", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(BUY_GOLD)).toBe(0);
    h.reset();
    expect(
      await h.exec([
        "ca",
        "raw",
        "--asset",
        "ast_gold",
        "--kind",
        "split",
        "--effects-json",
        '[{"op":"convert","to_asset_id":"ast_world","ratio":"1"}]',
        ...CA,
        "--yes",
      ]),
    ).toBe(1);
    expect(h.text()).toContain("effects_not_allowed_for_kind");
    h.reset();
    expect(
      await h.exec([
        "ca",
        "raw",
        "--asset",
        "ast_gold",
        "--kind",
        "split",
        "--effects-json",
        '[{"op":"scale","ratio":"0"}]',
        ...CA,
        "--yes",
      ]),
    ).toBe(1);
    expect(h.text()).toContain("ratio");
    expect(
      await h.exec([
        "ca",
        "raw",
        "--asset",
        "ast_gold",
        "--kind",
        "bogus",
        "--effects-json",
        "[]",
        ...CA,
        "--yes",
      ]),
    ).toBe(64);
    expect(
      await h.exec([
        "ca",
        "raw",
        "--asset",
        "ast_gold",
        "--kind",
        "split",
        "--effects-json",
        "{",
        ...CA,
        "--yes",
      ]),
    ).toBe(64);
    expect(
      await h.exec([
        "ca",
        "raw",
        "--asset",
        "ast_gold",
        "--kind",
        "split",
        "--effects-json",
        "{}",
        ...CA,
        "--yes",
      ]),
    ).toBe(64);
    expect(
      await h.exec([
        "ca",
        "raw",
        "--asset",
        "ast_gold",
        "--kind",
        "split",
        "--effects-json",
        "/nonexistent/effects.json",
        ...CA,
        "--yes",
      ]),
    ).toBe(64);
    const file = join(await mkdtemp(join(tmpdir(), "atlas-ca-")), "effects.json");
    await writeFile(file, '[{"op":"scale","ratio":"2"}]');
    expect(
      await h.exec([
        "ca",
        "raw",
        "--asset",
        "ast_gold",
        "--kind",
        "split",
        "--effects-json",
        file,
        ...CA,
        "--yes",
      ]),
    ).toBe(0);
    expect((await lastEvent(h)).effects).toEqual([{ op: "scale", ratio: "2" }]);
    h.reset();
    expect(
      await h.exec([
        "ca",
        "raw",
        "--asset",
        "ast_gold",
        "--kind",
        "issuer_liquidation",
        "--effects-json",
        '[{"op":"forced_sale","per_account":[{"account_id":"acc_etf","quantity":"all"}],"unit_price":"0","currency":"USD","fx_rate":"1","fx_rate_date":"2027-03-01"}]',
        ...CA,
        "--json",
        "--yes",
      ]),
    ).toBe(0);
    const json = JSON.parse(h.out[0] as string) as {
      gains: { gain_eur: string }[];
      after: { positions: unknown[] };
    };
    expect(json.gains[0]?.gain_eur).toBe("-923.04");
    expect(json.after.positions).toEqual([]);
  });

  it("rejects unknown wizards, unknown assets, foreign fee accounts and declined confirmations", async () => {
    const h = harness({ events: seed(), confirm: false });
    expect(await h.exec(["ca", "bogus", ...CA])).toBe(64);
    expect(await h.exec(["ca", "split", "--asset", "ast_nope", "--ratio", "2", ...CA])).toBe(64);
    expect(await h.exec(BUY_GOLD)).toBe(0);
    expect(
      await h.exec([
        "ca",
        "reverse-split",
        "--asset",
        "ast_gold",
        "--ratio",
        "1/4",
        "--cash-per-share",
        "1",
        "--currency",
        "USD",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-03-01",
        "--fees",
        "acc_fund=1",
        ...CA,
      ]),
    ).toBe(64);
    h.reset();
    expect(await h.exec(["ca", "split", "--asset", "ast_gold", "--ratio", "2", ...CA])).toBe(0);
    expect(h.text()).toContain("Cancelado.");
    expect((await h.store.load()).events).toHaveLength(6);
    expect(
      await h.exec(["ca", "split", "--asset", "ast_gold", "--ratio", "2", ...CA, "--yes"]),
    ).toBe(0);
    expect(
      await h.exec(["ca", "split", "--asset", "ast_gold", "--ratio", "2", ...CA, "--yes"]),
    ).toBe(3);
  });
});
