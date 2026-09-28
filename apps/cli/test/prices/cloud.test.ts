// Feature 016, E3, block 1 (R34-R36; mutants 22, 23 and 24): in a folder
// synced with a remote whose cloud has prices, `atlas prices update` takes
// them from the API and calls no source; what comes down is added with the
// rules of the 013, never rewriting a local byte, with the network outside
// the lock. `--from-sources` calls the sources, says it spends the quota the
// folder shares with the cloud, and spends by default the leftover of the
// plans (N2 of §15). Over the API composed with its doubles; never the network.

import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LOCK_FILE } from "@atlas/adapters";
import { encodeLine } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { SELF } from "../../../api/test/harness.js";
import { CLI_SETTINGS, Events } from "../events.js";
import { setupConsole } from "../support/console.js";
import { ScriptedSource } from "./folder.js";

const AT = "2026-09-01T00:00:00.000Z";

const close = (
  date: string,
  value: string,
  source: "eodhd" | "alpha_vantage" = "eodhd",
  fetched = "2026-10-01T05:00:00.000Z",
): string =>
  JSON.stringify({
    schema_version: 1,
    date,
    close: value,
    currency: "EUR",
    source,
    fetched_at: fetched,
  });

const text = (lines: readonly string[]): string => lines.map((line) => `${line}\n`).join("");

/** A console signed in, its folder synced, with `assets` held and their symbols declared. */
const synced = async (assets: readonly string[] = ["ast_a"]) => {
  const eodhd = new ScriptedSource("eodhd", () => ({
    ok: true,
    value: [{ date: "2026-09-30", close: "50" }],
  }));
  const alpha = new ScriptedSource("alpha_vantage", () => ({ ok: true, value: [] }));
  const holder: { secrets?: string } = {};
  const c = await setupConsole({}, undefined, {
    get secretsPath() {
      return holder.secrets;
    },
    sources: () => ({ eodhd, alpha_vantage: alpha }),
  } as never);
  holder.secrets = join(c.config, "atlas", "secrets.json");
  await mkdir(join(c.config, "atlas"), { recursive: true });
  await writeFile(holder.secrets, JSON.stringify({ eodhd: "k", alpha_vantage: "k" }));
  await chmod(holder.secrets, 0o600);
  const b = new Events();
  b.settings(CLI_SETTINGS);
  b.account("acc_ib", "IE");
  for (const asset of assets) {
    b.asset(asset);
    b.buy("acc_ib", asset, "2026-09-01", "1", "10");
  }
  await writeFile(join(c.ledger, "ledger.jsonl"), text(b.build().map(encodeLine)));
  expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
  expect(await c.exec(["sync", "init", "--origin", SELF])).toBe(0);
  await mkdir(join(c.ledger, "prices"), { recursive: true });
  await writeFile(
    join(c.ledger, "prices", "symbols.json"),
    JSON.stringify({
      symbols_format: 2,
      assets: Object.fromEntries(
        assets.map((asset) => [
          asset,
          {
            eodhd: `${asset}.X`,
            currencies: { eodhd: "EUR" },
            confirmed_at: AT,
            // Contrasted already: every call counted below is a download.
            currency_check: { eodhd: { at: AT } },
          },
        ]),
      ),
    }),
  );
  c.out.length = 0;
  c.err.length = 0;
  return { c, eodhd, alpha };
};

const local = (dir: string, name: string) => readFile(join(dir, "prices", name), "utf8");

