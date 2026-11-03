// `ApiExposureStore` against the real handler with the doubles of S3, SSM and Google. `fetch` is a
// bridge to `api.call`.

import { ApiExposureStore } from "@atlas/adapters/exposure-http";
import { exposureOrNone } from "@atlas/domain/portfolio";
import { RemoteError } from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import { SELF, setup } from "./harness.js";

const first = { ast_world: { currency: { USD: "60", EUR: "40" } } };
const second = { ast_world: { index: "msci_world" } };

const rig = async () => {
  const api = setup();
  await api.signIn();
  const sent: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    const result = await api.call(init.method ?? "GET", url.replace(SELF, ""), {
      headers: { ...(init.headers as Record<string, string>), origin: SELF },
      ...(init.body === undefined
        ? {}
        : { body: new TextDecoder().decode(init.body as Uint8Array) }),
    });
    return new Response(result.body, { status: result.statusCode, headers: result.headers });
  }) as unknown as typeof globalThis.fetch;
  return { sent, store: new ApiExposureStore({ origin: SELF, fetch }) };
};

const lastHeaders = (sent: { init: RequestInit }[]): Record<string, string> =>
  (sent[sent.length - 1] as { init: RequestInit }).init.headers as Record<string, string>;

const failure = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error("expected a failure");
    },
    (error: unknown) => error,
  );

describe("ApiExposureStore", () => {
  it("reads nothing before the first write, then what was written with the etag that guards it", async () => {
    const { store, sent } = await rig();
    expect(await store.read()).toEqual({ kind: "missing" });

    const created = await store.write(first, undefined);
    expect(lastHeaders(sent)["if-none-match"]).toBe("*");
    expect(lastHeaders(sent)["x-amz-content-sha256"]).toMatch(/^[0-9a-f]{64}$/);
    const read = await store.read();
    expect(read.kind).toBe("found");
    if (read.kind === "found") {
      expect(read.etag).toBe(created.etag);
      expect(exposureOrNone(read.text)).toEqual(first);
    }

    const next = await store.write(second, created.etag);
    expect(lastHeaders(sent)["if-match"]).toBe(`"${created.etag}"`);
    expect(next.etag).not.toBe(created.etag);
  });

  it("refuses a stale etag and an existing object written as new, without changing anything", async () => {
    const { store } = await rig();
    const created = await store.write(first, undefined);
    const stale = await failure(store.write(second, "0".repeat(64)));
    expect(stale).toBeInstanceOf(RemoteError);
    expect((stale as RemoteError).code).toBe("precondition_failed");
    const exists = await failure(store.write(second, undefined));
    expect(exists).toBeInstanceOf(RemoteError);
    const read = await store.read();
    expect(read.kind === "found" && read.etag).toBe(created.etag);
  });

  it("sends nothing that does not validate", async () => {
    const { store, sent } = await rig();
    const before = sent.length;
    await expect(
      store.write({ ast_world: { currency: { USD: "60" } } }, undefined),
    ).rejects.toThrow(/not valid: total/);
    expect(sent.length).toBe(before);
  });
});
