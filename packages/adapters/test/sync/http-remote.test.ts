// Feature 015, E3: the HTTP client of the sync (`src/sync/http-remote.ts`)
// against a scripted `fetch`: what it sends (the credential, the hash of the
// exact bytes, `redirect: "error"`) and what it makes of each answer (the rule
// of §7: only a `rejected.code` holds a line; nothing else ever does).

import { createHash } from "node:crypto";
import { RemoteError } from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import { httpRemote } from "../../src/sync/http-remote.js";

const ORIGIN = "https://atlas.example";
const TOKEN = `atlasdt1.${"T".repeat(22)}.${"s".repeat(43)}`;
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

interface Sent {
  readonly url: string;
  readonly init: RequestInit;
}

const scripted = (answer: (sent: Sent) => Response | Promise<Response>) => {
  const calls: Sent[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const sent = { url, init };
    calls.push(sent);
    return answer(sent);
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
};

const jsonAnswer = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const headersOf = (sent: Sent) => sent.init.headers as Record<string, string>;

const failureOf = async (promise: Promise<unknown>): Promise<RemoteError> => {
  const error = await promise.catch((thrown: unknown) => thrown);
  expect(error).toBeInstanceOf(RemoteError);
  return error as RemoteError;
};

describe("httpRemote: what it sends", () => {
  it("sends the token of the console, never follows a redirect, and no cookie", async () => {
    const text = "a\n";
    const { fetch, calls } = scripted(
      () => new Response(text, { status: 200, headers: { etag: `"${sha(text)}"` } }),
    );
    await httpRemote({ origin: ORIGIN, fetch, token: TOKEN }).read();
    expect(calls[0]?.url).toBe(`${ORIGIN}/api/ledger`);
    expect(calls[0]?.init).toMatchObject({ method: "GET", redirect: "error", credentials: "omit" });
    expect(headersOf(calls[0] as Sent)["x-atlas-device-token"]).toBe(TOKEN);
  });

  it("sends the cookie of the web, same origin, and no token", async () => {
    const { fetch, calls } = scripted(
      () => new Response("", { status: 200, headers: { etag: `"${sha("")}"` } }),
    );
    await httpRemote({ origin: "", fetch }).read();
    expect(calls[0]?.url).toBe("/api/ledger");
    expect(calls[0]?.init).toMatchObject({ redirect: "error", credentials: "same-origin" });
    expect(headersOf(calls[0] as Sent)).not.toHaveProperty("x-atlas-device-token");
  });

  it("hashes the exact bytes of every body it sends, and quotes the etag it writes on", async () => {
    const etag = "e".repeat(64);
    const { fetch, calls } = scripted((sent) =>
      sent.url.endsWith("/lines")
        ? jsonAnswer(200, { etag, lines: 1, accepted: 1 })
        : sent.url.endsWith("/self")
          ? jsonAnswer(200, { device_id: "D".repeat(22), published_at: "2026-10-01T10:00:00Z" })
          : jsonAnswer(200, { etag, lines: 1 }),
    );
    const remote = httpRemote({ origin: ORIGIN, fetch, token: TOKEN });
    await remote.append([{ line: '{"é":1}', confirm_duplicate: true }], "f".repeat(64));
    await remote.init("x\n", ["id1"], "0".repeat(64));
    await remote.publish({ pending: 1, held: 0, last_sync_at: "2026-10-01T09:00:00Z" });
    expect(calls.map((sent) => `${sent.init.method} ${sent.url}`)).toEqual([
      `POST ${ORIGIN}/api/ledger/lines`,
      `PUT ${ORIGIN}/api/ledger`,
      `PUT ${ORIGIN}/api/sync/devices/self`,
    ]);
    for (const sent of calls) {
      const body = sent.init.body as Uint8Array;
      expect(headersOf(sent)["x-amz-content-sha256"]).toBe(sha(body));
      expect(headersOf(sent)["content-type"]).toBe("application/json");
      expect(sent.init.redirect).toBe("error");
    }
    expect(JSON.parse(new TextDecoder().decode(calls[0]?.init.body as Uint8Array))).toEqual({
      lines: [{ line: '{"é":1}', confirm_duplicate: true }],
    });
    expect(headersOf(calls[0] as Sent)["if-match"]).toBe(`"${"f".repeat(64)}"`);
    expect(headersOf(calls[1] as Sent)["if-match"]).toBe(`"${"0".repeat(64)}"`);
    expect(JSON.parse(new TextDecoder().decode(calls[1]?.init.body as Uint8Array))).toEqual({
      content: "x\n",
      confirm_duplicate_ids: ["id1"],
    });
  });
});

describe("httpRemote: reading the remote (§5.1)", () => {
  it("hands the text and the SHA-256 of the bytes as they arrived, with a strong or weak ETag", async () => {
    const text = '{"a":"ñ"}\n';
    for (const header of [`"${sha(text)}"`, `W/"${sha(text)}"`]) {
      const { fetch } = scripted(
        () => new Response(text, { status: 200, headers: { etag: header } }),
      );
      expect(await httpRemote({ origin: ORIGIN, fetch, token: TOKEN }).read()).toEqual({
        text,
        etag: sha(text),
      });
    }
  });

  it("refuses an ETag that does not say the hash, no ETag, and bytes that are not UTF-8", async () => {
    const cases: [BodyInit, Record<string, string>, string][] = [
      ["a\n", { etag: `"${sha("b\n")}"` }, "etag"],
      ["a\n", {}, "etag"],
      [
        new Uint8Array([0xff, 0x0a]),
        { etag: `"${sha(new Uint8Array([0xff, 0x0a]))}"` },
        "not_utf8",
      ],
    ];
    for (const [body, headers, reason] of cases) {
      const { fetch } = scripted(() => new Response(body, { status: 200, headers }));
      const error = await failureOf(httpRemote({ origin: ORIGIN, fetch, token: TOKEN }).read());
      expect(error.code).toBe("transport_rejected");
      expect(error.details).toEqual({ reason });
    }
  });
});

describe("httpRemote: each answer, as §7 says", () => {
  const appendWith = async (answer: () => Response | Promise<Response>) => {
    const { fetch } = scripted(answer);
    return httpRemote({ origin: ORIGIN, fetch, token: TOKEN }).append(
      [{ line: "x" }],
      "a".repeat(64),
    );
  };

  it("holds a line only for a rejected.code of the list", async () => {
    const rejected = { index: 0, code: "duplicate_unconfirmed", details: { existing: ["X"] } };
    expect(
      await appendWith(() =>
        jsonAnswer(200, { etag: "b".repeat(64), lines: 2, accepted: 0, rejected }),
      ),
    ).toEqual({ etag: "b".repeat(64), lines: 2, accepted: 0, rejected });
    const unknown = await failureOf(
      appendWith(() =>
        jsonAnswer(200, {
          etag: "b".repeat(64),
          lines: 2,
          accepted: 0,
          rejected: { index: 0, code: "hold_it", details: {} },
        }),
      ),
    );
    expect(unknown.code).toBe("transport_rejected");
  });

  it("stops with the code of the API for an error of the closed list, 412 included", async () => {
    for (const [status, code] of [
      [412, "precondition_failed"],
      [401, "device_token_expired"],
      [401, "device_token_revoked"],
      [403, "device_forgotten"],
      [503, "remote_unavailable"],
      [500, "internal"],
    ] as const) {
      const error = await failureOf(
        appendWith(() => jsonAnswer(status, { error: { code, details: { a: 1 } } })),
      );
      expect([error.code, error.status, error.details]).toEqual([code, status, { a: 1 }]);
    }
  });

  it("calls transport_rejected what has not the shape of the API", async () => {
    for (const answer of [
      () => new Response("<html>403 Forbidden</html>", { status: 403 }),
      () => jsonAnswer(403, { message: "Forbidden" }),
      () => jsonAnswer(400, { error: { code: "made_up", details: {} } }),
      () => jsonAnswer(200, { etag: "b".repeat(64) }),
      () => new Response("not json", { status: 200 }),
      () => new Response(null, { status: 204 }),
    ]) {
      const error = await failureOf(appendWith(answer));
      expect(error.code).toBe("transport_rejected");
    }
  });

  it("calls network_failed what did not arrive, a redirect included", async () => {
    for (const answer of [
      () => Promise.reject(new TypeError("fetch failed")),
      () => Promise.reject(new TypeError("unexpected redirect")),
    ]) {
      const error = await failureOf(appendWith(answer));
      expect([error.code, error.status]).toEqual(["network_failed", undefined]);
    }
    const broken = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error("cut"));
        },
      }),
      { status: 200 },
    );
    const error = await failureOf(appendWith(() => broken));
    expect(error.code).toBe("network_failed");
  });
});
