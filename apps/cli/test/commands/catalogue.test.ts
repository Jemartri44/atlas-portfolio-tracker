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
    expect((h.json() as { account_id: string }[])[0]?.account_id).toBe("acc_fund");
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

  it("takes --yes in front of the command, as the usage line puts it", async () => {
    // It used to read `asset` as the value of --yes: «--yes no admite valor».
    const h = harness({ events: seed() });
    expect(
      await h.exec([
        "--yes",
        "asset",
        "add",
        "--id",
        "ast_new",
        "--type",
        "fund",
        "--book",
        "core",
        "--asset-class",
        "equity",
        "--name",
        "New",
        "--currency",
        "EUR",
        "--transferable",
      ]),
    ).toBe(0);
    expect(h.text()).toContain("Registrado asset_created");
  });

  it("refuses --transferable false, and any word the command does not read", async () => {
    const h = harness({ events: seed() });
    const before = (await h.store.load()).events.length;
    const add = (...extra: string[]) =>
      h.exec([
        "asset",
        "add",
        "--id",
        "ast_new",
        "--type",
        "fund",
        "--book",
        "core",
        "--asset-class",
        "equity",
        "--name",
        "New",
        "--currency",
        "EUR",
        ...extra,
        "--yes",
      ]);
    // It used to record transferable: true.
    expect(await add("--transferable", "false")).toBe(64);
    expect(h.err.join("\n")).toContain(
      "--transferable no lleva valor («false»): pon --transferable para sí y --not-transferable para no",
    );
    h.reset();
    // A word no command expects is named, never ignored.
    expect(await add("--transferable", "loose")).toBe(64);
    expect(h.err.join("\n")).toContain(
      "sobra el argumento «loose»: «atlas asset add» no lo espera",
    );
    expect((await h.store.load()).events).toHaveLength(before);
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

  it("refuses an ISIN another asset already has, in any book, and names that asset", async () => {
    const h = harness({ events: seed() });
    expect(
      await h.exec([
        "asset",
        "add",
        "--id",
        "ast_spec",
        "--type",
        "fund",
        "--book",
        "bucket",
        "--name",
        "World again",
        "--currency",
        "EUR",
        "--isin",
        "XX0000000001",
        "--transferable",
        "--yes",
      ]),
    ).toBe(1);
    expect(h.text()).toContain(
      "El ISIN XX0000000001 ya es del activo ast_world: un mismo valor no puede ser dos activos",
    );
    h.reset();
    expect(await h.exec(["asset", "update", "ast_bonds", "--isin", "XX0000000002", "--yes"])).toBe(
      1,
    );
    expect(h.text()).toContain("ya es del activo ast_gold");
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
        "--wash-sale-window",
        "etc=62d",
        "--target-weights",
        "ast_world=60,ast_bonds=40",
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
    expect(h.text()).toContain('"etc": "62d"');
    expect(h.text()).toContain('"ast_world": "60"');
    h.reset();
    expect(await h.exec(["settings", "show", "--at", "2020-01-01", "--json"])).toBe(0);
    expect((h.json() as { origin: string }).origin).toBe("default");
    expect(await h.exec(["settings", "set", "--fiscal-date-rule", "etc", "--yes"])).toBe(64);
    expect(await h.exec(["settings", "set", "--fiscal-date-rule", "etc=tomorrow", "--yes"])).toBe(
      1,
    );
    h.reset();
    // The legacy flag is gone: the window is counted date to date (ADR-0014).
    expect(await h.exec(["settings", "set", "--wash-sale-window-days", "etc=62", "--yes"])).toBe(
      64,
    );
    expect(h.text()).toContain("--wash-sale-window");
    expect(await h.exec(["settings", "set", "--wash-sale-window", "etc=3m", "--yes"])).toBe(1);
    expect(
      await h.exec(["settings", "set", "--target-weights", "ast_world=60,ast_bonds=30", "--yes"]),
    ).toBe(1);
    expect(await h.exec(["settings", "wipe"])).toBe(64);
  });
});
