// The rehearsal of `docs/runbooks/stolen-google-account.md` with the doubles: its steps in their
// order, with the user's session of the web and the intruder's over one remote, both signed in with
// the same stolen Google account. Every step that needs no real AWS is walked: the allow list and
// the session key are written in the double of SSM, as the script of secrets or the AWS CLI would.

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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

type Api = ReturnType<typeof setup>;
const LEDGER_KEY = "ledger/ledger.jsonl";
const SESSION = "__Host-atlas_session";

const base = (): string[] => {
  const b = new Events();
  b.settings(CLI_SETTINGS);
  // No line with a fingerprint: the copy has to pass `check --deep` to be
  // restored, and the builder of the tests writes placeholder fingerprints.
  b.account("acc_ib", "IE");
  return b.build().map(encodeLine);
};

const textOf = (lines: readonly string[]) => lines.map((line) => `${line}\n`).join("");

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

/** A session of the web, signed in from scratch: its cookie alone. */
const webSession = async (api: Api): Promise<string> => {
  api.jar.clear();
  await api.signIn(ALLOWED);
  const cookie = api.session() as string;
  api.jar.clear();
  return cookie;
};

const as = (api: Api, cookie: string, path = "/api/session") =>
  api.call("GET", path, { jar: false, cookies: [`${SESSION}=${cookie}`] });

describe("the stolen Google account, rehearsed step by step with the doubles", () => {
  it("walks the steps in their order, and leaves the intruder out and the user in", async () => {
    const api = setup();
    api.s3.seed(LEDGER_KEY, textOf(base()));
    // The copy of the user, out of AWS: what the restore will use.
    const copies = await mkdtemp(join(tmpdir(), "atlas-copy-"));
    const userCopy = join(copies, "ledger-2026-10-01.jsonl");
    await writeFile(userCopy, textOf(base()));
    const user = await webSession(api);
    // The intruder, with the stolen account: a session of the web that records a line.
    const intruder = await webSession(api);
    const ledger = await as(api, intruder, "/api/ledger");
    const b = new Events();
    const INTRUDER_LINE = b.deposit("acc_ib", "2026-09-30", "1");
    const appended = await api.call("POST", "/api/ledger/lines", {
      jar: false,
      cookies: [`${SESSION}=${intruder}`],
      headers: {
        origin: SELF,
        "content-type": "application/json",
        "if-match": ledger.headers.etag as string,
      },
      body: JSON.stringify({ lines: [{ line: encodeLine(INTRUDER_LINE) }] }),
    });
    expect(appended.statusCode).toBe(200);

    // 1. The pair out of the allow list; the cache of 120 s goes by. Nobody
    //    with that account gets in.
    api.ssm.set(NAMES.allowList, allowListOf());
    api.advance(120_000);
    for (const cookie of [user, intruder]) {
      expect(errorOf(await as(api, cookie)).code).toBe("not_allowed");
    }

    // 2. Recovering the account happens at Google: nothing of Atlas.

    // 3. The session key rotated, and the cache of 300 s gone by: every cookie
    //    signed before is refused, whatever happens to the list later.
    api.ssm.set(NAMES.sessionKey, base64url(Buffer.alloc(32, 5)));
    api.advance(300_000);

    // 4.1. The ledger of the cloud, down to a folder with the role of
    //      administration: the intruder's line is there to see.
    const pulled = await mkdtemp(join(tmpdir(), "atlas-pull-"));
    const looking = await adminConsole(api, "no");
    expect(await looking.exec(["admin", "pull", "--env", "test", "--to", pulled])).toBe(EXIT.ok);
    expect(await readFile(join(pulled, "ledger.jsonl"), "utf8")).toContain(INTRUDER_LINE.id);
    // And compared with the user's copy: step 3 of the restore names it, a «no» touches nothing.
    const remoteBefore = api.s3.text(LEDGER_KEY);
    looking.reset();
    expect(await looking.exec(["admin", "restore", "--env", "test", "--from", userCopy])).toBe(
      EXIT.ok,
    );
    expect(looking.text()).toContain(`se pierde esta cola de 1 eventos: ${INTRUDER_LINE.id}`);
    expect(looking.text()).toContain("Cancelado");
    expect(api.s3.text(LEDGER_KEY)).toBe(remoteBefore);

    // 4.2. Restored, typing the environment.
    const restoring = await adminConsole(api, "test");
    expect(await restoring.exec(["admin", "restore", "--env", "test", "--from", userCopy])).toBe(
      EXIT.ok,
    );
    expect(api.s3.text(LEDGER_KEY)).toBe(await readFile(userCopy, "utf8"));
    expect(api.s3.keys().some((key) => key.startsWith("archive/pre-restore-"))).toBe(true);

    // 5. Only now the pair back; the cache goes by. The old cookies stay out,
    //    the intruder's too; the user signs in again and reads the ledger.
    api.ssm.set(NAMES.allowList, allowListOf(ALLOWED));
    api.advance(120_000);
    for (const cookie of [user, intruder]) {
      expect(errorOf(await as(api, cookie)).code).toBe("session_invalid");
    }
    const again = await webSession(api);
    const read = await as(api, again, "/api/ledger");
    expect(read.statusCode).toBe(200);
    expect(read.body).not.toContain(INTRUDER_LINE.id);
  });

  it("closes the intruder's sessions at once from the web, before anything else", async () => {
    const api = setup();
    const user = await webSession(api);
    api.advance(1_000);
    const intruder = await webSession(api);
    api.advance(1_000);
    const closed = await api.call("POST", "/api/auth/logout-all", {
      jar: false,
      cookies: [`${SESSION}=${user}`],
      headers: { origin: SELF, "content-type": "application/json" },
      body: "{}",
    });
    expect(closed.statusCode).toBe(204);
    expect(errorOf(await as(api, intruder)).code).toBe("session_invalid");
  });
});
