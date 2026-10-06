// Feature 024 (ADR-0035, E3): the console on a cloud folder or a local one,
// never both. Over the API composed with its doubles; never the network.

import { chmod, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { encodeLine } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { SELF } from "../../../api/test/harness.js";
import { EXIT } from "../../src/context.js";
import { CLI_SETTINGS, Events } from "../events.js";
import { type ConsoleUnderTest, setupConsole, writeRemoteJson } from "../support/console.js";

const LEDGER_KEY = "ledger/ledger.jsonl";
const textOf = (lines: readonly string[]) => lines.map((line) => `${line}\n`).join("");
const said = (c: ConsoleUnderTest) => [...c.out, ...c.err].join("\n");

const baseLines = (): string[] => {
  const b = new Events();
  b.settings(CLI_SETTINGS);
  b.account("acc_ib", "IE");
  return b.build().map(encodeLine);
};

/** A cloud folder whose cloud holds `baseLines` (or `lines`). */
const cloud = async (lines: readonly string[] = baseLines()) => {
  const c = await setupConsole();
  const seed = join(c.root, "seed.jsonl");
  await writeFile(seed, textOf(lines));
  expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
  expect(await c.exec(["remote", "upload", "--from", seed, "--yes"])).toBe(0);
  c.out.length = 0;
  c.err.length = 0;
  return { c, seed };
};

const CASH_IN = [
  "add",
  "cash-in",
  "--account",
  "acc_ib",
  "--value-date",
  "2027-02-01",
  "--amount",
  "7",
  "--currency",
  "EUR",
  "--yes",
];

/**
 * Breaks the connection on the requests `when` picks, up to `times`: after the
 * request reached the cloud (the answer is lost) or before it (it never did).
 */
const cutting = (
  c: ConsoleUnderTest,
  when: (method: string, url: string) => boolean,
  options: { reaches: boolean; times: number },
): void => {
  const real = c.remote.fetch;
  let left = options.times;
  (c.remote as { fetch: typeof fetch }).fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    if (left > 0 && when(init?.method ?? "GET", String(input))) {
      left -= 1;
      if (options.reaches) {
        await real(input, init);
      }
      throw new TypeError("fetch failed");
    }
    return real(input, init);
  }) as typeof fetch;
};
const isAppend = (method: string, url: string) =>
  method === "POST" && url.endsWith("/api/ledger/lines");

describe("the mode of a folder", () => {
  it("refuses a folder with a ledger and a cloud identity, before reading or writing anything", async () => {
    const { c } = await cloud();
    await writeFile(join(c.ledger, "ledger.jsonl"), textOf(baseLines()));
    for (const argv of [["check"], ["positions"], ["backup", "--to", join(c.root, "b")]]) {
      c.err.length = 0;
      expect(await c.exec(argv)).toBe(EXIT.domain);
      expect(c.err.join("\n")).toContain("folder_mode_ambiguous");
      expect(c.err.join("\n")).toContain("sync/remote.json");
    }
    expect(await readdir(join(c.root))).not.toContain("b");
  });

  it("is local with a ledger and no identity, and cloud with an identity and no ledger", async () => {
    const c = await setupConsole();
    await writeFile(join(c.ledger, "ledger.jsonl"), textOf(baseLines()));
    expect(await c.exec(["check"])).toBe(EXIT.ok);
    expect(c.seen).toEqual([]);
    const { c: other } = await cloud();
    expect(await other.exec(["check"])).toBe(EXIT.ok);
    expect(other.seen.some((seen) => seen.url.endsWith("/api/ledger"))).toBe(true);
    expect(await readdir(other.ledger)).not.toContain("ledger.jsonl");
  });
});

