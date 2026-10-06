// Feature 021 (ADR-0035, E1): `ApiLedgerStore` against the real handler with
// the doubles of S3, SSM and Google. `fetch` is a bridge to `api.call`, so
// what is under test is the adapter, `httpRemote` and the API as they are
// composed; only the network is scripted (cuts before and after the request).

import { createHash } from "node:crypto";
import { ApiLedgerStore } from "@atlas/adapters";
import { httpRemote } from "@atlas/adapters/sync-http";
import {
  ConflictError,
  DomainError,
  encodeLine,
  type LedgerEvent,
  RemoteRejectedError,
  SchemaTooNewError,
  WriteOutcomeUnknownError,
} from "@atlas/domain";
import { RemoteError } from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import { account, deposit, futureLine, lineOf } from "../../../packages/adapters/test/fixtures.js";
import { consoleLogin, SELF, setup } from "./harness.js";

const LEDGER = "ledger/ledger.jsonl";
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const textOf = (lines: readonly string[]): string => lines.map((line) => `${line}\n`).join("");

const id = (n: number): string => `01ARYZ6S41TSV4RRFFQ69G5F${String(n).padStart(2, "0")}`;
const at = (n: number): string => `2026-09-01T18:${String(30 + n).padStart(2, "0")}:00.000Z`;

/** A deposit of its own: a new id, its own fingerprint unless one is given. */
const depositOf = (n: number, extra: Record<string, unknown> = {}): LedgerEvent =>
  ({
    ...deposit,
    id: id(10 + n),
    recorded_at: at(n),
    fingerprint: `sha256:${n}`,
    ...extra,
  }) as LedgerEvent;

const reversalOf = (n: number, reverses: string): LedgerEvent => ({
  schema_version: 1,
  id: id(30 + n),
  recorded_at: at(n),
  type: "reversal",
  reverses_id: reverses,
  reason: "wrong amount",
});

const correctionOf = (n: number, corrects: LedgerEvent, extra: Record<string, unknown> = {}) =>
  depositOf(n, { corrects_id: corrects.id, amount: "120", ...extra });

interface Net {
  /** Cut before the request leaves: nothing arrives. */
  dropBefore?: boolean;
  /** The request is served and the answer is lost. */
  dropAfter?: boolean;
  /** Answer 502 after serving the request (a gateway that lost the Lambda's answer). */
  badGatewayAfter?: boolean;
  /** Answers a POST without serving it: the API never saw it. */
  instead?: Response | undefined;
  /** Serves a POST and then hands back this answer instead of the API's. */
  after?: Response | undefined;
}

const rig = async (lines: readonly string[] = [lineOf(account)]) => {
  const api = setup();
  const console = await consoleLogin(api);
  api.s3.seed(LEDGER, textOf(lines));
  const net: Net = {};
  const sent: { method: string; url: string; init: RequestInit }[] = [];
  const answers: Response[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    sent.push({ method: init.method ?? "GET", url, init });
    if (net.dropBefore) {
      throw new TypeError("network down");
    }
    if (init.method === "POST" && net.instead !== undefined) {
      return net.instead;
    }
    const result = await api.call(init.method ?? "GET", url.replace(SELF, ""), {
      headers: init.headers as Record<string, string>,
      ...(init.body === undefined
        ? {}
        : { body: new TextDecoder().decode(init.body as Uint8Array) }),
      jar: false,
    });
    if (net.dropAfter) {
      throw new TypeError("connection reset");
    }
    if (init.method === "POST" && net.after !== undefined) {
      return net.after;
    }
    const response = new Response(
      result.isBase64Encoded ? Buffer.from(result.body, "base64") : result.body,
      net.badGatewayAfter
        ? { status: 502 }
        : { status: result.statusCode, headers: result.headers },
    );
    answers.push(response);
    return response;
  }) as unknown as typeof globalThis.fetch;
  const store = new ApiLedgerStore(httpRemote({ origin: SELF, fetch, token: console.token }));
  const stored = (): string => api.s3.text(LEDGER) ?? "";
  return { api, store, net, sent, answers, stored };
};

