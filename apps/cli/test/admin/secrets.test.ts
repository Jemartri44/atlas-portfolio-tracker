// Feature 017, E4: `atlas admin secrets` against doubles of SSM; never AWS. A value is
// typed with no echo and goes into SSM and nowhere else: not the screen, not an error.

import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { DomainError } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeSecrets } from "../../../../packages/adapters/test/aws/test-only-fake-secrets.js";
import type { AdminAccess } from "../../src/admin/environment.js";
import { EXIT } from "../../src/context.js";
import { askWithoutEcho } from "../../src/output/secret-prompt.js";
import { harness, seed } from "../harness.js";

const PREFIX = "/atlas/prod/";
const SENTINEL = "SENTINEL-VALUE-9f3a";
const adminOf = (secrets: TestOnlyFakeSecrets): AdminAccess => ({
  clientsFor: async (environment) => {
    if (environment !== "prod" && environment !== "dev") {
      throw new DomainError("admin_environment_unknown", "unknown", { environment, path: "x" });
    }
    return {
      objects: undefined as never,
      parameters: undefined as never,
      secrets,
      ssmPrefix: environment === "prod" ? PREFIX : "/atlas/dev/",
    };
  },
});
const consoleWith = (
  secrets: TestOnlyFakeSecrets,
  secretLines: string[] | undefined,
  typed: string | undefined = "prod",
) => harness({ events: seed(), admin: adminOf(secrets), secretLines, confirm: true, typed });
const run = ["admin", "secrets", "--env", "prod"];
// allow-list entry, client id, client secret, (session key asks via `ask`), two keys.
const ALL = ["1081", "me@example.test", "", "client-id", "CSV-77", SENTINEL, "AKV-88"];