describe("atlas prices update in a folder synced with a cloud that has prices (016, E3)", () => {
  it("takes the closes from the API, with the token of the folder, and calls no source (mutant 22)", async () => {
    const { c, eodhd, alpha } = await synced();
    const cloud = text([close("2026-09-29", "10"), close("2026-09-30", "11")]);
    c.api.s3.seed("prices/ast_a.jsonl", cloud);
    expect(await c.exec(["prices", "update"])).toBe(0);
    expect(await local(c.ledger, "ast_a.jsonl")).toBe(cloud);
    expect(eodhd.calls).toEqual([]);
    expect(alpha.calls).toEqual([]);
    const reference = c.seen.filter((seen) => seen.url.includes("/api/reference/"));
    expect(reference.map((seen) => new URL(seen.url).pathname)).toEqual([
      "/api/reference/index",
      "/api/reference/prices/ast_a.jsonl",
    ]);
    expect(reference.every((seen) => seen.token !== null && seen.redirect === "error")).toBe(true);
    expect(c.out.join("\n")).toContain("de la nube");
    const pull = JSON.parse(await local(c.ledger, "_cloud.json"));
    expect(pull).toMatchObject({ cloud_format: 1, origin: SELF });
    expect(Object.keys(pull.versions)).toEqual(["ast_a.jsonl"]);
  });

  it("adds with the rules of the 013, never rewriting a local byte (mutant 23)", async () => {
    const { c } = await synced();
    // A local line as a hand or an older version wrote it: a rewrite would show.
    const before = text([
      close("2026-09-28", "9", "alpha_vantage", "2026-09-29T06:00:00.000Z").replace(
        '"close":"9"',
        '"close": "9"',
      ),
      close("2026-09-29", "10", "eodhd", "2026-09-30T06:00:00.000Z"),
    ]);
    await writeFile(join(c.ledger, "prices", "ast_a.jsonl"), before);
    c.api.s3.seed(
      "prices/ast_a.jsonl",
      text([
        close("2026-09-28", "9.5", "eodhd"), // a source before the one in force: added
        close("2026-09-29", "10.00", "eodhd"), // the same value: nothing
        close("2026-09-29", "12", "alpha_vantage"), // a source after: never
        close("2026-09-30", "11", "eodhd"), // a new date: added
      ]),
    );
    expect(await c.exec(["prices", "update"])).toBe(0);
    const after = await local(c.ledger, "ast_a.jsonl");
    expect(after.startsWith(before)).toBe(true);
    expect(after.slice(before.length)).toBe(
      text([close("2026-09-28", "9.5", "eodhd"), close("2026-09-30", "11", "eodhd")]),
    );
  });

  it("asks again only for the files whose version changed, on the version it holds", async () => {
    const { c } = await synced(["ast_a", "ast_b"]);
    c.api.s3.seed("prices/ast_a.jsonl", text([close("2026-09-29", "10")]));
    c.api.s3.seed("prices/ast_b.jsonl", text([close("2026-09-29", "20")]));
    expect(await c.exec(["prices", "update"])).toBe(0);
    const asked = () =>
      c.seen
        .filter((seen) => seen.url.includes("/api/reference/prices/"))
        .map((seen) => new URL(seen.url).pathname);
    expect(asked()).toHaveLength(2);
    c.seen.length = 0;
    expect(await c.exec(["prices", "update"])).toBe(0);
    expect(asked()).toEqual([]);
    c.api.s3.seed(
      "prices/ast_b.jsonl",
      text([close("2026-09-29", "20"), close("2026-09-30", "21")]),
    );
    expect(await c.exec(["prices", "update"])).toBe(0);
    expect(asked()).toEqual(["/api/reference/prices/ast_b.jsonl"]);
    expect(await local(c.ledger, "ast_b.jsonl")).toContain('"close":"21"');
  });

  it("downloads with the lock of the folder free, and writes under it (mutant 24)", async () => {
    const { c } = await synced();
    c.api.s3.seed("prices/ast_a.jsonl", text([close("2026-09-29", "10")]));
    const locked: boolean[] = [];
    c.hooks.tamper = (path, body) => {
      if (path.startsWith("/api/reference/")) {
        locked.push(existsSync(join(c.ledger, LOCK_FILE)));
      }
      return body;
    };
    expect(await c.exec(["prices", "update"])).toBe(0);
    expect(locked).toEqual([false, false]);
    expect(existsSync(join(c.ledger, LOCK_FILE))).toBe(false);
  });

  it("says what it could not do, calls no source and writes nothing when the API fails", async () => {
    const { c, eodhd } = await synced();
    c.hooks.tamper = (path, body) => (path === "/api/reference/index" ? "{" : body);
    expect(await c.exec(["prices", "update"])).toBe(1);
    expect(c.err.join("\n")).toContain("transport_rejected");
    expect(eodhd.calls).toEqual([]);
    expect(existsSync(join(c.ledger, "prices", "_cloud.json"))).toBe(false);
  });

  it("never falls to the sources when the session of the folder cannot be used", async () => {
    const { c, eodhd } = await synced();
    c.api.s3.seed("prices/ast_a.jsonl", text([close("2026-09-29", "10")]));
    await writeFile(c.credentials, '{"credentials_format":1,"entries":{}}\n');
    await chmod(c.credentials, 0o600);
    expect(await c.exec(["prices", "update"])).toBe(1);
    expect(c.err.join("\n")).toContain("sync_credential_missing");
    expect(eodhd.calls).toEqual([]);
    expect(existsSync(join(c.ledger, "prices", "ast_a.jsonl"))).toBe(false);
  });

  it("never takes a close of today or of a day to come, and says it (review of PR #108, B1)", async () => {
    const { c } = await synced();
    // The clock of the tests is 2026-10-01 in Madrid.
    c.api.s3.seed(
      "prices/ast_a.jsonl",
      text([close("2026-09-30", "10"), close("2026-10-01", "11"), close("2099-01-01", "12")]),
    );
    expect(await c.exec(["prices", "update"])).toBe(0);
    expect(await local(c.ledger, "ast_a.jsonl")).toBe(text([close("2026-09-30", "10")]));
    expect(c.out.join("\n")).toContain("cloud_lines_future");
    c.out.length = 0;
    expect(await c.exec(["prices", "status"])).toBe(0);
    expect(c.out.join("\n")).toContain("cloud_lines_future: 2");
  });

  it("never takes a close taken on the day of its session, not even the day after (R2-B1)", async () => {
    const { c } = await synced();
    // 2026-10-01, 12:00 in Madrid: the cloud serves a close taken at 11:00.
    const midSession = close("2026-10-01", "11", "eodhd", "2026-10-01T09:00:00.000Z");
    c.api.s3.seed("prices/ast_a.jsonl", text([close("2026-09-30", "10"), midSession]));
    expect(await c.exec(["prices", "update"])).toBe(0);
    expect(await local(c.ledger, "ast_a.jsonl")).toBe(text([close("2026-09-30", "10")]));
    expect(c.out.join("\n")).toContain("cloud_lines_future");
    // The day after, the task adds the close of the session: another version.
    c.api.advance(86_400_000);
    const final = close("2026-10-01", "12", "eodhd", "2026-10-02T05:00:00.000Z");
    c.api.s3.seed("prices/ast_a.jsonl", text([close("2026-09-30", "10"), midSession, final]));
    c.out.length = 0;
    expect(await c.exec(["prices", "update"])).toBe(0);
    expect(await local(c.ledger, "ast_a.jsonl")).toBe(text([close("2026-09-30", "10"), final]));
    expect(c.out.join("\n")).toContain("cloud_lines_future");
    c.out.length = 0;
    expect(await c.exec(["prices", "status"])).toBe(0);
    expect(c.out.join("\n")).toContain("cloud_lines_future: 1");
  });

  it("never takes a close in another currency than the folder declares for its source (N5)", async () => {
    const { c } = await synced();
    c.api.s3.seed(
      "prices/ast_a.jsonl",
      text([
        JSON.stringify({ ...JSON.parse(close("2026-09-29", "900")), currency: "GBP" }),
        close("2026-09-30", "10"),
      ]),
    );
    expect(await c.exec(["prices", "update"])).toBe(0);
    expect(await local(c.ledger, "ast_a.jsonl")).toBe(text([close("2026-09-30", "10")]));
    expect(c.out.join("\n")).toContain("cloud_currency_mismatch");
  });

  it("takes a file of the cloud that is not UTF-8 as unreadable, and asks for it again (N2)", async () => {
    const { c } = await synced();
    c.api.s3.seedBytes("prices/ast_a.jsonl", Uint8Array.from([0xff, 0xfe, 0x0a]));
    expect(await c.exec(["prices", "update"])).toBe(0);
    expect(c.out.join("\n")).toContain("de la nube no se lee");
    const pull = JSON.parse(await local(c.ledger, "_cloud.json"));
    expect(pull.versions).toEqual({});
    expect(existsSync(join(c.ledger, "prices", "ast_a.jsonl"))).toBe(false);
  });

  it("says where the prices of the folder came from, and when", async () => {
    const { c } = await synced();
    c.api.s3.seed("prices/ast_a.jsonl", text([close("2026-09-29", "10")]));
    expect(await c.exec(["prices", "update"])).toBe(0);
    c.out.length = 0;
    expect(await c.exec(["prices", "status"])).toBe(0);
    expect(c.out.join("\n")).toContain("Procedencia: de la nube");
    expect(c.out.join("\n")).toContain("2026-10-01");
  });
});

