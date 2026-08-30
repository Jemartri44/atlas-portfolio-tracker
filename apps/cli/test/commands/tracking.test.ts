import { describe, expect, it } from "vitest";
import { harness, idAt, seed } from "../harness.js";

describe("atlas order", () => {
  it("places, lists, annotates, cancels and fills orders", async () => {
    const h = harness({ events: seed(), instant: "2027-07-11T10:00:00.000Z" });
    expect(
      await h.exec([
        "order",
        "place",
        "--account",
        "acc_fund",
        "--asset",
        "ast_world",
        "--side",
        "buy",
        "--amount",
        "500",
        "--requested-date",
        "2027-07-01",
        "--yes",
      ]),
    ).toBe(0);
    expect(
      await h.exec([
        "order",
        "place",
        "--account",
        "acc_fund",
        "--asset",
        "ast_bonds",
        "--side",
        "buy",
        "--quantity",
        "3",
        "--requested-date",
        "2027-07-01",
        "--yes",
      ]),
    ).toBe(0);
    const first = await idAt(h.store, 5);
    const second = await idAt(h.store, 6);
    h.reset();
    expect(await h.exec(["order", "list"])).toBe(0);
    expect(h.text()).toContain(`${first}`);
    expect(h.text()).toMatch(/open\s+10/);
    expect(
      await h.exec([
        "order",
        "note",
        second,
        "--date",
        "2027-07-04",
        "--notes",
        "esperando",
        "--yes",
      ]),
    ).toBe(0);
    expect(await h.exec(["order", "cancel", second, "--date", "2027-07-05", "--yes"])).toBe(0);
    expect(
      await h.exec([
        "add",
        "buy",
        "--account",
        "acc_fund",
        "--asset",
        "ast_world",
        "--trade-date",
        "2027-07-03",
        "--value-date",
        "2027-07-03",
        "--quantity",
        "4",
        "--amount",
        "500",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-07-03",
        "--order",
        first,
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    expect(await h.exec(["order", "list"])).toBe(0);
    expect(h.text()).not.toContain(first);
    h.reset();
    expect(await h.exec(["order", "list", "--all", "--json"])).toBe(0);
    const all = JSON.parse(h.out.join("\n")) as { stage: string }[];
    expect(all.map((o) => o.stage).sort()).toEqual(["cancelled", "filled"]);
    expect(await h.exec(["order", "cancel", "--date", "2027-07-05", "--yes"])).toBe(64);
    expect(await h.exec(["order", "nope"])).toBe(64);
  });
});

describe("atlas transfer", () => {
  it("requests, updates, lists pending and completes a transfer", async () => {
    const h = harness({ events: seed(), instant: "2027-03-04T10:00:00.000Z" });
    expect(
      await h.exec([
        "add",
        "buy",
        "--account",
        "acc_fund",
        "--asset",
        "ast_world",
        "--trade-date",
        "2027-01-10",
        "--value-date",
        "2027-01-10",
        "--quantity",
        "10",
        "--unit-price",
        "100",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        "2027-01-10",
        "--yes",
      ]),
    ).toBe(0);
    expect(
      await h.exec([
        "transfer",
        "request",
        "--from-account",
        "acc_fund",
        "--from-asset",
        "ast_world",
        "--to-account",
        "acc_fund",
        "--to-asset",
        "ast_bonds",
        "--quantity-out",
        "4",
        "--requested-date",
        "2027-03-01",
        "--yes",
      ]),
    ).toBe(0);
    const requestId = await idAt(h.store, 6);
    expect(
      await h.exec([
        "transfer",
        "update",
        requestId,
        "--stage",
        "redeemed",
        "--date",
        "2027-03-03",
        "--nav-out",
        "105",
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    expect(await h.exec(["transfers", "pending"])).toBe(0);
    expect(h.text()).toMatch(/redeemed\s+3/);
    expect(
      await h.exec([
        "add",
        "transfer",
        "--request",
        requestId,
        "--from-account",
        "acc_fund",
        "--from-asset",
        "ast_world",
        "--quantity-out",
        "4",
        "--nav-out",
        "105",
        "--value-date-out",
        "2027-03-03",
        "--to-account",
        "acc_fund",
        "--to-asset",
        "ast_bonds",
        "--quantity-in",
        "3.5",
        "--nav-in",
        "120",
        "--value-date-in",
        "2027-03-05",
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    expect(await h.exec(["transfer", "pending", "--json"])).toBe(0);
    expect(JSON.parse(h.out.join("\n"))).toEqual([]);
    h.reset();
    expect(await h.exec(["lots", "ast_bonds"])).toBe(0);
    expect(h.text()).toContain("2027-01-10");
    expect(h.text()).toContain("3.5");
    expect(
      await h.exec(["transfer", "update", "--stage", "cancelled", "--date", "2027-03-03", "--yes"]),
    ).toBe(64);
    expect(await h.exec(["transfer", "nope"])).toBe(64);
    expect(
      await h.exec([
        "add",
        "transfer",
        "--from-account",
        "acc_etf",
        "--from-asset",
        "ast_gold",
        "--quantity-out",
        "1",
        "--nav-out",
        "1",
        "--value-date-out",
        "2027-03-03",
        "--to-account",
        "acc_fund",
        "--to-asset",
        "ast_bonds",
        "--quantity-in",
        "1",
        "--nav-in",
        "1",
        "--value-date-in",
        "2027-03-05",
        "--yes",
      ]),
    ).toBe(1);
    expect(h.text()).toContain("traspasables");
  });
});
