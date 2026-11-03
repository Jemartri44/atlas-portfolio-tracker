// The routes of the ledger (`docs/api.md` §5) over the double of S3, with the session of the web.
// The API only appends: the valid stretch up to the first rejected line, in one conditional write,
// decided by the domain's `acceptAppend`; a stale `If-Match` writes nothing.

import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { EMPTY_ETAG } from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import { account, deposit, lineOf } from "../../../packages/adapters/test/fixtures.js";
import { utf8Of } from "../src/sync.js";
import { errorOf, SELF, setup } from "./harness.js";

type Api = ReturnType<typeof setup>;
const LEDGER = "ledger/ledger.jsonl";
const sha = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");
const textOf = (lines: readonly string[]): string => lines.map((line) => `${line}\n`).join("");

interface Credential {
  readonly headers: Readonly<Record<string, string>>;
  readonly jar: boolean;
}

/** The session of the web, with the Origin a write of its own carries. */
const signedIn = async (api: Api): Promise<Credential> => {
  await api.signIn();
  return { headers: { origin: SELF }, jar: true };
};

const write = (
  api: Api,
  as: Credential,
  method: "POST",
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
  it("gives the exact bytes and their SHA-256", async () => {
    const api = setup();
    const session = await signedIn(api);
    const empty = await read(api, session, "/api/ledger");
    expect(empty.statusCode).toBe(200);
    expect(empty.body).toBe("");
    expect(empty.headers.etag).toBe(`"${EMPTY_ETAG}"`);
    expect(empty.headers["content-type"]).toBe("application/x-ndjson; charset=utf-8");
    const text = textOf([lineOf(account), lineOf(deposit)]);
    api.s3.seed(LEDGER, text);
    const full = await read(api, session, "/api/ledger");
    expect(full.body).toBe(text);
    expect(full.isBase64Encoded).toBe(false);
    expect(full.headers.etag).toBe(`"${sha(text)}"`);
  });

  it("compresses a large ledger when the client accepts gzip, with the etag of the plain bytes", async () => {
    const api = setup();
    const session = await signedIn(api);
    const text = textOf(Array.from({ length: 4000 }, () => lineOf(deposit)));
    expect(text.length).toBeGreaterThan(256 * 1024);
    api.s3.seed(LEDGER, text);
    const packed = await read(api, session, "/api/ledger", { "accept-encoding": "gzip" });
    expect(packed.headers["content-encoding"]).toBe("gzip");
    expect(packed.isBase64Encoded).toBe(true);
    expect(gunzipSync(Buffer.from(packed.body, "base64")).toString()).toBe(text);
    expect(packed.headers.etag).toBe(`"${sha(text)}"`);
    const plain = await read(api, session, "/api/ledger", { "accept-encoding": "identity" });
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(plain.body).toBe(text);
  });

  it("sends bytes that are not UTF-8 in base64, so not one changes", async () => {
    const api = setup();
    const session = await signedIn(api);
    const bytes = new Uint8Array([0x7b, 0xff, 0xfe, 0x0a]);
    api.s3.seedBytes(LEDGER, bytes);
    const answer = await read(api, session, "/api/ledger");
    expect(answer.isBase64Encoded).toBe(true);
    expect([...Buffer.from(answer.body, "base64")]).toEqual([...bytes]);
    expect(answer.headers.etag).toBe(`"${sha(bytes)}"`);
  });

  it("keeps a leading byte-order mark, so the ETag still matches the body", async () => {
    const api = setup();
    const session = await signedIn(api);
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from(textOf([lineOf(account)]))]);
    api.s3.seedBytes(LEDGER, bytes);
    const answer = await read(api, session, "/api/ledger");
    const served = answer.isBase64Encoded
      ? Buffer.from(answer.body, "base64")
      : Buffer.from(answer.body);
    expect([...served]).toEqual([...bytes]);
    expect(answer.headers.etag).toBe(`"${sha(bytes)}"`);
  });

  it("asks for a credential", async () => {
    const api = setup();
    await signedIn(api);
    expect(errorOf(await api.call("GET", "/api/ledger", { jar: false })).code).toBe(
      "unauthenticated",
    );
  });
});

