import { describe, expect, it } from "vitest";
import { harness, seed } from "../harness.js";

describe("atlas account / asset", () => {
  it("adds, updates and lists accounts", async () => {
    const h = harness({ confirm: true });
    expect(
      await h.exec([
        "account",
        "add",
        "--id",
        "acc_fund",
        "--name",
        "Fondos",
        "--platform",
        "myinvestor",
        "--book",
        "core",
        "--base-currency",
        "EUR",
        "--country",
        "ES",
      ]),
    ).toBe(0);
    expect(h.text()).toContain("Evento a registrar:");
    expect(h.text()).toContain("Registrado account_created");
    expect(
      await h.exec([
        "account",
        "update",
        "acc_fund",
        "--name",
        "Fondos indexados",
        "--inactive",
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    expect(await h.exec(["account", "list"])).toBe(0);
    expect(h.text()).toContain("Fondos indexados");
    expect(h.text()).toMatch(/no$/m);
    h.reset();
    expect(await h.exec(["account", "list", "--json"])).toBe(0);
    expect(JSON.parse(h.out.join("\n"))[0].account_id).toBe("acc_fund");
    expect(await h.exec(["account", "update", "acc_none", "--name", "x", "--yes"])).toBe(64);
    expect(await h.exec(["account", "frobnicate"])).toBe(64);
    expect(await h.exec(["account", "update"])).toBe(64);
  });

  it("adds and lists assets with identifier history", async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(
      await h.exec([
        "asset",
        "add",
        "--id",
        "ast_spec",
        "--type",
        "stock",
        "--book",
        "bucket",
        "--name",
        "Spec",
        "--currency",
        "USD",
        "--not-transferable",
        "--ticker",
        "SPC",
        "--yes",
      ]),
    ).toBe(0);
    expect(
      await h.exec([
        "asset",
        "update",
        "ast_world",
        "--isin",
        "XX0000000009",
        "--transferable",
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    expect(await h.exec(["asset", "list", "--history"])).toBe(0);
    expect(h.text()).toContain("XX0000000009");
    expect(h.text()).toContain("XX0000000001/- hasta");
    expect(
      await h.exec(["asset", "add", "--id", "x", "--transferable", "--not-transferable", "--yes"]),
    ).toBe(64);
    expect(await h.exec(["asset", "update", "ast_none", "--name", "x", "--yes"])).toBe(64);
    expect(await h.exec(["asset", "update"])).toBe(64);
    expect(await h.exec(["asset", "list", "--bogus"])).toBe(64);
    expect(await h.exec(["asset", "nope"])).toBe(64);
  });

  it("rejects an asset that already exists in the other book", async () => {
    const h = harness({ events: seed() });
    expect(
      await h.exec([
        "asset",
        "add",
        "--id",
        "ast_world",
        "--type",
        "stock",
        "--book",
        "bucket",
        "--name",
        "Dup",
        "--currency",
        "EUR",
        "--not-transferable",
        "--yes",
      ]),
    ).toBe(1);
    expect(h.text()).toContain("ya existe");
  });
});

describe("atlas settings", () => {
  it("shows defaults, sets a rule and shows the change by date", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(["settings", "show"])).toBe(0);
    expect(h.text()).toContain("origen: default");
    h.reset();
    expect(
      await h.exec([
        "settings",
        "set",
        "--fiscal-date-rule",
        "etc=value_date",
        "--wash-sale-window-days",
        "etc=62",
        "--stale-price-days",
        "7",
        "--deviation-threshold-pp",
        "5",
        "--yes",
      ]),
    ).toBe(0);
    h.reset();
    expect(await h.exec(["settings", "show", "--at", "2027-08-30"])).toBe(0);
    expect(h.text()).toContain('"etc": "value_date"');
    expect(h.text()).toContain('"stale_price_days": 7');
    h.reset();
    expect(await h.exec(["settings", "show", "--at", "2020-01-01", "--json"])).toBe(0);
    expect(JSON.parse(h.out.join("\n")).origin).toBe("default");
    expect(await h.exec(["settings", "set", "--fiscal-date-rule", "etc", "--yes"])).toBe(64);
    expect(await h.exec(["settings", "set", "--fiscal-date-rule", "etc=tomorrow", "--yes"])).toBe(
      1,
    );
    expect(await h.exec(["settings", "wipe"])).toBe(64);
  });
});