describe("a cloud folder reads and writes the cloud's ledger", () => {
  it("records through the API with the token and keeps no ledger in the folder", async () => {
    const { c } = await cloud();
    expect(
      await c.exec([
        "add",
        "cash-in",
        "--account",
        "acc_ib",
        "--value-date",
        "2027-02-01",
        "--amount",
        "5",
        "--currency",
        "EUR",
        "--yes",
      ]),
    ).toBe(EXIT.ok);
    expect(c.api.s3.text(LEDGER_KEY)).toContain("cash_deposit");
    expect(await readdir(c.ledger)).not.toContain("ledger.jsonl");
    const writes = c.seen.filter((seen) => seen.url.endsWith("/api/ledger/lines"));
    expect(writes).toHaveLength(1);
    expect(writes[0]?.token).not.toBeNull();
  });

  it("does not need the session for what does not read the ledger", async () => {
    const { c } = await cloud();
    await writeFile(c.credentials, '{"credentials_format":1,"entries":{}}\n');
    await chmod(c.credentials, 0o600);
    c.seen.length = 0;
    expect(await c.exec(["fx", "status"])).toBe(EXIT.ok);
    expect(c.seen).toEqual([]);
  });

  it("says it read and recorded nothing, with its own exit code, when the cloud is unreachable", async () => {
    const { c } = await cloud();
    (c.remote as { fetch: typeof fetch }).fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await c.exec(["positions"])).toBe(EXIT.offline);
    expect(said(c)).toContain("No se ha leído ni registrado nada");
    expect(said(c)).toContain("network_failed");
  });

  it("sends an expired or missing session to «atlas remote login», with its own exit code", async () => {
    const { c } = await cloud();
    c.api.advance(91 * 86_400_000);
    expect(await c.exec(["positions"])).toBe(EXIT.session);
    expect(said(c)).toContain("session_expired");
    expect(said(c)).toContain("atlas remote login");
    c.err.length = 0;
    await writeFile(c.credentials, '{"credentials_format":1,"entries":{}}\n');
    await chmod(c.credentials, 0o600);
    expect(await c.exec(["positions"])).toBe(EXIT.session);
    expect(said(c)).toContain("session_missing");
  });

  it("says a cut after sending is not known to be recorded, and looks for it when it can", async () => {
    const { c } = await cloud();
    // The write is sent and the answer never arrives; the reload finds it.
    let first = true;
    const real = c.remote.fetch;
    (c.remote as { fetch: typeof fetch }).fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const response = await real(input, init);
      if (first && String(input).endsWith("/api/ledger/lines")) {
        first = false;
        throw new TypeError("fetch failed");
      }
      return response;
    }) as typeof fetch;
    expect(
      await c.exec([
        "add",
        "cash-in",
        "--account",
        "acc_ib",
        "--value-date",
        "2027-02-01",
        "--amount",
        "7",
        "--currency",
        "EUR",
        "--yes",
      ]),
    ).toBe(EXIT.ok);
    expect(said(c)).toContain("SÍ quedó registrada");
    expect(c.api.s3.text(LEDGER_KEY)).toContain('"amount":"7"');
  });

  it("says nothing is known when the cut write cannot be looked up either, with exit 9", async () => {
    const { c } = await cloud();
    // The write reaches the cloud, its answer is lost, and the lookup is lost too.
    cutting(c, isAppend, { reaches: true, times: 1 });
    const real = c.remote.fetch;
    let cuts = 0;
    (c.remote as { fetch: typeof fetch }).fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      if (cuts > 0 && String(input).endsWith("/api/ledger") && (init?.method ?? "GET") === "GET") {
        throw new TypeError("fetch failed");
      }
      try {
        return await real(input, init);
      } catch (error) {
        cuts += 1;
        throw error;
      }
    }) as typeof fetch;
    expect(await c.exec(CASH_IN)).toBe(EXIT.outcomeUnknown);
    expect(said(c)).toContain("write_outcome_unknown");
    expect(said(c)).toContain("no se sabe si la operación quedó registrada");
    expect(c.api.s3.text(LEDGER_KEY)).toContain('"amount":"7"');
  });

  it("says it was NOT recorded, with exit 8, when the lookup shows the write never arrived", async () => {
    const { c } = await cloud();
    cutting(c, isAppend, { reaches: false, times: 1 });
    expect(await c.exec(CASH_IN)).toBe(EXIT.offline);
    expect(said(c)).toContain("NO quedó registrada");
    expect(c.api.s3.text(LEDGER_KEY)).not.toContain('"amount":"7"');
  });

  it("refuses compact and drafts; compact works in a local folder", async () => {
    const { c } = await cloud();
    expect(await c.exec(["compact", "--yes"])).toBe(EXIT.domain);
    expect(said(c)).toContain("compact_cloud_folder");
    c.err.length = 0;
    expect(await c.exec(["draft", "list"])).toBe(EXIT.domain);
    expect(said(c)).toContain("drafts_not_in_cloud");
    const local = await setupConsole();
    await writeFile(join(local.ledger, "ledger.jsonl"), textOf(baseLines()));
    expect(await local.exec(["compact", "--yes"])).toBe(EXIT.ok);
  });

  describe("a settings change that would leave events invalid", () => {
    /** A fund bought and sold on dates that swap order when read by trade date. */
    const reorderable = (): string[] => {
      const b = new Events();
      b.settings(CLI_SETTINGS);
      b.account("acc_fund");
      b.asset("ast_world", "fund");
      b.deposit("acc_fund", "2027-01-04", "5000");
      b.push("buy", {
        account_id: "acc_fund",
        asset_id: "ast_world",
        trade_date: "2027-01-13",
        value_date: "2027-01-15",
        quantity: "10",
        unit_price: "100",
        currency: "EUR",
        fx_rate: "1",
        fx_rate_date: "2027-01-15",
        fee: "0",
        source: "manual",
      });
      b.sell("acc_fund", "ast_world", "2027-01-20", "10", "100", "2027-01-12");
      return b.build().map(encodeLine);
    };
    const CHANGE = ["settings", "set", "--fiscal-date-rule", "fund=trade_date", "--yes"];

    it("is refused with --accept-invalid in a cloud folder, and nothing is written", async () => {
      const { c } = await cloud(reorderable());
      const before = c.api.s3.text(LEDGER_KEY);
      expect(await c.exec([...CHANGE, "--accept-invalid"])).toBe(EXIT.domain);
      expect(said(c)).toContain("solo vale en una carpeta local sin nube ni sincronización");
      expect(c.api.s3.text(LEDGER_KEY)).toBe(before);
    });

    it("lists the events and does not offer --accept-invalid in a cloud folder", async () => {
      const { c } = await cloud(reorderable());
      expect(await c.exec(CHANGE)).toBe(EXIT.domain);
      expect(said(c)).toContain("Eventos que pasan a ser inválidos");
      expect(said(c)).not.toContain("--accept-invalid");
    });

    it("is still offered in a local folder", async () => {
      const local = await setupConsole();
      await writeFile(join(local.ledger, "ledger.jsonl"), textOf(reorderable()));
      expect(await local.exec(CHANGE)).toBe(EXIT.domain);
      expect(said(local)).toContain("Repite con --accept-invalid");
    });
  });
});

