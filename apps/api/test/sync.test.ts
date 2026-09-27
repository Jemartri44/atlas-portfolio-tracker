// Feature 015, E3: the routes of the sync (`docs/api.md` §5) over the double
// of S3, with both credentials. The API only appends: the valid stretch up to
// the first rejected line, in one conditional write, decided by the domain's
// `acceptAppend`; a stale `If-Match` writes nothing; the device publishes on
// its own object and never brings it back.

import { createHash } from "node:crypto";
import { newDevice, serializeDeviceObject } from "@atlas/domain/access";
import { EMPTY_ETAG } from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import { account, deposit, lineOf } from "../../../packages/adapters/test/fixtures.js";
import { utf8Of } from "../src/sync.js";
import { consoleLogin, errorOf, SELF, setup } from "./harness.js";

type Api = ReturnType<typeof setup>;
const LEDGER = "ledger/ledger.jsonl";
const sha = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");
const textOf = (lines: readonly string[]): string => lines.map((line) => `${line}\n`).join("");

/** The two credentials, each with the headers a write of its own carries. */
const credentials = async (api: Api): Promise<{ token: Credential; session: Credential }> => {
  const console = await consoleLogin(api);
  await api.signIn();
  const session = JSON.parse((await api.call("GET", "/api/session")).body) as {
    device_id: string;
  };
  return {
    token: {
      deviceId: console.device_id,
      headers: { "x-atlas-device-token": console.token },
      jar: false,
    },
    session: {
      deviceId: session.device_id,
      headers: { origin: SELF },
      jar: true,
    },
  };
};

interface Credential {
  readonly deviceId: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly jar: boolean;
}