const failureOf = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error("expected a failure");
    },
    (error: unknown) => error,
  );

describe("ApiLedgerStore: load and a happy write", () => {
  it("downloads the whole ledger and writes with the etag of that load", async () => {
    const { store, stored, sent } = await rig();
    const first = await store.load();
    expect(first.events).toEqual([account]);
    expect(first.etag).toBe(sha(textOf([lineOf(account)])));
    const written = await store.append([deposit], first.etag);
    expect(written.etag).toBe(sha(stored()));
    expect(stored()).toBe(textOf([lineOf(account), lineOf(deposit)]));
    const post = sent.find((call) => call.method === "POST");
    const headers = (post as { init: RequestInit }).init.headers as Record<string, string>;
    expect(headers["if-match"]).toBe(`"${first.etag}"`);
    const reloaded = await store.load();
    expect(reloaded.events).toEqual([account, deposit]);
    expect(reloaded.etag).toBe(written.etag);
  });

  it("loads an empty ledger, and writes nothing for an empty batch", async () => {
    const { store, sent } = await rig([]);
    const loaded = await store.load();
    expect(loaded.events).toEqual([]);
    expect(await store.append([], loaded.etag)).toEqual({ etag: loaded.etag });
    expect(sent.map((call) => call.method)).toEqual(["GET"]);
  });

  it("refuses to load a ledger of a newer schema", async () => {
    const { store } = await rig([lineOf(account), futureLine()]);
    expect(await failureOf(store.load())).toBeInstanceOf(SchemaTooNewError);
  });

  it("reloads by itself when it is asked to write on an etag it did not load", async () => {
    const { store, stored } = await rig();
    const { etag } = await new ApiLedgerStore(
      // A second store over the same ledger: this one never loaded.
      (store as unknown as { remote: ConstructorParameters<typeof ApiLedgerStore>[0] }).remote,
    ).load();
    await store.append([deposit], etag);
    expect(stored()).toBe(textOf([lineOf(account), lineOf(deposit)]));
  });

  it("refuses the raw-line and replace operations of administration", async () => {
    const { store } = await rig();
    for (const call of [
      () => store.replace(),
      () => store.appendLines(),
      () => store.replaceLines(),
    ]) {
      const error = await failureOf(call());
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("operation_not_supported");
    }
  });
});