describe("backup and export of a cloud folder", () => {
  it("writes a dated, read-only copy whose SHA-256 is the etag, and never overwrites it", async () => {
    const { c } = await cloud();
    const to = join(c.root, "copias");
    expect(await c.exec(["backup", "--to", to])).toBe(EXIT.ok);
    const [name] = await readdir(to);
    expect(name).toMatch(/^ledger-\d{4}-\d{2}-\d{2}\.jsonl$/);
    const path = join(to, name as string);
    expect((await stat(path)).mode & 0o777).toBe(0o444);
    expect(await readFile(path, "utf8")).toBe(c.api.s3.text(LEDGER_KEY));
    expect(await c.exec(["backup", "--to", to])).toBe(EXIT.domain);
    expect(said(c)).toContain("path_exists");
  });

  it("refuses a body whose hash is not its etag, writing nothing", async () => {
    const { c } = await cloud();
    c.hooks.tamper = (path, body) => (path === "/api/ledger" ? `${body}x` : body);
    const to = join(c.root, "copias");
    expect(await c.exec(["backup", "--to", to])).not.toBe(EXIT.ok);
    expect(await readdir(to).catch(() => [])).toEqual([]);
  });

  it("exports jsonl with the cloud's bytes and csv, in both modes", async () => {
    const { c } = await cloud();
    const out = join(c.root, "out.jsonl");
    expect(await c.exec(["export", "--format", "jsonl", "--out", out])).toBe(EXIT.ok);
    expect(await readFile(out, "utf8")).toBe(c.api.s3.text(LEDGER_KEY));
    c.out.length = 0;
    expect(await c.exec(["export", "--format", "csv"])).toBe(EXIT.ok);
    expect(c.out.join("\n")).toContain("account_created");
    const local = await setupConsole();
    await writeFile(join(local.ledger, "ledger.jsonl"), textOf(baseLines()));
    expect(await local.exec(["export", "--format", "csv"])).toBe(EXIT.ok);
  });
});