const write = (
  api: Api,
  as: Credential,
  method: "POST" | "PUT",
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  api.call(method, path, {
    headers: { ...as.headers, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    jar: as.jar,
  });

const read = (api: Api, as: Credential, path: string, headers: Record<string, string> = {}) =>
  api.call("GET", path, { headers: { ...as.headers, ...headers }, jar: as.jar });

describe("GET /api/ledger (§5.1)", () => {
  it("gives the exact bytes and their SHA-256, to either credential", async () => {
    const api = setup();
    const both = await credentials(api);
    for (const as of [both.token, both.session]) {
      const empty = await read(api, as, "/api/ledger");
      expect(empty.statusCode).toBe(200);
      expect(empty.body).toBe("");
      expect(empty.headers.etag).toBe(`"${EMPTY_ETAG}"`);
      expect(empty.headers["content-type"]).toBe("application/x-ndjson; charset=utf-8");
    }
    const text = textOf([lineOf(account), lineOf(deposit)]);
    api.s3.seed(LEDGER, text);
    const full = await read(api, both.token, "/api/ledger");
    expect(full.body).toBe(text);
    expect(full.isBase64Encoded).toBe(false);
    expect(full.headers.etag).toBe(`"${sha(text)}"`);
  });

  it("sends bytes that are not UTF-8 in base64, so not one changes", async () => {
    const api = setup();
    const { token } = await credentials(api);
    const bytes = new Uint8Array([0x7b, 0xff, 0xfe, 0x0a]);
    api.s3.seedBytes(LEDGER, bytes);
    const answer = await read(api, token, "/api/ledger");
    expect(answer.isBase64Encoded).toBe(true);
    expect([...Buffer.from(answer.body, "base64")]).toEqual([...bytes]);
    expect(answer.headers.etag).toBe(`"${sha(bytes)}"`);
  });

  it("logs the public id of the token on a route of the sync, and nothing of the session", async () => {
    const api = setup();
    const both = await credentials(api);
    const record = JSON.parse(
      api.ssm.history(
        (api.ssm.writes.find((write) => write.startsWith("putNew ")) as string).slice(7),
      )[0] as string,
    );
    await read(api, both.token, "/api/ledger");
    expect(JSON.parse(api.logs.at(-1) as string)).toMatchObject({
      route: "/api/ledger",
      token_id: record.token_id,
    });
    await read(api, both.session, "/api/ledger");
    expect(JSON.parse(api.logs.at(-1) as string)).not.toHaveProperty("token_id");
  });

  it("asks for a credential, and refuses a forgotten device", async () => {
    const api = setup();
    const { token } = await credentials(api);
    expect(errorOf(await api.call("GET", "/api/ledger", { jar: false })).code).toBe(
      "unauthenticated",
    );
    api.s3.seed(
      `sync/devices/${token.deviceId}.json`,
      serializeDeviceObject({
        ...newDevice({
          deviceId: token.deviceId,
          type: "console",
          createdAt: "2026-09-01T10:00:00Z",
        }),
        state: "forgotten",
        forgotten_at: "2026-09-30T10:00:00Z",
      }),
    );
    expect(errorOf(await read(api, token, "/api/ledger"))).toEqual({
      code: "device_forgotten",
      details: { reason: "forgotten" },
    });
  });
});

describe("POST /api/ledger/lines (§5.2)", () => {
  const seeded = async () => {
    const api = setup();
    const both = await credentials(api);
    api.s3.seed(LEDGER, textOf([lineOf(account)]));
    return { api, ...both, etag: sha(textOf([lineOf(account)])) };
  };

  it("asks for If-Match (428) and writes nothing without it", async () => {
    const { api, token } = await seeded();
    const before = api.s3.etagOf(LEDGER);
    const answer = await write(api, token, "POST", "/api/ledger/lines", {
      lines: [{ line: lineOf(deposit) }],
    });
    expect(answer.statusCode).toBe(428);
    expect(errorOf(answer).code).toBe("precondition_required");
    expect(api.s3.etagOf(LEDGER)).toBe(before);
  });

  it("answers a stale or malformed If-Match with 412 and writes nothing", async () => {
    const { api, session } = await seeded();
    const before = api.s3.etagOf(LEDGER);
    for (const ifMatch of [`"${EMPTY_ETAG}"`, `W/"${sha(textOf([lineOf(account)]))}"`, "*"]) {
      const answer = await write(
        api,
        session,
        "POST",
        "/api/ledger/lines",
        { lines: [{ line: lineOf(deposit) }] },
        { "if-match": ifMatch },
      );
      expect(answer.statusCode).toBe(412);
      expect(errorOf(answer).code).toBe("precondition_failed");
    }
    expect(api.s3.etagOf(LEDGER)).toBe(before);
  });

  it("appends the lines exactly as the client wrote them, and answers the new etag", async () => {
    const { api, token, etag } = await seeded();
    const answer = await write(
      api,
      token,
      "POST",
      "/api/ledger/lines",
      { lines: [{ line: lineOf(deposit) }] },
      { "if-match": `"${etag}"` },
    );
    expect(answer.statusCode).toBe(200);
    const text = textOf([lineOf(account), lineOf(deposit)]);
    expect(api.s3.text(LEDGER)).toBe(text);
    expect(JSON.parse(answer.body)).toEqual({ etag: sha(text), lines: 2, accepted: 1 });
  });

  it("writes the valid stretch up to the first rejected line, in one conditional write", async () => {
    const { api, token, etag } = await seeded();
    const again = lineOf({ ...deposit, id: "01ARYZ6S41TSV4RRFFQ69G5FB9" });
    const puts = api.s3.conditions.length;
    const answer = await write(
      api,
      token,
      "POST",
      "/api/ledger/lines",
      // The second repeats the fingerprint of the first without confirming it;
      // the third, valid, is never written behind it.
      {
        lines: [
          { line: lineOf(deposit) },
          { line: again },
          {
            line: lineOf({ ...deposit, id: "01ARYZ6S41TSV4RRFFQ69G5FC0", fingerprint: "sha256:9" }),
          },
        ],
      },
      { "if-match": `"${etag}"` },
    );
    const body = JSON.parse(answer.body);
    expect(body.accepted).toBe(1);
    expect(body.rejected).toMatchObject({ index: 1, code: "duplicate_unconfirmed" });
    expect(api.s3.text(LEDGER)).toBe(textOf([lineOf(account), lineOf(deposit)]));
    expect(api.s3.conditions.length - puts).toBe(1);
  });

  it("writes nothing and keeps the etag when the first line is rejected", async () => {
    const { api, token, etag } = await seeded();
    const before = api.s3.etagOf(LEDGER);
    const answer = await write(
      api,
      token,
      "POST",
      "/api/ledger/lines",
      { lines: [{ line: "{not json" }] },
      { "if-match": `"${etag}"` },
    );
    expect(JSON.parse(answer.body)).toMatchObject({
      etag,
      lines: 1,
      accepted: 0,
      rejected: { index: 0, code: "line_unreadable" },
    });
    expect(api.s3.etagOf(LEDGER)).toBe(before);
  });

  it("loses the race to another writer with 412, and writes nothing of its own", async () => {
    for (const how of ["writer", "409"] as const) {
      const { api, token, etag } = await seeded();
      const other = textOf([
        lineOf(account),
        lineOf({ ...deposit, id: "01ARYZ6S41TSV4RRFFQ69G5FD0" }),
      ]);
      if (how === "writer") {
        api.s3.beforePut = (key) => {
          if (key === LEDGER) {
            api.s3.beforePut = undefined;
            api.s3.seed(LEDGER, other);
          }
        };
      } else {
        api.s3.conflictNext();
      }
      const answer = await write(
        api,
        token,
        "POST",
        "/api/ledger/lines",
        { lines: [{ line: lineOf(deposit) }] },
        { "if-match": `"${etag}"` },
      );
      expect(answer.statusCode, how).toBe(412);
      expect(api.s3.text(LEDGER)).toBe(how === "writer" ? other : textOf([lineOf(account)]));
    }
  });

  it("refuses a device_id in the body, and any other shape, as body_invalid", async () => {
    const { api, session, etag } = await seeded();
    for (const body of [
      { lines: [{ line: lineOf(deposit) }], device_id: session.deviceId },
      { lines: [{ line: `${lineOf(deposit)}\n` }] },
      { lines: "no" },
    ]) {
      const answer = await write(api, session, "POST", "/api/ledger/lines", body, {
        "if-match": `"${etag}"`,
      });
      expect(answer.statusCode).toBe(400);
      expect(errorOf(answer).code).toBe("body_invalid");
    }
  });

  it("refuses a write with the cookie and no Origin", async () => {
    const { api, etag } = await seeded();
    const answer = await api.call("POST", "/api/ledger/lines", {
      headers: { "content-type": "application/json", "if-match": `"${etag}"` },
      body: JSON.stringify({ lines: [{ line: lineOf(deposit) }] }),
    });
    expect(errorOf(answer).code).toBe("origin_rejected");
  });
});

describe("text that is not Unicode, and keys twice (review of PR #96, security B1 and N3)", () => {
  // As the attack arrives: `\ud800` once in the outer JSON, so the line
  // itself holds the lone surrogate raw after the body is parsed.
  const loneBody = (line: string, key: "lines" | "content") =>
    key === "lines"
      ? `{"lines":[{"line":${JSON.stringify(line).replace("NAME", "\\ud800")}}]}`
      : `{"content":${JSON.stringify(`${line}\n`).replace("NAME", "\\ud800")},"confirm_duplicate_ids":[]}`;
  const named = lineOf({ ...account, name: "NAME" });

  it("refuses an append with a lone surrogate with 400, and the remote keeps its bytes", async () => {
    const api = setup();
    const { token } = await credentials(api);
    const text = textOf([lineOf(account)]);
    api.s3.seed(LEDGER, text);
    const answer = await api.call("POST", "/api/ledger/lines", {
      headers: {
        ...token.headers,
        "content-type": "application/json",
        "if-match": `"${sha(text)}"`,
      },
      body: loneBody(named, "lines"),
      jar: false,
    });
    expect(answer.statusCode).toBe(400);
    expect(errorOf(answer)).toEqual({
      code: "body_invalid",
      details: { reason: "lone_surrogate" },
    });
    expect(api.s3.text(LEDGER)).toBe(text);
    // And the remote is still readable and writable by everyone.
    const again = await write(
      api,
      token,
      "POST",
      "/api/ledger/lines",
      { lines: [{ line: lineOf(deposit) }] },
      { "if-match": `"${sha(text)}"` },
    );
    expect(again.statusCode).toBe(200);
  });

  it("refuses an initialisation with one with 422, and writes nothing", async () => {
    const api = setup();
    const { token } = await credentials(api);
    const answer = await api.call("PUT", "/api/ledger", {
      headers: {
        ...token.headers,
        "content-type": "application/json",
        "if-match": `"${EMPTY_ETAG}"`,
      },
      body: loneBody(named, "content"),
      jar: false,
    });
    expect(answer.statusCode).toBe(422);
    expect(errorOf(answer)).toEqual({
      code: "init_rejected",
      details: { code: "lone_surrogate", line: 1 },
    });
    expect(api.s3.text(LEDGER)).toBeUndefined();
  });

  it("refuses a key twice in a line with 400, and the remote keeps its bytes", async () => {
    const api = setup();
    const { token } = await credentials(api);
    const text = textOf([lineOf(account)]);
    api.s3.seed(LEDGER, text);
    const twice = lineOf(deposit).replace('"amount":', '"amount":"1000.00","amount":');
    const answer = await write(
      api,
      token,
      "POST",
      "/api/ledger/lines",
      { lines: [{ line: twice }] },
      { "if-match": `"${sha(text)}"` },
    );
    expect(errorOf(answer)).toEqual({ code: "body_invalid", details: { reason: "duplicate_key" } });
    expect(api.s3.text(LEDGER)).toBe(text);
  });

  it("never hands S3 bytes that are not UTF-8, whatever the lines", () => {
    expect(utf8Of(["ok", "ñ😀"])).toEqual(new TextEncoder().encode("ok\nñ😀\n"));
    expect(utf8Of(["a\ud800"])).toBeUndefined();
    expect(utf8Of(["\udc00"])).toBeUndefined();
  });
});

describe("PUT /api/ledger (§5.5)", () => {
  it("initialises an empty remote with the whole bytes, with If-None-Match", async () => {
    const api = setup();
    const { token } = await credentials(api);
    const content = textOf([lineOf(account), lineOf(deposit)]);
    const answer = await write(
      api,
      token,
      "PUT",
      "/api/ledger",
      { content, confirm_duplicate_ids: [] },
      { "if-match": `"${EMPTY_ETAG}"` },
    );
    expect(answer.statusCode).toBe(200);
    expect(JSON.parse(answer.body)).toEqual({ etag: sha(content), lines: 2 });
    expect(api.s3.text(LEDGER)).toBe(content);
    expect(api.s3.conditions.at(-1)).toEqual({ key: LEDGER, ifNoneMatch: "*" });
  });

  it("asks for If-Match, and refuses any other etag or a remote that is not empty", async () => {
    const api = setup();
    const { session } = await credentials(api);
    const body = { content: textOf([lineOf(account)]), confirm_duplicate_ids: [] };
    expect((await write(api, session, "PUT", "/api/ledger", body)).statusCode).toBe(428);
    expect(
      (await write(api, session, "PUT", "/api/ledger", body, { "if-match": `"${"b".repeat(64)}"` }))
        .statusCode,
    ).toBe(412);
    api.s3.seed(LEDGER, textOf([lineOf(account)]));
    const taken = await write(api, session, "PUT", "/api/ledger", body, {
      "if-match": `"${EMPTY_ETAG}"`,
    });
    expect(taken.statusCode).toBe(412);
    expect(api.s3.text(LEDGER)).toBe(textOf([lineOf(account)]));
  });

  it("refuses content that does not load or project valid with init_rejected, writing nothing", async () => {
    const api = setup();
    const { token } = await credentials(api);
    const answer = await write(
      api,
      token,
      "PUT",
      "/api/ledger",
      { content: `${lineOf(account)}\r\n`, confirm_duplicate_ids: [] },
      { "if-match": `"${EMPTY_ETAG}"` },
    );
    expect(answer.statusCode).toBe(422);
    expect(errorOf(answer)).toEqual({
      code: "init_rejected",
      details: { code: "raw_line_break", line: 1 },
    });
    expect(api.s3.text(LEDGER)).toBeUndefined();
  });

  it("loses the race to create the remote with 412", async () => {
    const api = setup();
    const { token } = await credentials(api);
    api.s3.beforePut = (key) => {
      if (key === LEDGER) {
        api.s3.beforePut = undefined;
        api.s3.seed(LEDGER, textOf([lineOf(deposit)]));
      }
    };
    const answer = await write(
      api,
      token,
      "PUT",
      "/api/ledger",
      { content: textOf([lineOf(account)]), confirm_duplicate_ids: [] },
      { "if-match": `"${EMPTY_ETAG}"` },
    );
    expect(answer.statusCode).toBe(412);
    expect(api.s3.text(LEDGER)).toBe(textOf([lineOf(deposit)]));
  });
});

describe("PUT /api/sync/devices/self (§5.3)", () => {
  const state = { pending: 2, held: 1, last_sync_at: "2026-10-01T09:00:00Z" };

  it("writes the queue on the credential's own object, keeping what it is", async () => {
    const api = setup();
    const both = await credentials(api);
    for (const [as, type] of [
      [both.token, "console"],
      [both.session, "web"],
    ] as const) {
      const before = JSON.parse(api.s3.text(`sync/devices/${as.deviceId}.json`) as string);
      const answer = await write(api, as, "PUT", "/api/sync/devices/self", state);
      expect(answer.statusCode).toBe(200);
      const published = JSON.parse(answer.body);
      expect(published.device_id).toBe(as.deviceId);
      const after = JSON.parse(api.s3.text(`sync/devices/${as.deviceId}.json`) as string);
      expect(after).toEqual({ ...before, ...state, published_at: published.published_at });
      expect(after.type).toBe(type);
    }
  });

  it("refuses a device_id in the body and a last_sync_at that is not an instant", async () => {
    const api = setup();
    const { token } = await credentials(api);
    for (const body of [
      { ...state, device_id: token.deviceId },
      { ...state, last_sync_at: "ayer" },
    ]) {
      const answer = await write(api, token, "PUT", "/api/sync/devices/self", body);
      expect(answer.statusCode).toBe(400);
      expect(errorOf(answer).code).toBe("body_invalid");
    }
  });

  it("never creates the object: a deleted one is device_forgotten, and stays deleted", async () => {
    const api = setup();
    const { token } = await credentials(api);
    api.s3.deleteOutOfBand(`sync/devices/${token.deviceId}.json`);
    const answer = await write(api, token, "PUT", "/api/sync/devices/self", state);
    expect(errorOf(answer)).toEqual({ code: "device_forgotten", details: { reason: "missing" } });
    expect(api.s3.text(`sync/devices/${token.deviceId}.json`)).toBeUndefined();
  });

  it("answers device_forgotten when a forgetting crosses the write, and 412 when anything else does", async () => {
    for (const crossing of ["forgotten", "other"] as const) {
      const api = setup();
      const { token } = await credentials(api);
      const key = `sync/devices/${token.deviceId}.json`;
      api.s3.beforePut = (put) => {
        if (put === key) {
          api.s3.beforePut = undefined;
          const current = JSON.parse(api.s3.text(key) as string);
          api.s3.seed(
            key,
            JSON.stringify(
              crossing === "forgotten"
                ? { ...current, state: "forgotten", forgotten_at: "2026-10-01T10:00:00Z" }
                : { ...current, pending: 7 },
            ),
          );
        }
      };
      const answer = await write(api, token, "PUT", "/api/sync/devices/self", state);
      const written = JSON.parse(api.s3.text(key) as string);
      if (crossing === "forgotten") {
        expect(errorOf(answer)).toEqual({
          code: "device_forgotten",
          details: { reason: "forgotten" },
        });
        expect(written.state).toBe("forgotten");
      } else {
        expect(errorOf(answer).code).toBe("precondition_failed");
        expect(written.pending).toBe(7);
      }
    }
  });
});

describe("GET /api/sync/devices (§5.3, session only)", () => {
  it("lists every device with its type and state, to the session and never to a token", async () => {
    const api = setup();
    const both = await credentials(api);
    api.s3.seed("sync/devices/unreadable-not-an-id.json", "{");
    // A device whose object cannot be read is listed as such, never left out
    // (review of PR #96, N2): compact and the restore must see it.
    const broken = "BROKENBROKENBROKENBROK";
    api.s3.seed(`sync/devices/${broken}.json`, "{");
    const answer = await read(api, both.session, "/api/sync/devices");
    expect(answer.statusCode).toBe(200);
    const rows = JSON.parse(answer.body).devices as Record<string, unknown>[];
    expect(rows.map((row) => [row.device_id, row.type, row.state]).sort()).toEqual(
      [
        [both.token.deviceId, "console", "active"],
        [both.session.deviceId, "web", "active"],
        [broken, undefined, "unreadable"],
      ].sort(),
    );
    expect(rows.find((row) => row.device_id === broken)).toEqual({
      device_id: broken,
      state: "unreadable",
    });
    expect(errorOf(await read(api, both.token, "/api/sync/devices")).code).toBe(
      "forbidden_for_credential",
    );
  });
});

describe("the reference data (§6)", () => {
  it("indexes the first level of each prefix, with an opaque version, to either credential", async () => {
    const api = setup();
    const both = await credentials(api);
    api.s3.seed("reference/ecb/eurofxref-hist.csv", "Date,USD\n");
    api.s3.seed("reference/ecb/previous/eurofxref-hist.csv", "old");
    api.s3.seed("prices/IE00B4L5Y983.jsonl", "{}\n");
    api.s3.seed("documents/secret.pdf", "no");
    for (const as of [both.token, both.session]) {
      const answer = await read(api, as, "/api/reference/index");
      expect(answer.statusCode).toBe(200);
      const index = JSON.parse(answer.body);
      expect(index.ecb.map((entry: { name: string }) => entry.name)).toEqual([
        "eurofxref-hist.csv",
      ]);
      expect(index.prices).toEqual([
        {
          name: "IE00B4L5Y983.jsonl",
          version: (api.s3.etagOf("prices/IE00B4L5Y983.jsonl") as string).replaceAll('"', ""),
          size: 3,
        },
      ]);
      expect(answer.body).not.toContain("secret");
    }
  });

  it("serves a file with its type and version, and 304 to the version held, strong or weak", async () => {
    const api = setup();
    const { token } = await credentials(api);
    api.s3.seed("reference/ecb/eurofxref-hist.csv", "Date,USD\n2026-09-25,1.1\n");
    const answer = await read(api, token, "/api/reference/ecb/eurofxref-hist.csv");
    expect(answer.statusCode).toBe(200);
    expect(answer.body).toBe("Date,USD\n2026-09-25,1.1\n");
    expect(answer.headers["content-type"]).toBe("text/csv; charset=utf-8");
    const etag = answer.headers.etag as string;
    expect(etag).toBe(api.s3.etagOf("reference/ecb/eurofxref-hist.csv"));
    for (const held of [etag, `W/${etag}`]) {
      const again = await read(api, token, "/api/reference/ecb/eurofxref-hist.csv", {
        "if-none-match": held,
      });
      expect(again.statusCode).toBe(304);
      expect(again.body).toBe("");
    }
  });

  it("refuses a name outside its prefix before touching S3, and nothing else is reachable", async () => {
    const api = setup();
    const { session } = await credentials(api);
    api.s3.seed("documents/secret.pdf", "no");
    const calls = api.s3.calls.length;
    for (const name of ["..", "..%2Fdocuments%2Fsecret.pdf", ".env", "a..b.csv"]) {
      const answer = await read(api, session, `/api/reference/prices/${name}`);
      expect(answer.statusCode, name).toBe(400);
      expect(errorOf(answer).code).toBe("reference_name_invalid");
    }
    const touched = api.s3.calls
      .slice(calls)
      .filter((call) => !call.startsWith("get sync/devices/"));
    expect(touched).toEqual([]);
    for (const path of [
      "/api/reference/ecb/../../documents/secret.pdf",
      "/api/reference/documents/secret.pdf",
      "/api/reference/prices/a/b.jsonl",
    ]) {
      expect((await read(api, session, path)).statusCode, path).toBe(404);
    }
  });

  it("answers 404 to a type it does not serve and to a file that is not there", async () => {
    const api = setup();
    const { token } = await credentials(api);
    api.s3.seed("prices/notes.txt", "x");
    expect(errorOf(await read(api, token, "/api/reference/prices/notes.txt"))).toEqual({
      code: "not_found",
      details: { reason: "type" },
    });
    expect(errorOf(await read(api, token, "/api/reference/prices/none.jsonl"))).toEqual({
      code: "not_found",
      details: { reason: "missing" },
    });
  });
});
