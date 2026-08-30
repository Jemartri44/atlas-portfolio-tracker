import { describe, expect, it } from "vitest";
import { BUY_GOLD, BUY_WORLD, harness, idAt, SELL_GOLD, seed } from "../harness.js";

describe("atlas edit / delete", () => {
  it("edits an event by appending a reversal and a correction", async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(await h.exec(BUY_WORLD)).toBe(0);
    const buyId = await idAt(h.store, 5);
    h.reset();
    expect(
      await h.exec(["edit", buyId, "--reason", "importe mal tecleado", "--amount", "1100"]),
    ).toBe(0);
    expect(h.text()).toContain("Evento original buy");
    expect(h.text()).toContain("Registrados reversal");
    const events = (await h.store.load()).events;
    expect(events).toHaveLength(8);
    expect(events[6]?.type).toBe("reversal");
    expect((events[7] as Record<string, unknown>).amount).toBe("1100");
    expect(events[7]?.corrects_id).toBe(buyId);
    h.reset();
    expect(await h.exec(["lots", "ast_world"])).toBe(0);
    expect(h.text()).toContain("1100");
  });

  it("warns about prior tax years and lists dependants on rejection", async () => {
    const h = harness({ events: seed(), instant: "2028-02-01T10:00:00.000Z" });
    expect(await h.exec(BUY_GOLD)).toBe(0);
    expect(await h.exec(SELL_GOLD)).toBe(0);
    const buyId = await idAt(h.store, 5);
    const sellId = await idAt(h.store, 6);
    h.reset();
    expect(await h.exec(["delete", buyId, "--reason", "x", "--yes"])).toBe(1);
    expect(h.text()).toContain("dejarían de ser válidos");
    expect(h.text()).toContain("consumido por eventos posteriores");
    expect(h.text()).toContain(sellId);
    h.reset();
    expect(await h.exec(["delete", sellId, "--reason", "x", "--yes"])).toBe(0);
    expect(h.text()).toContain("ejercicio anterior");
    h.reset();
    expect(await h.exec(["edit", buyId, "--reason", "fee", "--fee", "2", "--yes"])).toBe(0);
    expect(h.text()).toContain("ejercicio anterior");
  });

  it("handles declined confirmations, usage errors and non-editable types", async () => {
    const declined = harness({ events: seed(), confirm: false });
    expect(await declined.exec(BUY_WORLD)).toBe(0);
    const buyId = await idAt(declined.store, 5);
    expect(await declined.exec(["edit", buyId, "--reason", "x", "--fee", "1"])).toBe(0);
    expect(await declined.exec(["delete", buyId, "--reason", "x"])).toBe(0);
    expect(declined.text()).toContain("Cancelado.");
    expect((await declined.store.load()).events).toHaveLength(6);
    expect(await declined.exec(["edit", buyId, "--fee", "1", "--yes"])).toBe(64);
    expect(await declined.exec(["edit", buyId, "--reason", "x", "--bogus", "1", "--yes"])).toBe(64);
    expect(
      await declined.exec(["edit", "01ARYZ6S41TSV4RRFFQ69G5FZZ", "--reason", "x", "--yes"]),
    ).toBe(64);
    expect(
      await declined.exec(["edit", await idAt(declined.store, 0), "--reason", "x", "--yes"]),
    ).toBe(64);
    expect(await declined.exec(["delete"])).toBe(64);
    expect(
      await declined.exec([
        "ca",
        "split",
        "--asset",
        "ast_world",
        "--ratio",
        "2",
        "--effective-date",
        "2027-01-05",
        "--source-document",
        "doc",
        "--yes",
      ]),
    ).toBe(0);
    const actionId = await idAt(declined.store, 6);
    expect(await declined.exec(["edit", actionId, "--reason", "x", "--yes"])).toBe(64);
    expect(declined.text()).toContain("no se edita");
    expect(await declined.exec(["delete", actionId, "--reason", "x", "--yes"])).toBe(0);
    expect(
      await declined.exec(["delete", "01ARYZ6S41TSV4RRFFQ69G5FZZ", "--reason", "x", "--yes"]),
    ).toBe(64);
  });

  it("edits tracking events too", async () => {
    const h = harness({ events: seed() });
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
    const orderId = await idAt(h.store, 5);
    expect(await h.exec(["edit", orderId, "--reason", "importe", "--amount", "600", "--yes"])).toBe(
      0,
    );
    expect(
      await h.exec([
        "order",
        "note",
        await idAt(h.store, 7),
        "--date",
        "2027-07-02",
        "--notes",
        "ok",
        "--yes",
      ]),
    ).toBe(0);
    const noteId = await idAt(h.store, 8);
    expect(await h.exec(["edit", noteId, "--reason", "texto", "--notes", "mejor", "--yes"])).toBe(
      0,
    );
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
        "1",
        "--requested-date",
        "2027-03-01",
        "--yes",
      ]),
    ).toBe(0);
    const requestId = await idAt(h.store, 11);
    expect(
      await h.exec(["edit", requestId, "--reason", "cantidad", "--quantity-out", "2", "--yes"]),
    ).toBe(0);
    expect(
      await h.exec([
        "transfer",
        "update",
        await idAt(h.store, 13),
        "--stage",
        "redeemed",
        "--date",
        "2027-03-03",
        "--yes",
      ]),
    ).toBe(0);
    expect(
      await h.exec([
        "edit",
        await idAt(h.store, 14),
        "--reason",
        "fecha",
        "--date",
        "2027-03-04",
        "--yes",
      ]),
    ).toBe(0);
    expect((await h.store.load()).events).toHaveLength(17);
  });
});