describe("the sources from a synced folder: explicit, and with the leftover of the plans (N2 of §15)", () => {
  it("calls the sources only with --from-sources, saying it spends the quota shared with the cloud", async () => {
    const { c, eodhd } = await synced(["ast_a", "ast_b", "ast_c"]);
    c.api.s3.seed("prices/ast_a.jsonl", text([close("2026-09-29", "10")]));
    expect(await c.exec(["prices", "update", "--from-sources"])).toBe(0);
    expect(c.err.join("\n")).toContain("comparte con la nube");
    // Three assets to download, and only 2 calls of EODHD by default.
    expect(eodhd.calls).toHaveLength(2);
    expect(c.seen.some((seen) => seen.url.includes("/api/reference/"))).toBe(false);
  });

  it("follows config.json when it says otherwise", async () => {
    const { c, eodhd } = await synced(["ast_a", "ast_b", "ast_c"]);
    await writeFile(join(c.ledger, "prices", "config.json"), '{"daily_calls":{"eodhd":5}}');
    expect(await c.exec(["prices", "update", "--from-sources"])).toBe(0);
    expect(eodhd.calls).toHaveLength(3);
  });

  it("says a cloud with no prices yet, and calls the sources with the leftover of the plans", async () => {
    const { c, eodhd } = await synced(["ast_a", "ast_b", "ast_c"]);
    expect(await c.exec(["prices", "update"])).toBe(0);
    expect(c.err.join("\n")).toContain("La nube todavía no tiene precios");
    expect(eodhd.calls).toHaveLength(2);
  });
});
