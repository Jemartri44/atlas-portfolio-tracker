// Feature 015, E2: `atlas remote login | logout | status` end to end (plan
// §4.2, T27 to T36), against the API composed with its doubles of Google,
// SSM and S3 (`apps/api/test/harness.ts`). The browser of the user is a
// function that walks the start, the provider and the return; the loopback is
// a real socket on 127.0.0.1.

import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SELF } from "../../../api/test/harness.js";
import { folderTree, setupConsole, writeRemoteJson } from "../support/console.js";

describe("atlas remote login (T27 to T29, T33)", () => {
  it("signs in by loopback, keeps the token in a 600 file, and writes nothing in the folder of the ledger", async () => {
    const c = await setupConsole();
    const before = await folderTree(c.ledger);
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    expect(await folderTree(c.ledger)).toEqual(before);
    expect((await stat(c.credentials)).mode & 0o777).toBe(0o600);
    expect((await stat(join(c.config, "atlas"))).mode & 0o777).toBe(0o700);
    const file = await c.readCredentialsFile();
    const [entry] = Object.values(file.entries) as Record<string, string>[];
    expect(entry).toMatchObject({ origin: SELF, device_name: "portatil", folder_hint: c.ledger });
    expect(entry?.token).toMatch(/^atlasdt1\./);
    // The URL is always printed; the browser is only tried.
    expect(c.out.some((line) => line.startsWith(`${SELF}/api/auth/console/start?port=`))).toBe(
      true,
    );
    // The token: never in the output, the errors, a URL, nor any request but its header.
    const said = [...c.out, ...c.err].join("\n");
    expect(said).not.toContain(entry?.token as string);
    expect(c.seen.every((request) => !request.url.includes(entry?.token as string))).toBe(true);
    expect(c.seen.every((request) => request.redirect === "error")).toBe(true);
    expect(c.surf.pages.at(-1)).toBe("landed:200:no-referrer");
  });

  it("ignores a return with another state and keeps waiting for its own (mutant 22)", async () => {
    const c = await setupConsole({ wrongStateFirst: true });
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    expect(c.surf.pages).toContain("wrong:400");
    expect(c.surf.pages.at(-1)).toBe("landed:200:no-referrer");
  });

  it("signs in by hand, reading the code without showing it", async () => {
    const c = await setupConsole();
    expect(await c.exec(["remote", "login", "--origin", SELF, "--manual"])).toBe(0);
    expect(c.out.some((line) => line.includes("mode=manual"))).toBe(true);
    const file = await c.readCredentialsFile();
    expect(Object.keys(file.entries)).toHaveLength(1);
  });

  it("refuses an origin that is not https before any request, and a name out of the rule", async () => {
    const c = await setupConsole();
    expect(await c.exec(["remote", "login", "--origin", "http://atlas.example"])).toBe(64);
    expect(await c.exec(["remote", "login"])).toBe(64);
    expect(await c.exec(["remote", "login", "--origin", SELF, "--name", "a  b"])).toBe(64);
    expect(c.seen).toEqual([]);
  });

  it("renews only with the entry the folder's sync/remote.json names, never another of the same origin (B2)", async () => {
    const c = await setupConsole();
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    const [first] = Object.values((await c.readCredentialsFile()).entries) as Record<
      string,
      string
    >[];
    // A second folder signs in against the same origin: its own device.
    expect(await c.exec(["remote", "login", "--origin", SELF, "--name", "otra"])).toBe(0);
    const entries = Object.values((await c.readCredentialsFile()).entries) as Record<
      string,
      string
    >[];
    const other = entries.find((entry) => entry.device_id !== first?.device_id) as Record<
      string,
      string
    >;
    await writeRemoteJson(c.ledger, first?.device_id as string);
    c.seen.length = 0;
    expect(await c.exec(["remote", "login"])).toBe(0);
    const exchanges = c.seen.filter((request) => request.url.endsWith("/api/auth/console/token"));
    expect(exchanges.map((request) => request.token)).toEqual([first?.token]);
    const after = (await c.readCredentialsFile()).entries;
    expect(after[first?.device_id as string].token).not.toBe(first?.token);
    expect(after[other.device_id as string]).toEqual(other);
  });

  it("reissues for the device of the folder when it has no entry, after the confirmation of the page (N5)", async () => {
    const c = await setupConsole({ confirmReissue: true });
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    const [first] = Object.values((await c.readCredentialsFile()).entries) as Record<
      string,
      string
    >[];
    await writeRemoteJson(c.ledger, first?.device_id as string);
    expect(await c.exec(["remote", "logout", "--local-only"])).toBe(0);
    c.seen.length = 0;
    expect(await c.exec(["remote", "login"])).toBe(0);
    expect(c.out.some((line) => line.includes(`reissue_device_id=${first?.device_id}`))).toBe(true);
    expect(c.surf.pages.some((page) => page.includes("Volver a dar un token"))).toBe(true);
    const exchanges = c.seen.filter((request) => request.url.endsWith("/api/auth/console/token"));
    expect(exchanges.map((request) => request.token)).toEqual([null]);
    const after = (await c.readCredentialsFile()).entries;
    expect(Object.keys(after)).toEqual([first?.device_id]);
  });
});

