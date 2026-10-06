// A folder that still carries what the old queue left (`sync/state.json`,
// ADR-0026) is a local folder: nothing reads the marker any more, so nothing
// is refused for it (ADR-0035, E5). The marker is written by hand, in the
// shape the old client wrote, because the engine that wrote it is gone.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_SETTINGS, Events } from "../events.js";
import { folder } from "../prices/folder.js";

const MARKER = (status: string) =>
  `${JSON.stringify({ sync_format: 1, status, lines: 0, prefix_sha256: "" })}\n`;

const ledger = () => {
  const b = new Events();
  b.settings(CLI_SETTINGS);
  b.account("acc_ib", "IE");
  b.asset("etf_a", "etf");
  b.deposit("acc_ib", "2027-01-04", "70000");
  b.buy("acc_ib", "etf_a", "2027-01-05", "100", "500");
  return b.build();
};

const leftover = async (dir: string, marker: string | undefined) => {
  await mkdir(join(dir, "sync"), { recursive: true });
  if (marker !== undefined) {
    await writeFile(join(dir, "sync", "state.json"), marker);
  }
};

describe("atlas compact on a folder with the marker of the old queue", () => {
  it.each([
    ["enabled", () => MARKER("enabled")],
    ["disabled", () => MARKER("disabled")],
    ["unreadable", () => "{"],
    ["missing, with sync/ present", () => undefined],
  ])("goes on as in any local folder: marker %s", async (_what, marker) => {
    const f = await folder(ledger());
    await leftover(f.dir, marker());
    const result = await f.atlas("compact", "--yes");
    expect(result.code).toBe(0);
    expect(result.text).toContain("Nada que compactar");
  });
});

describe("atlas settings set --accept-invalid on a local folder", () => {
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

  it("is as in any local folder with the marker of the old queue next to the ledger", async () => {
    const f = await reorderable();
    await leftover(f.dir, MARKER("enabled"));
    expect((await change(f)).code).toBe(0);
  });
});