describe("POST /api/ledger/lines (§5.2)", () => {
  const seeded = async () => {
    const api = setup();
    const session = await signedIn(api);
    api.s3.seed(LEDGER, textOf([lineOf(account)]));
    return { api, session, etag: sha(textOf([lineOf(account)])) };
  };

  it("asks for If-Match (428) and writes nothing without it", async () => {
    const { api, session } = await seeded();
    const before = api.s3.etagOf(LEDGER);
    const answer = await write(api, session, "POST", "/api/ledger/lines", {
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
    const { api, session, etag } = await seeded();
    const answer = await write(
      api,
      session,
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
    const { api, session, etag } = await seeded();
    const again = lineOf({ ...deposit, id: "01ARYZ6S41TSV4RRFFQ69G5FB9" });
    const puts = api.s3.conditions.length;
    const answer = await write(
      api,
      session,
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
    const { api, session, etag } = await seeded();
    const before = api.s3.etagOf(LEDGER);
    const answer = await write(
      api,
      session,
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
      const { api, session, etag } = await seeded();
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
        session,
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
      { lines: [{ line: lineOf(deposit) }], device_id: "A".repeat(22) },
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
    const session = await signedIn(api);
    const text = textOf([lineOf(account)]);
    api.s3.seed(LEDGER, text);
    const answer = await api.call("POST", "/api/ledger/lines", {
      headers: {
        ...session.headers,
        "content-type": "application/json",
        "if-match": `"${sha(text)}"`,
      },
      body: loneBody(named, "lines"),
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
      session,
      "POST",
      "/api/ledger/lines",
      { lines: [{ line: lineOf(deposit) }] },
      { "if-match": `"${sha(text)}"` },
    );
    expect(again.statusCode).toBe(200);
  });

  it("refuses a key twice in a line with 400, and the remote keeps its bytes", async () => {
    const api = setup();
    const session = await signedIn(api);
    const text = textOf([lineOf(account)]);
    api.s3.seed(LEDGER, text);
    const twice = lineOf(deposit).replace('"amount":', '"amount":"1000.00","amount":');
    const answer = await write(
      api,
      session,
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

describe("the reference data (§6)", () => {
  it("indexes the first level of each prefix, with an opaque version", async () => {
    const api = setup();
    const session = await signedIn(api);
    api.s3.seed("reference/ecb/eurofxref-hist.csv", "Date,USD\n");
    api.s3.seed("reference/ecb/previous/eurofxref-hist.csv", "old");
    api.s3.seed("prices/IE00B4L5Y983.jsonl", "{}\n");
    api.s3.seed("documents/secret.pdf", "no");
    const answer = await read(api, session, "/api/reference/index");
    expect(answer.statusCode).toBe(200);
    const index = JSON.parse(answer.body);
    expect(index.ecb.map((entry: { name: string }) => entry.name)).toEqual(["eurofxref-hist.csv"]);
    expect(index.prices).toEqual([
      {
        name: "IE00B4L5Y983.jsonl",
        version: (api.s3.etagOf("prices/IE00B4L5Y983.jsonl") as string).replaceAll('"', ""),
        size: 3,
      },
    ]);
    expect(answer.body).not.toContain("secret");
  });

  it("serves a file with its type and version, and 304 to the version held, strong or weak", async () => {
    const api = setup();
    const session = await signedIn(api);
    api.s3.seed("reference/ecb/eurofxref-hist.csv", "Date,USD\n2026-09-25,1.1\n");
    const answer = await read(api, session, "/api/reference/ecb/eurofxref-hist.csv");
    expect(answer.statusCode).toBe(200);
    expect(answer.body).toBe("Date,USD\n2026-09-25,1.1\n");
    expect(answer.headers["content-type"]).toBe("text/csv; charset=utf-8");
    const etag = answer.headers.etag as string;
    expect(etag).toBe(api.s3.etagOf("reference/ecb/eurofxref-hist.csv"));
    for (const held of [etag, `W/${etag}`]) {
      const again = await read(api, session, "/api/reference/ecb/eurofxref-hist.csv", {
        "if-none-match": held,
      });
      expect(again.statusCode).toBe(304);
      expect(again.body).toBe("");
    }
  });

  it("compresses a large history for a client that accepts gzip, with the same version", async () => {
    const api = setup();
    const session = await signedIn(api);
    // Rates that do not repeat, as the real history does: a repeated line would compress to nothing.
    let seed = 12345;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    const rows = Array.from(
      { length: 400_000 },
      () => `2026-09-25,${(next() % 100000) / 10000},${(next() % 1000000) / 10000}\n`,
    );
    const csv = `Date,USD,JPY\n${rows.join("")}`;
    api.s3.seed("reference/ecb/api-exr.csv", csv);
    const plain = await read(api, session, "/api/reference/ecb/api-exr.csv");
    const packed = await read(api, session, "/api/reference/ecb/api-exr.csv", {
      "accept-encoding": "gzip, deflate, br",
    });
    expect(packed.statusCode).toBe(200);
    expect(packed.isBase64Encoded).toBe(true);
    expect(packed.headers["content-encoding"]).toBe("gzip");
    expect(packed.headers.vary).toBe("accept-encoding");
    expect(packed.headers.etag).toBe(plain.headers.etag);
    // Length and hash, not `toBe` of two strings of 10 MB: the same proof, far cheaper to compare.
    const unpacked = gunzipSync(Buffer.from(packed.body, "base64"));
    expect(unpacked.length).toBe(Buffer.byteLength(csv));
    expect(sha(unpacked)).toBe(sha(csv));
    // Under the 6 MB of the Function URL, which the plain CSV (some 10 MB here) would exceed.
    expect(csv.length).toBeGreaterThan(9 * 1024 * 1024);
    expect(packed.body.length).toBeLessThan(6 * 1024 * 1024);
    expect(plain.headers["content-encoding"]).toBeUndefined();
    expect(plain.body.length).toBe(csv.length);
    expect(sha(plain.body)).toBe(sha(csv));
    // 400,000 rows built, packed and unpacked: seconds on a loaded machine, above the default 5 s.
  }, 20_000);

  it("does not compress for a client that refuses or does not name gzip", async () => {
    const api = setup();
    const session = await signedIn(api);
    api.s3.seed("reference/ecb/api-exr.csv", "x".repeat(300_000));
    for (const header of ["gzip;q=0", "x-gzip", "br, deflate", "identity"]) {
      const answer = await read(api, session, "/api/reference/ecb/api-exr.csv", {
        "accept-encoding": header,
      });
      expect(answer.headers["content-encoding"], header).toBeUndefined();
    }
    const weighted = await read(api, session, "/api/reference/ecb/api-exr.csv", {
      "accept-encoding": "br;q=1.0, gzip;q=0.5",
    });
    expect(weighted.headers["content-encoding"]).toBe("gzip");
  });

  it("does not compress a small file even when gzip is accepted", async () => {
    const api = setup();
    const session = await signedIn(api);
    api.s3.seed("reference/ecb/eurofxref-hist.csv", "Date,USD\n");
    const answer = await read(api, session, "/api/reference/ecb/eurofxref-hist.csv", {
      "accept-encoding": "gzip",
    });
    expect(answer.headers["content-encoding"]).toBeUndefined();
    expect(answer.body).toBe("Date,USD\n");
  });

  it("refuses a name outside its prefix before touching S3, and nothing else is reachable", async () => {
    const api = setup();
    const session = await signedIn(api);
    api.s3.seed("documents/secret.pdf", "no");
    const calls = api.s3.calls.length;
    for (const name of ["..", "..%2Fdocuments%2Fsecret.pdf", ".env", "a..b.csv"]) {
      const answer = await read(api, session, `/api/reference/prices/${name}`);
      expect(answer.statusCode, name).toBe(400);
      expect(errorOf(answer).code).toBe("reference_name_invalid");
    }
    const touched = api.s3.calls.slice(calls).filter((call) => !call.startsWith("get access/"));
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
    const session = await signedIn(api);
    api.s3.seed("reference/ecb/notes.txt", "x");
    expect(errorOf(await read(api, session, "/api/reference/ecb/notes.txt"))).toEqual({
      code: "not_found",
      details: { reason: "type" },
    });
    // In prices/ only what priceFileName writes, and symbols.json.
    api.s3.seed("prices/notes.txt", "x");
    api.s3.seed("prices/_status.json", "{}");
    for (const name of ["notes.txt", "_status.json", "config.json"]) {
      expect(errorOf(await read(api, session, `/api/reference/prices/${name}`)), name).toEqual({
        code: "reference_name_invalid",
        details: {},
      });
    }
    expect(errorOf(await read(api, session, "/api/reference/prices/none.jsonl"))).toEqual({
      code: "not_found",
      details: { reason: "missing" },
    });
  });

  it("never serves a symbols.json with a top-level key it does not know (review of PR #106, B1)", async () => {
    const api = setup();
    const session = await signedIn(api);
    const good = JSON.stringify({ symbols_format: 2, assets: {} });
    api.s3.seed("prices/symbols.json", good);
    const served = await read(api, session, "/api/reference/prices/symbols.json");
    expect(served.statusCode).toBe(200);
    expect(Buffer.from(served.body, served.isBase64Encoded ? "base64" : "utf8").toString()).toBe(
      good,
    );
    api.s3.seed(
      "prices/symbols.json",
      JSON.stringify({ symbols_format: 2, assets: {}, api_key: "sentinel-secret-of-the-api" }),
    );
    const refused = await read(api, session, "/api/reference/prices/symbols.json");
    expect(errorOf(refused)).toEqual({ code: "not_found", details: { reason: "unknown_key" } });
    expect(JSON.stringify(refused)).not.toContain("sentinel-secret-of-the-api");
    expect(api.logs.join("\n")).not.toContain("sentinel-secret-of-the-api");
  });

  it("never serves a symbols.json that repeats a key (review of PR #106, R2-B1)", async () => {
    const api = setup();
    const session = await signedIn(api);
    api.s3.seed(
      "prices/symbols.json",
      '{"symbols_format":2,"assets":{"LEAK":{"note":"sentinel-secret-of-the-api"}},"assets":{}}',
    );
    const refused = await read(api, session, "/api/reference/prices/symbols.json");
    expect(errorOf(refused)).toEqual({ code: "not_found", details: { reason: "repeated_key" } });
    expect(JSON.stringify(refused)).not.toContain("sentinel-secret-of-the-api");
    expect(api.logs.join("\n")).not.toContain("sentinel-secret-of-the-api");
  });
});
