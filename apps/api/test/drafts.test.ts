// Feature 027, E6: the routes of the drafts in the cloud (`docs/api.md` §6.1)
// over the double of S3, with both credentials. Every object is created once
// and nothing is overwritten or deleted.

import { describe, expect, it } from "vitest";
import { consoleLogin, errorOf, SELF, setup } from "./harness.js";

type Api = ReturnType<typeof setup>;
const A = "01J0000000000000000000000A";
const B = "01J0000000000000000000000B";
const E1 = "01J000000000000000000000E1";
const E2 = "01J000000000000000000000E2";
const draft = (id = A) => ({
  draft_format: 1,
  id,
  saved_at: "2026-10-06T10:00:00.000Z",
  event: { type: "buy", asset_id: "ast_gold", currency: "USD" },
});

interface As {
  headers: Record<string, string>;
  jar: boolean;
}
const credentials = async (api: Api): Promise<{ token: As; session: As }> => {
  const console = await consoleLogin(api);
  await api.signIn();
  return {
    token: { headers: { "x-atlas-device-token": console.token }, jar: false },
    session: { headers: { origin: SELF }, jar: true },
  };
};
const post = (api: Api, as: As, path: string, body: unknown) =>
  api.call("POST", path, {
    headers: { ...as.headers, "content-type": "application/json" },
    body: JSON.stringify(body),
    jar: as.jar,
  });
const get = (api: Api, as: As) =>
  api.call("GET", "/api/drafts", { headers: as.headers, jar: as.jar });
const listed = async (api: Api, as: As) =>
  JSON.parse((await get(api, as)).body) as { drafts: { id: string }[]; unreadable: string[] };

