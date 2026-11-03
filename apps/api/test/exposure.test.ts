// The routes of the exposure (`docs/api.md` §6.2) over the double of S3, with the session of the web.

import { sha256Hex } from "@atlas/domain";
import { MAX_EXPOSURE_BYTES } from "@atlas/domain/portfolio";
import { describe, expect, it } from "vitest";
import { errorOf, SELF, setup } from "./harness.js";

type Api = ReturnType<typeof setup>;
const KEY = "settings/exposure.json";
const doc = { exposure_format: 1, assets: { ast_world: { currency: { USD: "60", EUR: "40" } } } };
const changed = {
  exposure_format: 1,
  assets: { ast_world: { currency: { USD: "50", EUR: "50" } } },
};
const etagOf = (text: string) => `"${sha256Hex(new TextEncoder().encode(text))}"`;

const signedIn = async (api: Api) => {
  await api.signIn();
};
const get = (api: Api) => api.call("GET", "/api/exposure", { headers: { origin: SELF } });
const put = (api: Api, body: string, headers: Record<string, string> = {}) =>
  api.call("PUT", "/api/exposure", {
    headers: { origin: SELF, "content-type": "application/json", ...headers },
    body,
  });

describe("the exposure (§6.2)", () => {
  it("is 404 while nothing was written, then served as stored with its ETag", async () => {
    const api = setup();
    await signedIn(api);
    const absent = await get(api);
    expect(absent.statusCode).toBe(404);
    expect(errorOf(absent).code).toBe("not_found");

    const created = await put(api, JSON.stringify(doc), { "if-none-match": "*" });
    expect(created.statusCode).toBe(200);
    const text = api.s3.text(KEY) as string;
    expect(JSON.parse(text)).toEqual(doc);
    expect(created.headers.etag).toBe(etagOf(text));
    expect(JSON.parse(created.body)).toEqual({ etag: sha256Hex(new TextEncoder().encode(text)) });

    const read = await get(api);
    expect(read.statusCode).toBe(200);
    expect(read.body).toBe(text);
    expect(read.headers.etag).toBe(etagOf(text));
    expect(read.headers["cache-control"]).toBe("no-store");
  });

  it("serves an object it would not accept as it is, without judging it", async () => {
    const api = setup();
    await signedIn(api);
    api.s3.seed(KEY, '{"exposure_format":1,"assets":{"a":{"currency":{"USD":"1"}}}}');
    const read = await get(api);
    expect(read.statusCode).toBe(200);
    expect(read.body).toBe('{"exposure_format":1,"assets":{"a":{"currency":{"USD":"1"}}}}');
  });

  it("replaces on the ETag that was read, and says 412 for any other", async () => {
    const api = setup();
    await signedIn(api);
    await put(api, JSON.stringify(doc), { "if-none-match": "*" });
    const before = api.s3.text(KEY) as string;

    const stale = await put(api, JSON.stringify(changed), { "if-match": `"${"0".repeat(64)}"` });
    expect(stale.statusCode).toBe(412);
    expect(errorOf(stale).code).toBe("precondition_failed");
    const weak = await put(api, JSON.stringify(changed), { "if-match": `W/${etagOf(before)}` });
    expect(weak.statusCode).toBe(412);
    expect(api.s3.text(KEY)).toBe(before);

    const ok = await put(api, JSON.stringify(changed), { "if-match": etagOf(before) });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(api.s3.text(KEY) as string)).toEqual(changed);
    // The ETag just used is no longer the current one.
    expect((await put(api, JSON.stringify(doc), { "if-match": etagOf(before) })).statusCode).toBe(
      412,
    );
  });

  it("is 412 to create over an existing object and to replace one that does not exist", async () => {
    const api = setup();
    await signedIn(api);
    expect((await put(api, JSON.stringify(doc), { "if-match": etagOf("x") })).statusCode).toBe(412);
    await put(api, JSON.stringify(doc), { "if-none-match": "*" });
    const again = await put(api, JSON.stringify(changed), { "if-none-match": "*" });
    expect(again.statusCode).toBe(412);
    expect(JSON.parse(api.s3.text(KEY) as string)).toEqual(doc);
  });

  it("is 412 when the object moves between the read and the write", async () => {
    const api = setup();
    await signedIn(api);
    await put(api, JSON.stringify(doc), { "if-none-match": "*" });
    const current = api.s3.text(KEY) as string;
    const real = api.s3.putIfMatch.bind(api.s3);
    api.s3.putIfMatch = async (key, body, etag) => {
      api.s3.seed(KEY, "moved");
      return real(key, body, etag);
    };
    const raced = await put(api, JSON.stringify(changed), { "if-match": etagOf(current) });
    expect(raced.statusCode).toBe(412);
    expect(api.s3.text(KEY)).toBe("moved");
  });

  it("asks for a precondition, and refuses two", async () => {
    const api = setup();
    await signedIn(api);
    const none = await put(api, JSON.stringify(doc));
    expect(none.statusCode).toBe(428);
    expect(errorOf(none).code).toBe("precondition_required");
    expect((await put(api, JSON.stringify(doc), { "if-none-match": "x" })).statusCode).toBe(428);
    const both = await put(api, JSON.stringify(doc), {
      "if-none-match": "*",
      "if-match": etagOf("x"),
    });
    expect(errorOf(both)).toEqual({ code: "body_invalid", details: { reason: "preconditions" } });
    expect(api.s3.text(KEY)).toBeUndefined();
  });

  it("refuses with the reason, and the total of a split that does not add up", async () => {
    const api = setup();
    await signedIn(api);
    const bad = await put(
      api,
      JSON.stringify({ exposure_format: 1, assets: { ast_world: { region: { europe: "99.5" } } } }),
      { "if-none-match": "*" },
    );
    expect(bad.statusCode).toBe(400);
    expect(errorOf(bad)).toEqual({
      code: "body_invalid",
      details: { reason: "total", asset_id: "ast_world", dimension: "region", total: "99.5" },
    });
    const twice = await put(
      api,
      '{"exposure_format":1,"assets":{"a":{"currency":{"USD":"100","USD":"100"}}}}',
      { "if-none-match": "*" },
    );
    expect(errorOf(twice).details).toEqual({ reason: "repeated_key" });
    expect(api.s3.text(KEY)).toBeUndefined();
  });

  it("is 413 above 64 KiB, before reading anything", async () => {
    const api = setup();
    await signedIn(api);
    const big = await put(api, `${JSON.stringify(doc)}${" ".repeat(MAX_EXPOSURE_BYTES)}`, {
      "if-none-match": "*",
    });
    expect(big.statusCode).toBe(413);
    expect(errorOf(big)).toEqual({
      code: "body_too_large",
      details: { limit: MAX_EXPOSURE_BYTES },
    });
  });

  it("needs the session, and an own origin to write", async () => {
    const api = setup();
    expect((await get(api)).statusCode).toBe(401);
    expect((await put(api, JSON.stringify(doc), { "if-none-match": "*" })).statusCode).toBe(401);
    await signedIn(api);
    const foreign = await put(api, JSON.stringify(doc), {
      "if-none-match": "*",
      origin: "https://evil.example",
    });
    expect(foreign.statusCode).toBe(403);
    expect(errorOf(foreign).code).toBe("origin_rejected");
    expect(api.s3.text(KEY)).toBeUndefined();
  });
});
