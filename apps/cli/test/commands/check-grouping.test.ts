// `atlas check` says a loss-making sale once, not once per purchase inside its window.

import { describe, expect, it } from "vitest";
import { harness, seed } from "../harness.js";

const trade = (side: "buy" | "sell", date: string, quantity: string, price: string) => [
  "add",
  side,
  "--account",
  "acc_fund",
  "--asset",
  "ast_world",
  "--trade-date",
  date,
  "--value-date",
  date,
  "--quantity",
  quantity,
  "--unit-price",
  price,
  "--currency",
  "EUR",
  "--fx-rate",
  "1",
  "--fx-rate-date",
  date,
  "--yes",
];

const ledger = async () => {
  const h = harness({ events: seed(), confirm: true, instant: "2027-03-01T10:00:00.000Z" });
  for (const argv of [
    trade("buy", "2027-01-04", "10", "100"),
    trade("sell", "2027-02-01", "5", "50"),
    trade("buy", "2027-02-05", "1", "50"),
    trade("buy", "2027-02-10", "1", "50"),
    trade("buy", "2027-02-15", "1", "50"),
  ]) {
    expect(await h.exec(argv)).toBe(0);
  }
  h.reset();
  return h;
};

describe("atlas check", () => {
  it("groups the purchases inside the window of one sale into one line", async () => {
    const h = await ledger();
    expect(await h.exec(["check"])).toBe(0);
    const lines = h.text().split("\n");
    expect(lines.filter((l) => l.includes("wash_sale_window_repurchase"))).toHaveLength(1);
    expect(h.text()).toContain("3 compras dentro de la ventana");
    expect(h.text()).toContain("2027-02-05");
    expect(h.text()).toContain("2027-02-15");
  });

  it("keeps every warning in --json", async () => {
    const h = await ledger();
    expect(await h.exec(["check", "--json"])).toBe(0);
    const { warnings } = JSON.parse(h.out.join("\n")) as { warnings: { code: string }[] };
    expect(warnings.filter((w) => w.code === "wash_sale_window_repurchase")).toHaveLength(3);
  });
});