describe("the drafts in the cloud (§6.1)", () => {
  it("saves a draft once, lists it to both credentials and says a second save exists", async () => {
    const api = setup();
    const { token, session } = await credentials(api);
    const saved = await post(api, token, "/api/drafts", { draft: draft() });
    expect(saved.statusCode).toBe(201);
    expect(JSON.parse(saved.body)).toEqual({ id: A });
    expect(api.s3.keys()).toContain(`drafts/${A}.json`);
    const again = await post(api, session, "/api/drafts", { draft: draft() });
    expect(again.statusCode).toBe(409);
    expect(errorOf(again).code).toBe("draft_exists");
    for (const as of [token, session]) {
      expect((await listed(api, as)).drafts).toEqual([draft()]);
    }
    expect((await get(api, token)).headers["cache-control"]).toBe("no-store");
  });

  it("lists oldest first and carries the stamp as pending_event_id", async () => {
    const api = setup();
    const { token } = await credentials(api);
    await post(api, token, "/api/drafts", { draft: draft(B) });
    await post(api, token, "/api/drafts", { draft: draft(A) });
    await post(api, token, `/api/drafts/${B}/stamp`, { pending_event_id: E1 });
    const { drafts } = await listed(api, token);
    expect(drafts.map((entry) => entry.id)).toEqual([A, B]);
    expect(drafts[1]).toMatchObject({ pending_event_id: E1 });
  });

  it("refuses a malformed, oversized or stamped-at-creation draft before writing", async () => {
    const api = setup();
    const { token } = await credentials(api);
    const bad = await post(api, token, "/api/drafts", {
      draft: { ...draft(), pending_event_id: E1 },
    });
    expect(errorOf(bad)).toEqual({ code: "body_invalid", details: { reason: "unknown_field" } });
    const big = draft();
    big.event = { type: "buy", note: "x".repeat(70_000) } as never;
    const tooBig = await post(api, token, "/api/drafts", { draft: big });
    expect(tooBig.statusCode).toBe(413);
    expect(errorOf(tooBig).details).toEqual({ limit: 65_536 });
    expect(api.s3.keys().filter((key) => key.startsWith("drafts/"))).toEqual([]);
  });

  it("stamps once, repeats the same stamp and refuses another", async () => {
    const api = setup();
    const { token, session } = await credentials(api);
    await post(api, token, "/api/drafts", { draft: draft() });
    const first = await post(api, token, `/api/drafts/${A}/stamp`, { pending_event_id: E1 });
    expect(JSON.parse(first.body)).toMatchObject({ pending_event_id: E1, created: true });
    const same = await post(api, session, `/api/drafts/${A}/stamp`, { pending_event_id: E1 });
    expect(JSON.parse(same.body)).toMatchObject({ created: false });
    const other = await post(api, session, `/api/drafts/${A}/stamp`, { pending_event_id: E2 });
    expect(other.statusCode).toBe(409);
    expect(errorOf(other)).toEqual({ code: "draft_changed", details: { now: "stamped" } });
    expect(
      errorOf(await post(api, token, `/api/drafts/${B}/stamp`, { pending_event_id: E1 })),
    ).toEqual({ code: "not_found", details: { reason: "draft_missing" } });
    expect(
      errorOf(await post(api, token, "/api/drafts/nope/stamp", { pending_event_id: E1 })).details,
    ).toEqual({ reason: "draft_id" });
  });

  it("closes once: the first end wins and the same end is idempotent", async () => {
    const api = setup();
    const { token } = await credentials(api);
    await post(api, token, "/api/drafts", { draft: draft() });
    const unstamped = await post(api, token, `/api/drafts/${A}/end`, {
      outcome: "confirmed",
      event_id: E1,
    });
    expect(errorOf(unstamped).details).toEqual({ reason: "not_stamped" });
    await post(api, token, `/api/drafts/${A}/stamp`, { pending_event_id: E1 });
    const wrong = await post(api, token, `/api/drafts/${A}/end`, {
      outcome: "confirmed",
      event_id: E2,
    });
    expect(errorOf(wrong)).toEqual({ code: "draft_changed", details: { now: "stamped" } });
    const done = await post(api, token, `/api/drafts/${A}/end`, {
      outcome: "confirmed",
      event_id: E1,
    });
    expect(JSON.parse(done.body)).toMatchObject({ outcome: "confirmed", created: true });
    const repeat = await post(api, token, `/api/drafts/${A}/end`, {
      outcome: "confirmed",
      event_id: E1,
    });
    expect(JSON.parse(repeat.body)).toMatchObject({ created: false });
    const other = await post(api, token, `/api/drafts/${A}/end`, { outcome: "discarded" });
    expect(errorOf(other)).toEqual({ code: "draft_changed", details: { now: "gone" } });
    // Closed: no longer listed, never stamped again, and the objects are still there.
    expect((await listed(api, token)).drafts).toEqual([]);
    const late = await post(api, token, `/api/drafts/${A}/stamp`, { pending_event_id: E1 });
    expect(errorOf(late).details).toEqual({ now: "gone" });
    expect(api.s3.keys().filter((key) => key.startsWith("drafts/"))).toEqual([
      `drafts/${A}.end.json`,
      `drafts/${A}.json`,
      `drafts/${A}.stamp.json`,
    ]);
  });

  it("discards without a stamp, and answers a missing draft with 404", async () => {
    const api = setup();
    const { session } = await credentials(api);
    await post(api, session, "/api/drafts", { draft: draft() });
    const gone = await post(api, session, `/api/drafts/${A}/end`, { outcome: "discarded" });
    expect(JSON.parse(gone.body)).toMatchObject({ outcome: "discarded", created: true });
    expect(
      (await post(api, session, `/api/drafts/${B}/end`, { outcome: "discarded" })).statusCode,
    ).toBe(404);
    expect(errorOf(await post(api, session, `/api/drafts/${A}/end`, { outcome: "x" })).code).toBe(
      "body_invalid",
    );
  });

  it("names, and never deletes, what is not a readable draft", async () => {
    const api = setup();
    const { token } = await credentials(api);
    api.s3.seed(`drafts/${A}.json`, "{ not json");
    api.s3.seed(`drafts/${B}.stamp.json`, "{}");
    api.s3.seed("drafts/stranger.txt", "x");
    expect(await listed(api, token)).toEqual({
      drafts: [],
      unreadable: [`${A}.json`, `${B}.stamp.json`, "stranger.txt"].sort(),
    });
  });

  it("asks for a credential, checks Origin on a write with the cookie and logs only codes", async () => {
    const api = setup();
    const { session } = await credentials(api);
    expect(errorOf(await api.call("GET", "/api/drafts", { jar: false })).code).toBe(
      "unauthenticated",
    );
    const foreign = await post(
      api,
      { headers: { origin: "https://evil.example" }, jar: true },
      "/api/drafts",
      {
        draft: draft(),
      },
    );
    expect(errorOf(foreign).code).toBe("origin_rejected");
    await post(api, session, "/api/drafts", { draft: draft() });
    const line = api.logs.at(-1) as string;
    expect(JSON.parse(line)).toMatchObject({ route: "/api/drafts", code: "draft_saved" });
    expect(line).not.toContain("ast_gold");
    expect(line).not.toContain(A);
  });
});