describe("atlas admin secrets", () => {
  it("creates each parameter with its kind and its three tags, and prints no value", async () => {
    const secrets = new TestOnlyFakeSecrets();
    const c = consoleWith(secrets, [...ALL]);
    expect(await c.exec(run)).toBe(EXIT.ok);
    expect(secrets.names()).toEqual([
      `${PREFIX}auth/allow-list`,
      `${PREFIX}auth/google-client-id`,
      `${PREFIX}auth/google-client-secret`,
      `${PREFIX}auth/session-key`,
      `${PREFIX}prices/alpha-vantage-key`,
      `${PREFIX}prices/eodhd-key`,
    ]);
    expect(secrets.kindOf(`${PREFIX}auth/google-client-id`)).toBe("String");
    expect(secrets.kindOf(`${PREFIX}prices/eodhd-key`)).toBe("SecureString");
    expect(secrets.tags(`${PREFIX}auth/allow-list`)).toEqual({
      project: "atlas",
      env: "prod",
      managed_by: "atlas-admin-secrets",
    });
    expect(JSON.parse(secrets.valueOf(`${PREFIX}auth/allow-list`) as string)).toEqual({
      allow_list_format: 1,
      entries: [{ sub: "1081", email: "me@example.test" }],
    });
    expect(secrets.valueOf(`${PREFIX}auth/session-key`)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    for (const value of ["CSV-77", SENTINEL, "AKV-88", "me@example.test"]) {
      expect(c.text()).not.toContain(value);
    }
    expect(c.text()).not.toContain(secrets.valueOf(`${PREFIX}auth/session-key`) as string);
    // Never the Terraform ones.
    expect(secrets.names().some((name) => name.includes("/mail/"))).toBe(false);
  });

  it("asks existence only (no read of a value), and overwrites only with the environment typed", async () => {
    const secrets = new TestOnlyFakeSecrets();
    secrets.preset(`${PREFIX}prices/eodhd-key`, "OLD");
    const wrong = consoleWith(secrets, ["", "", "", SENTINEL, ""], "dev");
    expect(await wrong.exec(run)).toBe(EXIT.ok);
    expect(secrets.valueOf(`${PREFIX}prices/eodhd-key`)).toBe("OLD");
    const right = consoleWith(secrets, ["", "", "", SENTINEL, ""], "prod");
    expect(await right.exec(run)).toBe(EXIT.ok);
    expect(secrets.valueOf(`${PREFIX}prices/eodhd-key`)).toBe(SENTINEL);
    expect(secrets.calls.filter((call) => call.operation === "rotate")).toHaveLength(1);
    expect(right.text()).toContain("sobrescrito");
    expect(right.text()).not.toContain(SENTINEL);
  });

  it("never carries the keys of the user to dev", async () => {
    const secrets = new TestOnlyFakeSecrets();
    const c = consoleWith(secrets, ["", "", ""]);
    expect(await c.exec(["admin", "secrets", "--env", "dev"])).toBe(EXIT.ok);
    expect(secrets.names()).toEqual([]);
    expect(c.text()).toContain("este entorno no lo lleva");
    expect(c.text()).not.toContain("clave de EODHD");
  });

  it("refuses --yes, a value on the line and a flag of another order, touching nothing", async () => {
    for (const argv of [
      [...run, "--yes"],
      [...run, SENTINEL],
      [...run, "--value", SENTINEL],
      [...run, "--force"],
    ]) {
      const secrets = new TestOnlyFakeSecrets();
      const c = consoleWith(secrets, [SENTINEL]);
      expect(await c.exec(argv)).toBe(EXIT.usage);
      expect(secrets.calls).toEqual([]);
      expect(c.text()).not.toContain(SENTINEL);
    }
  });

  it("ignores any variable of the environment as a source of a value", async () => {
    process.env.ATLAS_SECRET_VALUE = SENTINEL;
    try {
      const secrets = new TestOnlyFakeSecrets();
      const c = consoleWith(secrets, ["", "", "", "", ""], "");
      await c.exec(run);
      expect(secrets.names()).toEqual([]);
    } finally {
      delete process.env.ATLAS_SECRET_VALUE;
    }
  });

  it("leaves without touching anything when there is no terminal", async () => {
    const secrets = new TestOnlyFakeSecrets();
    const c = consoleWith(secrets, undefined);
    expect(await c.exec(run)).toBe(EXIT.noTty);
    expect(secrets.calls).toEqual([]);
  });

  it("refuses an invalid value naming the parameter and never the value", async () => {
    const secrets = new TestOnlyFakeSecrets();
    const c = consoleWith(secrets, ["1081", "not an address", "x"]);
    expect(await c.exec(run)).toBe(EXIT.domain);
    expect(c.text()).toContain("auth/allow-list");
    expect(c.text()).not.toContain("not an address");
    expect(secrets.calls.filter((call) => call.operation !== "exists")).toEqual([]);
    const spaced = consoleWith(secrets, ["", "", "has a space"]);
    expect(await spaced.exec(run)).toBe(EXIT.domain);
    expect(spaced.text()).not.toContain("has a space");
  });

  it("says nothing of what AWS answered when a write fails, a failure path included", async () => {
    const secrets = new TestOnlyFakeSecrets();
    secrets.failWith = new Error(`rejected ${SENTINEL}`);
    const c = consoleWith(secrets, ["", "", SENTINEL]);
    expect(await c.exec(run)).toBe(EXIT.domain);
    expect(c.text()).toContain("auth/google-client-secret");
    expect(c.text()).not.toContain(SENTINEL);
  });
});

describe("the prompt with no echo", () => {
  it("writes the question, reads the line and echoes none of it", async () => {
    const input = Object.assign(new PassThrough(), { isTTY: true });
    const output = new PassThrough();
    const shown: string[] = [];
    output.on("data", (chunk) => shown.push(String(chunk)));
    const asked = askWithoutEcho("valor: ", { input, output });
    input.write(`${SENTINEL}\n`);
    expect(await asked).toBe(SENTINEL);
    expect(shown.join("")).toContain("valor: ");
    expect(shown.join("")).not.toContain(SENTINEL);
  });

  it("answers nothing without a terminal", async () => {
    expect(await askWithoutEcho("x", { input: new PassThrough(), output: new PassThrough() })).toBe(
      undefined,
    );
  });

  it("keeps the price-key rule of the prices function", () => {
    const source = readFileSync("packages/adapters/src/aws/price-keys.ts", "utf8");
    expect(source).toContain("/^[\\x21-\\x7e]{1,256}$/");
  });
});
