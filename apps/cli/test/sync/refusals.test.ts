// What the console refuses on a synced folder, and what it copies (block 6;
// V7; §6.2 P3; data-schema.md §5, point 6).

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { holdRecords, markerFor, recordsText, serializeMarker } from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import { CLI_SETTINGS, Events } from "../events.js";
import { folder } from "../prices/folder.js";

const ledger = () => {
  const b = new Events();
  b.settings(CLI_SETTINGS);
  b.account("acc_ib", "IE");
  b.asset("etf_a", "etf");
  b.deposit("acc_ib", "2027-01-04", "70000");
  b.buy("acc_ib", "etf_a", "2027-01-05", "100", "500");
  return b.build();
};

const sync = async (dir: string, marker: string | undefined, held?: string) => {
  await mkdir(join(dir, "sync"), { recursive: true });
  if (marker !== undefined) {
    await writeFile(join(dir, "sync", "state.json"), marker);
  }
  if (held !== undefined) {
    await writeFile(join(dir, "sync", "held.jsonl"), held);
  }
};

describe("atlas compact on a synced folder", () => {
  it.each([
    ["synced", () => serializeMarker(markerFor([], 0)), "Esta carpeta está sincronizada"],
    ["with its marker unreadable", () => "{", "no se puede leer"],
    ["with sync/ and no marker", () => undefined, "falta su marcador"],
  ])("is refused %s, before anything is planned or asked", async (_what, marker, says) => {
    const f = await folder(ledger());
    await sync(f.dir, marker());
    const before = await readFile(f.ledger, "utf8");
    const result = await f.atlas("compact", "--yes");
    expect(result.code).not.toBe(0);
    expect(result.text).toContain(says);
    expect(await readFile(f.ledger, "utf8")).toBe(before);
  });

  it("goes on as ever once the sync is deactivated", async () => {
    const f = await folder(ledger());
    await sync(f.dir, serializeMarker({ ...markerFor([], 0), status: "disabled" }));
    const result = await f.atlas("compact", "--yes");
    expect(result.code).toBe(0);
    expect(result.text).toContain("Nada que compactar");
  });
});

describe("atlas backup copies what is held back, apart (P3)", () => {
  it("writes the held file beside the copy of the ledger, verified, and only when something is held", async () => {
    const f = await folder(ledger());
    const target = join(f.dir, "..", "copies");
    const first = await f.atlas("backup", "--to", target, "--yes");
    expect(first.code).toBe(0);
    expect(first.text).toContain("No hay nada retenido");
    expect((await readdir(target)).filter((name) => name.endsWith(".held.jsonl"))).toEqual([]);
    const held = recordsText(
      holdRecords(["x"], "client", { code: "new_duplicate", details: {} }, "t"),
    );
    await sync(f.dir, serializeMarker(markerFor([], 0)), held);
    const other = join(f.dir, "..", "copies-2");
    const second = await f.atlas("backup", "--to", other, "--yes");
    expect(second.code).toBe(0);
    const names = await readdir(other);
    const heldCopy = names.find((name) => name.endsWith(".held.jsonl")) as string;
    expect(await readFile(join(other, heldCopy), "utf8")).toBe(held);
    const ledgerCopy = names.find(
      (name) => name.endsWith(".jsonl") && !name.endsWith(".held.jsonl"),
    ) as string;
    expect(await readFile(join(other, ledgerCopy), "utf8")).toBe(await readFile(f.ledger, "utf8"));
  });
});

describe("atlas settings set --accept-invalid on a synced folder (V7)", () => {
  /** A fund bought and sold on dates that swap order when read by trade date. */
  const reorderable = async () => {
    const b = new Events();
    b.settings(CLI_SETTINGS);
    b.account("acc_fund");
    b.asset("ast_world", "fund");
    b.deposit("acc_fund", "2027-01-04", "5000");
    const f = await folder(b.build());
    f.instant = "2027-08-30T10:00:00.000Z";
    const trade = (side: string, trade: string, value: string) =>
      f.atlas(
        "add",
        side,
        "--account",
        "acc_fund",
        "--asset",
        "ast_world",
        "--trade-date",
        trade,
        "--value-date",
        value,
        "--quantity",
        "10",
        "--unit-price",
        "100",
        "--currency",
        "EUR",
        "--fx-rate",
        "1",
        "--fx-rate-date",
        value,
        "--yes",
      );
    expect((await trade("buy", "2027-01-13", "2027-01-15")).code).toBe(0);
    // The ids come from the clock and a fixed random source: one instant each.
    f.instant = "2027-08-30T10:00:01.000Z";
    expect((await trade("sell", "2027-01-12", "2027-01-20")).code).toBe(0);
    f.instant = "2027-08-30T10:00:02.000Z";
    return f;
  };
  const change = (f: Awaited<ReturnType<typeof reorderable>>) =>
    f.atlas(
      "settings",
      "set",
      "--fiscal-date-rule",
      "fund=trade_date",
      "--accept-invalid",
      "--yes",
    );

  it("is refused with its explanation, and nothing is written", async () => {
    const f = await reorderable();
    await sync(f.dir, serializeMarker(markerFor([], 0)));
    const before = await readFile(f.ledger, "utf8");
    const result = await change(f);
    expect(result.code).not.toBe(0);
    expect(result.text).toContain("Esta carpeta se sincroniza");
    expect(result.text).toContain("desactiva la sincronización");
    expect(await readFile(f.ledger, "utf8")).toBe(before);
  });

  it("stays as ADR-0015 without the sync, and with it deactivated", async () => {
    const f = await reorderable();
    expect((await change(f)).code).toBe(0);
    const g = await reorderable();
    await sync(g.dir, serializeMarker({ ...markerFor([], 0), status: "disabled" }));
    expect((await change(g)).code).toBe(0);
  });
});
