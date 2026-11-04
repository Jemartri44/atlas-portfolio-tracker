// The routes of the projection's assumptions (`docs/api.md` §6.2). What they share with the
// exposure is `exposure.test.ts`; here, that this route is wired to its own key, limit and validator.

import { sha256Hex } from "@atlas/domain";
import { MAX_PROJECTION_BYTES } from "@atlas/domain/portfolio";
import { describe, expect, it } from "vitest";
import { errorOf, SELF, setup } from "./harness.js";

const KEY = "settings/projection.json";
const edits = { projection_format: 1, years: 30, classes: { gold: { return_pct: "4" } } };

const signedIn = async () => {
  const api = setup();
  await api.signIn();
  return api;
};
type Api = Awaited<ReturnType<typeof signedIn>>;
const get = (api: Api) => api.call("GET", "/api/projection", { headers: { origin: SELF } });
const put = (api: Api, body: string, headers: Record<string, string>) =>
  api.call("PUT", "/api/projection", {
    headers: { origin: SELF, "content-type": "application/json", ...headers },
    body,
  });

describe("the projection's assumptions (§6.2)", () => {
  it("is 404 until written, then keeps the canonical text under its own key", async () => {
    const api = await signedIn();
    expect((await get(api)).statusCode).toBe(404);
    const created = await put(api, JSON.stringify(edits), { "if-none-match": "*" });
    expect(created.statusCode).toBe(200);
    const text = api.s3.text(KEY) as string;
    expect(text).toBe(`${JSON.stringify(edits)}\n`);
    expect(api.s3.text("settings/exposure.json")).toBeUndefined();
    const read = await get(api);
    expect(read.body).toBe(text);
    expect(read.headers.etag).toBe(`"${sha256Hex(new TextEncoder().encode(text))}"`);
  });

  it("resets by replacing on the version read, and refuses any other", async () => {
    const api = await signedIn();
    await put(api, JSON.stringify(edits), { "if-none-match": "*" });
    const reset = JSON.stringify({ projection_format: 1 });
    expect((await put(api, reset, { "if-match": `"${"0".repeat(64)}"` })).statusCode).toBe(412);
    const etag = (await get(api)).headers.etag as string;
    expect((await put(api, reset, { "if-match": etag })).statusCode).toBe(200);
    expect(api.s3.text(KEY)).toBe(`${reset}\n`);
  });

  it("refuses with the reason of its validator and with its own limit", async () => {
    const api = await signedIn();
    const invalid = await put(api, '{"projection_format":1,"years":0}', { "if-none-match": "*" });
    expect(invalid.statusCode).toBe(400);
    expect(errorOf(invalid).details).toMatchObject({ reason: "years" });
    const padding = "x".repeat(MAX_PROJECTION_BYTES);
    const large = await put(api, JSON.stringify({ projection_format: 1, padding }), {
      "if-none-match": "*",
    });
    expect(large.statusCode).toBe(413);
    expect(api.s3.text(KEY)).toBeUndefined();
  });

  it("asks for a session", async () => {
    expect((await get(setup())).statusCode).toBe(401);
  });
});