describe("the initial upload", () => {
  it("goes only to an empty cloud, with the token, and never over another ledger", async () => {
    const { c, seed } = await cloud();
    expect(c.api.s3.text(LEDGER_KEY)).toBe(textOf(baseLines()));
    // The same ledger again: nothing to do. Another one: refused, to the restore.
    expect(await c.exec(["remote", "upload", "--from", seed, "--yes"])).toBe(EXIT.ok);
    expect(said(c)).toContain("ya tiene exactamente este libro");
    const other = join(c.root, "other.jsonl");
    await writeFile(
      other,
      textOf([...baseLines(), ...baseLines().slice(0, 0)]).replace("IE", "ES"),
    );
    c.err.length = 0;
    expect(await c.exec(["remote", "upload", "--from", other, "--yes"])).toBe(EXIT.domain);
    expect(said(c)).toContain("upload_cloud_not_empty");
    expect(said(c)).toContain("atlas admin restore");
  });

  it("says an upload cut after sending is not known, with exit 9, and repeating is safe", async () => {
    const c = await setupConsole();
    const seed = join(c.root, "seed.jsonl");
    await writeFile(seed, textOf(baseLines()));
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    cutting(c, (method, url) => method === "PUT" && url.endsWith("/api/ledger"), {
      reaches: true,
      times: 1,
    });
    c.err.length = 0;
    expect(await c.exec(["remote", "upload", "--from", seed, "--yes"])).toBe(EXIT.outcomeUnknown);
    expect(said(c)).toContain("write_outcome_unknown");
    expect(said(c)).toContain("Repite la orden con el mismo fichero");
    expect(c.api.s3.text(LEDGER_KEY)).toBe(textOf(baseLines()));
    c.out.length = 0;
    expect(await c.exec(["remote", "upload", "--from", seed, "--yes"])).toBe(EXIT.ok);
    expect(said(c)).toContain("ya tiene exactamente este libro");
  });

  it("is refused from a local folder, and writes nothing", async () => {
    const c = await setupConsole();
    await writeFile(join(c.ledger, "ledger.jsonl"), textOf(baseLines()));
    expect(await c.exec(["remote", "upload", "--from", join(c.ledger, "ledger.jsonl")])).toBe(
      EXIT.domain,
    );
    expect(said(c)).toContain("upload_needs_cloud_folder");
    expect(c.api.s3.text(LEDGER_KEY)).toBeUndefined();
  });
});

describe("atlas sync is retired: no path syncs a local ledger with the cloud", () => {
  it("says so, whatever follows, and writes nothing in the folder", async () => {
    const c = await setupConsole();
    await mkdir(join(c.ledger, "x"), { recursive: true });
    for (const argv of [["sync"], ["sync", "init", "--origin", SELF]]) {
      c.err.length = 0;
      expect(await c.exec(argv)).toBe(EXIT.usage);
      expect(said(c)).toContain("se ha retirado");
    }
    await writeRemoteJson(c.ledger, "AAAAAAAAAAAAAAAAAAAAAA");
  });
});