describe("atlas remote logout (T35)", () => {
  it("lets the entry go only with the 200 of the server", async () => {
    const c = await setupConsole();
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    const [entry] = Object.values((await c.readCredentialsFile()).entries) as Record<
      string,
      string
    >[];
    await writeRemoteJson(c.ledger, entry?.device_id as string);
    c.api.ssm.throttleNext();
    expect(await c.exec(["remote", "logout"])).toBe(1);
    expect(c.err.join("\n")).toContain("remote_unavailable");
    expect(Object.keys((await c.readCredentialsFile()).entries)).toEqual([entry?.device_id]);
    expect(await c.exec(["remote", "logout"])).toBe(0);
    expect((await c.readCredentialsFile()).entries).toEqual({});
    expect(c.seen.at(-1)).toMatchObject({ token: entry?.token, redirect: "error" });
  });

  it("forgets only locally when asked, and says the token is still alive", async () => {
    const c = await setupConsole();
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    const [entry] = Object.values((await c.readCredentialsFile()).entries) as Record<
      string,
      string
    >[];
    c.seen.length = 0;
    expect(
      await c.exec(["remote", "logout", "--device", entry?.device_id as string, "--local-only"]),
    ).toBe(0);
    expect(c.seen).toEqual([]);
    expect(c.out.join("\n")).toContain("sigue vivo en el servidor");
  });
});

describe("the file of the credentials (T30)", () => {
  it("is not used with permissions open to others, nor inside the folder of the ledger", async () => {
    const c = await setupConsole();
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    await chmod(c.credentials, 0o644);
    expect(await c.exec(["remote", "status"])).toBe(1);
    expect(c.err.join("\n")).toContain("credentials_too_open");
    const inside = await setupConsole();
    inside.remote.env.XDG_CONFIG_HOME = join(inside.ledger, ".config");
    expect(await inside.exec(["remote", "login", "--origin", SELF])).toBe(1);
    expect(inside.err.join("\n")).toContain("credentials_inside_ledger");
    expect(inside.seen).toEqual([]);
  });
});

describe("atlas remote status (T36)", () => {
  it("says the sessions of the folder and warns inside the threshold, never showing the token", async () => {
    const c = await setupConsole();
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    const [entry] = Object.values((await c.readCredentialsFile()).entries) as Record<
      string,
      string
    >[];
    await writeRemoteJson(c.ledger, entry?.device_id as string);
    c.out.length = 0;
    expect(await c.exec(["remote", "status"])).toBe(0);
    expect(c.out.join("\n")).not.toContain("Caduca en");
    c.api.advance(77 * 86_400_000);
    expect(await c.exec(["remote", "status"])).toBe(0);
    expect(c.out.join("\n")).toContain("Caduca en 13 días");
    expect(c.out.join("\n")).not.toContain(entry?.token as string);
  });
});