describe("ApiLedgerStore: 412, rejection and what is deduced", () => {
  it("a stale etag is a ConflictError, writes nothing and is never retried", async () => {
    const { store, api, stored, sent } = await rig();
    const { etag } = await store.load();
    api.s3.seed(LEDGER, textOf([lineOf(account), lineOf(depositOf(1))]));
    const before = stored();
    expect(await failureOf(store.append([depositOf(2)], etag))).toBeInstanceOf(ConflictError);
    expect(stored()).toBe(before);
    expect(sent.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("a stale etag that the store did not load is a ConflictError without a POST", async () => {
    const { store, sent } = await rig();
    expect(await failureOf(store.append([deposit], "0".repeat(64)))).toBeInstanceOf(ConflictError);
    expect(sent.map((call) => call.method)).toEqual(["GET"]);
  });

  it("a refusal of the API is remote_rejected with its code, nothing written", async () => {
    const { store, stored } = await rig();
    const { etag } = await store.load();
    const tooLate = depositOf(1, { recorded_at: "2099-01-01T00:00:00.000Z" });
    const error = (await failureOf(store.append([tooLate], etag))) as RemoteRejectedError;
    expect(error).toBeInstanceOf(RemoteRejectedError);
    expect(error.code).toBe("remote_rejected");
    expect(error.remoteCode).toBe("recorded_at_in_future");
    expect(error.accepted).toBe(0);
    expect(stored()).toBe(textOf([lineOf(account)]));
  });

  it("a repeated id is refused by the API (what makes a retry safe)", async () => {
    const { store } = await rig([lineOf(account), lineOf(deposit)]);
    const { etag } = await store.load();
    const error = (await failureOf(store.append([deposit], etag))) as RemoteRejectedError;
    expect(error.remoteCode).toBe("domain_rejected");
    expect(error.details.domain_code).toBe("duplicate_id");
  });

  it("deduces confirm_duplicate for a fingerprint that repeats a live event", async () => {
    const { store, stored, sent } = await rig([lineOf(account), lineOf(deposit)]);
    const { etag } = await store.load();
    const twin = depositOf(1, { fingerprint: deposit.fingerprint });
    await store.append([twin], etag);
    expect(stored()).toBe(textOf([lineOf(account), lineOf(deposit), lineOf(twin)]));
    const body = JSON.parse(new TextDecoder().decode(sent.at(-1)?.init.body as Uint8Array)) as {
      lines: Record<string, unknown>[];
    };
    expect(body.lines).toEqual([{ line: lineOf(twin), confirm_duplicate: true }]);
  });

  it("does not confirm a fingerprint whose twin was reversed in the same batch", async () => {
    const { store, sent } = await rig([lineOf(account), lineOf(deposit)]);
    const { etag } = await store.load();
    const fix = correctionOf(1, deposit, { fingerprint: deposit.fingerprint });
    await store.append([reversalOf(1, deposit.id), fix], etag);
    const body = JSON.parse(new TextDecoder().decode(sent.at(-1)?.init.body as Uint8Array)) as {
      lines: Record<string, unknown>[];
    };
    expect(body.lines.map((entry) => Object.keys(entry).sort())).toEqual([
      ["has_correction", "line"],
      ["line"],
    ]);
  });

  it("confirms a repeat inside the batch itself, and not a reversed one in the ledger", async () => {
    const reversed = depositOf(1);
    const base = [lineOf(account), lineOf(reversed), encodeLine(reversalOf(1, reversed.id))];
    const { store, sent } = await rig(base);
    const { etag } = await store.load();
    const first = depositOf(2, { fingerprint: "sha256:1" });
    const second = depositOf(3, { fingerprint: "sha256:1" });
    await store.append([first, second], etag);
    const body = JSON.parse(new TextDecoder().decode(sent.at(-1)?.init.body as Uint8Array)) as {
      lines: Record<string, unknown>[];
    };
    expect(body.lines[0]).toEqual({ line: lineOf(first) });
    expect(body.lines[1]).toEqual({ line: lineOf(second), confirm_duplicate: true });
  });

  it("deduces has_correction for a reversal followed by its correction, written as one unit", async () => {
    const { store, stored, sent } = await rig([lineOf(account), lineOf(deposit)]);
    const { etag } = await store.load();
    const reversal = reversalOf(1, deposit.id);
    const fix = correctionOf(1, deposit);
    await store.append([reversal, fix], etag);
    expect(stored()).toBe(
      textOf([lineOf(account), lineOf(deposit), lineOf(reversal), lineOf(fix)]),
    );
    const body = JSON.parse(new TextDecoder().decode(sent.at(-1)?.init.body as Uint8Array)) as {
      lines: Record<string, unknown>[];
    };
    expect(body.lines).toEqual([
      { line: lineOf(reversal), has_correction: true },
      { line: lineOf(fix) },
    ]);
  });

  it("deduces chain_continues for a chain of corrections and writes it whole", async () => {
    const first = depositOf(1);
    const second = depositOf(2);
    const { store, stored, sent } = await rig([lineOf(account), lineOf(first), lineOf(second)]);
    const { etag } = await store.load();
    const chain = [
      reversalOf(1, first.id),
      correctionOf(3, first),
      reversalOf(2, second.id),
      correctionOf(4, second),
    ];
    await store.append(chain, etag);
    expect(stored()).toBe(
      textOf([lineOf(account), lineOf(first), lineOf(second), ...chain.map(lineOf)]),
    );
    const body = JSON.parse(new TextDecoder().decode(sent.at(-1)?.init.body as Uint8Array)) as {
      lines: Record<string, unknown>[];
    };
    expect(body.lines.map((entry) => Object.keys(entry).sort())).toEqual([
      ["has_correction", "line"],
      ["chain_continues", "line"],
      ["has_correction", "line"],
      ["line"],
    ]);
  });

  it("confirms both members of a chain whose corrections share a fingerprint (the whole unit counts)", async () => {
    const first = depositOf(1);
    const second = depositOf(2);
    const { store, stored, sent } = await rig([lineOf(account), lineOf(first), lineOf(second)]);
    const { etag } = await store.load();
    const chain = [
      reversalOf(1, first.id),
      correctionOf(3, first, { fingerprint: "sha256:x" }),
      reversalOf(2, second.id),
      correctionOf(4, second, { fingerprint: "sha256:x" }),
    ];
    await store.append(chain, etag);
    expect(stored().split("\n").filter(Boolean)).toHaveLength(7);
    const body = JSON.parse(new TextDecoder().decode(sent.at(-1)?.init.body as Uint8Array)) as {
      lines: Record<string, unknown>[];
    };
    // The first correction repeats the fingerprint of a LATER member of its unit.
    expect(body.lines.map((entry) => entry.confirm_duplicate === true)).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  it("a pair the API refuses is remote_rejected and leaves the ledger as it was", async () => {
    const { store, stored } = await rig([lineOf(account), lineOf(deposit)]);
    const { etag } = await store.load();
    const before = stored();
    // The correction is of an account that does not exist: the unit fails as a whole.
    const error = (await failureOf(
      store.append(
        [reversalOf(1, deposit.id), correctionOf(1, deposit, { account_id: "acc_missing" })],
        etag,
      ),
    )) as RemoteRejectedError;
    expect(error).toBeInstanceOf(RemoteRejectedError);
    expect(error.remoteCode).toBe("pair_rejected");
    expect(error.accepted).toBe(0);
    expect(stored()).toBe(before);
  });

  it("a partial acceptance is remote_rejected with how many were written", async () => {
    const { store, stored } = await rig();
    const { etag } = await store.load();
    const bad = depositOf(2, { recorded_at: "2099-01-01T00:00:00.000Z" });
    const error = (await failureOf(store.append([depositOf(1), bad], etag))) as RemoteRejectedError;
    expect(error.accepted).toBe(1);
    expect(error.remoteCode).toBe("recorded_at_in_future");
    expect(stored()).toBe(textOf([lineOf(account), lineOf(depositOf(1))]));
  });

  const shaped = (status: number, code: string) =>
    new Response(JSON.stringify({ error: { code, details: {} } }), {
      status,
      headers: { "content-type": "application/json" },
    });

  it("a 401 at the POST, with the store loaded, is not an unknown outcome and writes nothing", async () => {
    const { store, net, stored } = await rig();
    const { etag } = await store.load();
    net.instead = shaped(401, "device_token_invalid");
    const error = await failureOf(store.append([deposit], etag));
    expect(error).not.toBeInstanceOf(WriteOutcomeUnknownError);
    expect(error).toBeInstanceOf(RemoteError);
    expect((error as RemoteError).code).toBe("device_token_invalid");
    expect((error as RemoteError).status).toBe(401);
    expect(stored()).toBe(textOf([lineOf(account)]));
  });

  it("a 4xx at the POST (a request the API refuses as a whole) is rethrown as it is", async () => {
    const { store, net } = await rig();
    const { etag } = await store.load();
    net.instead = shaped(400, "body_invalid");
    const error = await failureOf(store.append([deposit], etag));
    expect(error).not.toBeInstanceOf(WriteOutcomeUnknownError);
    expect((error as RemoteError).code).toBe("body_invalid");
  });
});

describe("ApiLedgerStore: unknown outcome", () => {
  it("a cut before the request leaves: unknown, and the reload says it was not written", async () => {
    const { store, net, stored } = await rig();
    const { etag } = await store.load();
    net.dropBefore = true;
    const error = (await failureOf(store.append([deposit], etag))) as WriteOutcomeUnknownError;
    expect(error).toBeInstanceOf(WriteOutcomeUnknownError);
    expect(error.ids).toEqual([deposit.id]);
    net.dropBefore = false;
    const found = await store.findOutcome(error.ids);
    expect(found.outcome).toBe("not_written");
    expect(stored()).toBe(textOf([lineOf(account)]));
    // Retrying with the same data is safe, and now it goes in.
    await store.append([deposit], found.ledger.etag);
    expect(stored()).toBe(textOf([lineOf(account), lineOf(deposit)]));
  });

  it("a cut after the API served it: unknown, and the reload says it was written", async () => {
    const { store, net, stored } = await rig();
    const { etag } = await store.load();
    net.dropAfter = true;
    const error = (await failureOf(store.append([deposit], etag))) as WriteOutcomeUnknownError;
    expect(error).toBeInstanceOf(WriteOutcomeUnknownError);
    net.dropAfter = false;
    const found = await store.findOutcome(error.ids);
    expect(found.outcome).toBe("written");
    expect(found.ledger.events).toEqual([account, deposit]);
    // A blind retry is refused by the API, so nothing is written twice.
    const retry = (await failureOf(
      store.append([deposit], found.ledger.etag),
    )) as RemoteRejectedError;
    expect(retry.details.domain_code).toBe("duplicate_id");
    expect(stored()).toBe(textOf([lineOf(account), lineOf(deposit)]));
  });

  it("a 5xx after serving is unknown too", async () => {
    const { store, net } = await rig();
    const { etag } = await store.load();
    net.badGatewayAfter = true;
    const error = await failureOf(store.append([deposit], etag));
    expect(error).toBeInstanceOf(WriteOutcomeUnknownError);
    net.badGatewayAfter = false;
    expect((await store.findOutcome([deposit.id])).outcome).toBe("written");
  });

  it("a 503 with the shape of the API, after the write, is unknown (status >= 500)", async () => {
    const { store, net } = await rig();
    const { etag } = await store.load();
    net.after = new Response(
      JSON.stringify({ error: { code: "remote_unavailable", details: {} } }),
      {
        status: 503,
        headers: { "content-type": "application/json" },
      },
    );
    const error = await failureOf(store.append([deposit], etag));
    expect(error).toBeInstanceOf(WriteOutcomeUnknownError);
    net.after = undefined;
    expect((await store.findOutcome([deposit.id])).outcome).toBe("written");
  });

  it("a 200 with a broken body is transport_rejected, hence unknown", async () => {
    const { store, net } = await rig();
    const { etag } = await store.load();
    net.after = new Response("<html>not the API</html>", { status: 200 });
    const error = await failureOf(store.append([deposit], etag));
    expect(error).toBeInstanceOf(WriteOutcomeUnknownError);
    net.after = undefined;
    expect((await store.findOutcome([deposit.id])).outcome).toBe("written");
  });

  it("reports a partial find when only some ids are in", async () => {
    const { store } = await rig([lineOf(account), lineOf(deposit)]);
    expect((await store.findOutcome([deposit.id, id(60)])).outcome).toBe("partial");
  });
});

describe("ApiLedgerStore: nothing cached, nothing logged", () => {
  it("asks the browser not to cache and every answer of /api/ledger is no-store", async () => {
    const { store, sent, answers } = await rig();
    const { etag } = await store.load();
    await store.append([deposit], etag);
    for (const call of sent) {
      expect((call.init as { cache?: string }).cache).toBe("no-store");
    }
    expect(answers).toHaveLength(2);
    for (const answer of answers) {
      expect(answer.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("keeps nothing of the ledger after a write and logs no amount, line or id", async () => {
    const secret = depositOf(1, { amount: "123456.78" });
    const { store, api } = await rig();
    const { etag } = await store.load();
    await store.append([secret], etag);
    expect((store as unknown as { loaded?: unknown }).loaded).toBeUndefined();
    await failureOf(store.append([secret], (await store.load()).etag));
    const logged = api.logs.join("\n");
    expect(logged).not.toContain("123456.78");
    expect(logged).not.toContain(secret.id);
    expect(logged).not.toContain(lineOf(secret));
    expect(logged.length).toBeGreaterThan(0);
  });
});
