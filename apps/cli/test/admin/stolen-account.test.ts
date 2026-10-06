// The rehearsal of `docs/runbooks/stolen-google-account.md` with the doubles
// (feature 015, E5; review of PR #98, B1 of security; §35): the six steps in
// their order, with the user's console and the intruder's over one remote,
// both signed in with the same stolen Google account. Every step that needs
// no real AWS is walked: the allow list and the session key are written in
// the double of SSM, as the script of secrets or the AWS CLI would.

import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { base64url } from "@atlas/adapters/access";
import { encodeLine } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeSecrets } from "../../../../packages/adapters/test/aws/test-only-fake-secrets.js";
import {
  ALLOWED,
  allowListOf,
  CONFIG,
  errorOf,
  NAMES,
  SELF,
  setup,
} from "../../../api/test/harness.js";
import type { AdminAccess } from "../../src/admin/environment.js";
import { EXIT } from "../../src/context.js";
import { CLI_SETTINGS, Events } from "../events.js";
import { harness, seed } from "../harness.js";
import { type Api, type ConsoleUnderTest, setupConsole } from "../support/console.js";
import { dashRandom } from "../support/dash-ids.js";

const LEDGER_KEY = "ledger/ledger.jsonl";

const base = (): string[] => {
  const b = new Events();
  b.settings(CLI_SETTINGS);
  // No line with a fingerprint: the replica has to pass `check --deep` to be
  // restored, and the builder of the tests writes placeholder fingerprints.
  b.account("acc_ib", "IE");
  return b.build().map(encodeLine);
};

const textOf = (lines: readonly string[]) => lines.map((line) => `${line}\n`).join("");
const deviceOf = async (c: ConsoleUnderTest): Promise<string> =>
  (Object.values((await c.readCredentialsFile()).entries) as { device_id: string }[])[0]
    ?.device_id as string;
const said = (c: ConsoleUnderTest) => [...c.out, ...c.err].join("\n");

/** The console of the administrator, from an empty folder, answering `typed`. */
const adminConsole = async (api: Api, typed: string) => {
  const admin: AdminAccess = {
    clientsFor: async () => ({
      objects: api.s3,
      parameters: api.ssm,
      secrets: new TestOnlyFakeSecrets(),
      ssmPrefix: CONFIG.ssmPrefix,
    }),
  };
  const folder = await mkdtemp(join(tmpdir(), "atlas-admin-"));
  return harness({ events: seed(), admin, ledgerPath: join(folder, "ledger.jsonl"), typed });
};

