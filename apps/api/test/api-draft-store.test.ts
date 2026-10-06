// Feature 027 (ADR-0035, E6): `ApiDraftStore` against the real handler with
// the doubles of S3, SSM and Google. `fetch` is a bridge to `api.call`.

import { ApiDraftStore } from "@atlas/adapters/drafts-http";
import { DraftChangedError, type PendingDraft } from "@atlas/domain/ecb";
import { RemoteError } from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import { consoleLogin, SELF, setup } from "./harness.js";

const A = "01J0000000000000000000000A";
const E1 = "01J000000000000000000000E1";
const E2 = "01J000000000000000000000E2";
const draft = (id = A): PendingDraft => ({
  draft_format: 1,
  id,
  saved_at: "2026-10-06T10:00:00.000Z",
  event: { type: "buy", currency: "USD" },
});

const rig = async () => {
  const api = setup();
  const { token } = await consoleLogin(api);
  const sent: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    const result = await api.call(init.method ?? "GET", url.replace(SELF, ""), {
      headers: init.headers as Record<string, string>,
      ...(init.body === undefined
        ? {}
        : { body: new TextDecoder().decode(init.body as Uint8Array) }),
      jar: false,
    });
    return new Response(result.body, { status: result.statusCode, headers: result.headers });
  }) as unknown as typeof globalThis.fetch;
  return { api, sent, store: new ApiDraftStore({ origin: SELF, fetch, token }) };
};

const failure = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error("expected a failure");
    },
    (error: unknown) => error,
  );

describe("ApiDraftStore", () => {
  it("saves, lists with the stamp, and closes without ever deleting", async () => {
    const { store, api, sent } = await rig();
    await store.save(draft());
    expect(await store.list()).toEqual({ drafts: [draft()], unreadable: [] });
    await store.update({ ...draft(), pending_event_id: E1 }, undefined);
    await store.update({ ...draft(), pending_event_id: E1 }, E1);
    expect((await store.list()).drafts[0]).toMatchObject({ pending_event_id: E1 });
    await store.remove(A, { outcome: "confirmed", eventId: E1 });
    expect((await store.list()).drafts).toEqual([]);
    expect(api.s3.keys().filter((key) => key.startsWith("drafts/"))).toHaveLength(3);
    // The token travels, nothing redirects, nothing is cached, every POST says its hash.
    const post = sent.find((entry) => entry.init.method === "POST") as (typeof sent)[number];
    expect(post.init).toMatchObject({ redirect: "error", cache: "no-store", credentials: "omit" });
    expect((post.init.headers as Record<string, string>)["x-amz-content-sha256"]).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("refuses a second save and a stamp over another as the draft being changed", async () => {
    const { store } = await rig();
    await store.save(draft());
    expect(await failure(store.save(draft()))).toMatchObject({ code: "draft_exists" });
    await store.update({ ...draft(), pending_event_id: E1 }, undefined);
    const other = await failure(store.update({ ...draft(), pending_event_id: E2 }, undefined));
    expect(other).toBeInstanceOf(DraftChangedError);
    expect(other).toMatchObject({ details: { id: A, now: "stamped" } });
    // A draft with no stamp has nothing to stamp.
    await store.update(draft(), undefined);
    // Stamping one that is not there is `gone`.
    expect(
      await failure(
        store.update({ ...draft("01J0000000000000000000000B"), pending_event_id: E1 }, undefined),
      ),
    ).toMatchObject({ details: { now: "gone" } });
  });

  it("takes removing a draft that is gone as done, and needs its end said", async () => {
    const { store } = await rig();
    const discarded = { outcome: "discarded" } as const;
    await store.remove(A, discarded);
    await store.save(draft());
    await store.remove(A, discarded);
    await store.remove(A, discarded);
    await store.remove(A, { outcome: "confirmed", eventId: E1 });
    expect((await store.list()).drafts).toEqual([]);
  });

  it("takes only the draft_missing 404 as gone: any other 404 is an error", async () => {
    const other = new ApiDraftStore({
      origin: SELF,
      fetch: (async () =>
        new Response(
          JSON.stringify({ error: { code: "not_found", details: { reason: "route" } } }),
          {
            status: 404,
          },
        )) as unknown as typeof fetch,
    });
    expect(await failure(other.remove(A, { outcome: "discarded" }))).toMatchObject({
      code: "not_found",
    });
    expect(
      await failure(other.update({ ...draft(), pending_event_id: E1 }, undefined)),
    ).toMatchObject({ code: "not_found" });
  });

  it("refuses to confirm a draft stamped with another id", async () => {
    const { store } = await rig();
    await store.save(draft());
    await store.update({ ...draft(), pending_event_id: E1 }, undefined);
    expect(await failure(store.remove(A, { outcome: "confirmed", eventId: E2 }))).toBeInstanceOf(
      DraftChangedError,
    );
  });

  it("says a failure of the network or an answer with no shape as such", async () => {
    const down = new ApiDraftStore({
      origin: SELF,
      fetch: (async () => {
        throw new TypeError("down");
      }) as unknown as typeof fetch,
    });
    expect(await failure(down.list())).toMatchObject({ code: "network_failed" });
    const html = new ApiDraftStore({
      origin: SELF,
      fetch: (async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch,
    });
    const error = await failure(html.list());
    expect(error).toBeInstanceOf(RemoteError);
    expect(error).toMatchObject({ code: "transport_rejected" });
    const odd = new ApiDraftStore({
      origin: SELF,
      fetch: (async () => new Response("[]", { status: 200 })) as unknown as typeof fetch,
    });
    expect(await failure(odd.list())).toMatchObject({ code: "transport_rejected" });
  });

  it("names a draft of the answer it cannot read, and uses the cookie with no token", async () => {
    let init: RequestInit | undefined;
    const store = new ApiDraftStore({
      origin: SELF,
      fetch: (async (_url: string, request: RequestInit) => {
        init = request;
        return new Response(JSON.stringify({ drafts: [{ id: A }, { id: 5 }], unreadable: ["x"] }), {
          status: 200,
        });
      }) as unknown as typeof fetch,
    });
    expect(await store.list()).toEqual({ drafts: [], unreadable: ["x", A, "5"] });
    expect(init).toMatchObject({ credentials: "same-origin" });
  });
});