describe("what the review of PR #95 found in the console", () => {
  const entryOf = async (c: Awaited<ReturnType<typeof setupConsole>>) =>
    Object.values((await c.readCredentialsFile()).entries)[0] as Record<string, string>;

  it("says «less than a day» with hours left, and «expired» only once expired (N1)", async () => {
    const c = await setupConsole();
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    const entry = await entryOf(c);
    await writeRemoteJson(c.ledger, entry.device_id as string);
    const expires = Date.parse(entry.expires_at as string);
    c.api.advance(expires - c.api.nowMs() - 23 * 3_600_000);
    c.out.length = 0;
    expect(await c.exec(["remote", "status"])).toBe(0);
    expect(c.out.join("\n")).toContain("Caduca en menos de un día");
    expect(c.out.join("\n")).not.toContain("Ha caducado");
    c.api.advance(23 * 3_600_000);
    c.out.length = 0;
    expect(await c.exec(["remote", "status"])).toBe(0);
    expect(c.out.join("\n")).toContain("Ha caducado");
  });

  it("keeps an entry another console wrote meanwhile: it reads the file again before writing (N2)", async () => {
    const c = await setupConsole();
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    const first = await entryOf(c);
    // While this sign-in waits for the browser, another terminal signs in.
    c.hooks.onOpen = async () => {
      const file = await c.readCredentialsFile();
      const other = { ...first, device_id: "OTHERTERMINALOTHERTERM", folder_hint: "/otra" };
      file.entries[other.device_id] = other;
      await writeFile(c.credentials, JSON.stringify(file), { mode: 0o600 });
      c.hooks.onOpen = undefined;
    };
    expect(await c.exec(["remote", "login", "--origin", SELF, "--name", "otra"])).toBe(0);
    const entries = (await c.readCredentialsFile()).entries;
    expect(Object.keys(entries)).toHaveLength(3);
    expect(entries.OTHERTERMINALOTHERTERM).toBeDefined();
  });

  it("warns when the folder of the credentials is open to others (N4)", async () => {
    const c = await setupConsole();
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    expect(c.err.join("\n")).not.toContain("700");
    // Open to the group only, or to the others only: both warn.
    for (const mode of [0o750, 0o705]) {
      await chmod(join(c.config, "atlas"), mode);
      c.err.length = 0;
      expect(await c.exec(["remote", "status"])).toBe(0);
      expect(c.err.join("\n")).toContain("chmod 700");
    }
    await chmod(join(c.config, "atlas"), 0o700);
    c.err.length = 0;
    expect(await c.exec(["remote", "status"])).toBe(0);
    expect(c.err.join("\n")).not.toContain("chmod 700");
  });

  it("stores nothing from an answer that is not a valid entry (N5)", async () => {
    const c = await setupConsole();
    c.hooks.tamper = (path, body) =>
      path === "/api/auth/console/token" ? body.replace(/atlasdt1\.[^"]+/, "not-a-token") : body;
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(1);
    expect(c.err.join("\n")).toContain("console_response_invalid");
    await expect(stat(c.credentials)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("stores nothing when a renewal answers for another device (N5)", async () => {
    const c = await setupConsole();
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    const entry = await entryOf(c);
    await writeRemoteJson(c.ledger, entry.device_id as string);
    const before = await readFile(c.credentials, "utf8");
    c.hooks.tamper = (path, body) =>
      path === "/api/auth/console/token"
        ? body.replace(entry.device_id as string, "ANOTHERDEVICEANOTHERDE")
        : body;
    expect(await c.exec(["remote", "login"])).toBe(1);
    expect(c.err.join("\n")).toContain("console_response_invalid");
    expect(await readFile(c.credentials, "utf8")).toBe(before);
  });

  it("refuses a new token whose device already has an entry of another origin (round 2, N5)", async () => {
    const c = await setupConsole();
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    const entry = await entryOf(c);
    // The entry of that device now says another origin, as if it came from it.
    const file = await c.readCredentialsFile();
    file.entries[entry.device_id as string].origin = "https://other.example";
    await writeFile(c.credentials, JSON.stringify(file), { mode: 0o600 });
    const before = await readFile(c.credentials, "utf8");
    // A server of SELF answering a new sign-in with that device id.
    c.hooks.tamper = (path, body) =>
      path === "/api/auth/console/token"
        ? body.replace(/"device_id":"[^"]+"/, `"device_id":"${entry.device_id}"`)
        : body;
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(1);
    expect(c.err.join("\n")).toContain("credentials_other_origin");
    expect(await readFile(c.credentials, "utf8")).toBe(before);
  });

  it("drops the local entry when the token to renew is revoked, so the next sign-in reissues (§21)", async () => {
    const c = await setupConsole();
    expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    const entry = await entryOf(c);
    await writeRemoteJson(c.ledger, entry.device_id as string);
    await c.api.call("POST", "/api/auth/console/revoke", {
      headers: {
        "x-atlas-device-token": entry.token as string,
        "content-type": "application/json",
      },
      body: "{}",
      jar: false,
    });
    expect(await c.exec(["remote", "login"])).toBe(1);
    expect(c.err.join("\n")).toContain("device_token_revoked");
    expect((await c.readCredentialsFile()).entries).toEqual({});
  });
});