describe("the stolen Google account, rehearsed step by step with the doubles", () => {
  it("walks the six steps in their order, and leaves the intruder out and the user in", async () => {
    // The user's console, a cloud folder with its ledger uploaded. Every device
    // id begins with `--`, never by chance.
    const user = await setupConsole({ confirmReissue: true }, setup({ random: dashRandom() }));
    const initial = join(user.root, "initial.jsonl");
    await writeFile(initial, textOf(base()));
    expect(await user.exec(["remote", "login", "--origin", SELF])).toBe(0);
    expect(await user.exec(["remote", "upload", "--from", initial, "--yes"])).toBe(0);
    const userDevice = await deviceOf(user);
    const api = user.api;
    // The copy of the user, down from the cloud: what the restore will use.
    const copies = join(user.root, "copias");
    expect(await user.exec(["backup", "--to", copies])).toBe(0);
    const [copyName] = await readdir(copies);
    const userCopy = join(copies, copyName as string);
    // The intruder, with the stolen account: a console of its own, which
    // records a line in the cloud, and a session of the web.
    const intruder = await setupConsole({}, api);
    expect(await intruder.exec(["remote", "login", "--origin", SELF])).toBe(0);
    expect(
      await intruder.exec([
        "add",
        "cash-in",
        "--account",
        "acc_ib",
        "--value-date",
        "2027-02-01",
        "--amount",
        "1",
        "--currency",
        "EUR",
        "--yes",
      ]),
    ).toBe(0);
    const INTRUDER_LINE = /"id":"([0-9A-Z]{26})"/.exec(
      (api.s3.text(LEDGER_KEY) as string).trimEnd().split("\n").at(-1) as string,
    )?.[1] as string;
    expect(INTRUDER_LINE).toBeDefined();
    await api.signIn(ALLOWED);
    expect((await api.call("GET", "/api/session")).statusCode).toBe(200);
    const intruderDevice = await deviceOf(intruder);

    // 1. The pair out of the allow list; the cache of 120 s goes by. Nobody
    //    with that account gets in: the user's console neither.
    api.ssm.set(NAMES.allowList, allowListOf());
    api.advance(120_000);
    expect(await user.exec(["check"])).not.toBe(EXIT.ok);
    expect(said(user)).toContain("no está en la lista permitida");
    expect(await intruder.exec(["check"])).not.toBe(EXIT.ok);

    // 2. Recovering the account happens at Google: nothing of Atlas.

    // 3. Every token revoked, with the role of administration.
    const admin = await adminConsole(api, "test");
    expect(await admin.exec(["admin", "revoke-all-tokens", "--env", "test"])).toBe(EXIT.ok);
    expect(admin.text()).toContain("Revocados 2 tokens");

    // 4. The session key rotated, and the cache of 300 s gone by: the
    //    intruder's cookie is refused.
    api.ssm.set(NAMES.sessionKey, base64url(Buffer.alloc(32, 5)));
    api.advance(300_000);
    expect(errorOf(await api.call("GET", "/api/session")).code).toBe("session_invalid");

    // 5.1. The intruder's device forgotten first.
    admin.reset();
    expect(await admin.exec(["admin", "devices", "--env", "test"])).toBe(EXIT.ok);
    expect(admin.text()).toContain(intruderDevice);
    admin.reset();
    // After `--`, as the runbook writes it: a device id may begin with a dash.
    expect(intruderDevice.startsWith("--")).toBe(true);
    expect(
      await admin.exec(["admin", "forget-device", "--env", "test", "--", intruderDevice]),
    ).toBe(EXIT.ok);
    expect(JSON.parse(api.s3.text(`sync/devices/${intruderDevice}.json`) as string).state).toBe(
      "forgotten",
    );

    // 5.2. The remote reviewed with the role of administration, against the
    //      user's replica: its step 3 names the intruder's line, and a «no»
    //      at step 4 touches nothing.
    const remoteBefore = api.s3.text(LEDGER_KEY);
    const looking = await adminConsole(api, "no");
    expect(await looking.exec(["admin", "restore", "--env", "test", "--from", userCopy])).toBe(
      EXIT.ok,
    );
    expect(looking.text()).toContain(`se pierde esta cola de 1 eventos: ${INTRUDER_LINE}`);
    expect(looking.text()).toContain("Cancelado");
    expect(api.s3.text(LEDGER_KEY)).toBe(remoteBefore);

    // 5.3. Restored there, typing the environment.
    const restoring = await adminConsole(api, "test");
    expect(await restoring.exec(["admin", "restore", "--env", "test", "--from", userCopy])).toBe(
      EXIT.ok,
    );
    expect(api.s3.text(LEDGER_KEY)).toBe(await readFile(userCopy, "utf8"));
    expect(api.s3.keys().some((key) => key.startsWith("archive/pre-restore-"))).toBe(true);

    // 6. Only now the pair back; the cache goes by. The user signs in again
    //    and syncs; the intruder stays out, token and cookie.
    api.ssm.set(NAMES.allowList, allowListOf(ALLOWED));
    api.advance(120_000);
    user.out.length = 0;
    user.err.length = 0;
    // The first sign-in meets the revoked token and forgets it; the second
    // gives this folder's device a token again, confirmed on the page.
    expect(await user.exec(["remote", "login", "--origin", SELF])).toBe(EXIT.domain);
    expect(said(user)).toContain("device_token_revoked");
    expect(await user.exec(["remote", "login", "--origin", SELF])).toBe(EXIT.ok);
    expect(await deviceOf(user)).toBe(userDevice);
    expect(await user.exec(["check"])).toBe(EXIT.ok);
    expect(api.s3.text(LEDGER_KEY)).not.toContain(INTRUDER_LINE);
    intruder.out.length = 0;
    intruder.err.length = 0;
    expect(await intruder.exec(["check"])).not.toBe(EXIT.ok);
    expect(said(intruder)).toContain("el token de este dispositivo está revocado");
    expect(errorOf(await api.call("GET", "/api/session")).code).toBe("session_invalid");
  });
});
