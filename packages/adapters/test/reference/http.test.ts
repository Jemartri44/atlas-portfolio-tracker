// Feature 016, E3: the client of the reference data, over a `fetch` that
// answers as the API does (`docs/api.md` §6). Never the network.

import { RemoteError } from "@atlas/domain/remote-answers";
import { describe, expect, it } from "vitest";
import { httpReference } from "../../src/reference/http.js";

interface Seen {
  url: string;
  init: RequestInit | undefined;
}

const answer = (
  status: number,
  body: string | null,
  headers: Record<string, string> = {},
): Promise<Response> => Promise.resolve(new Response(body, { status, headers }));

const client = (reply: (url: string, init?: RequestInit) => Promise<Response>, token?: string) => {
  const seen: Seen[] = [];
  const fetcher = ((url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return reply(url, init);
  }) as typeof fetch;
  return {
    seen,
    reference: httpReference({
      origin: "https://atlas.example",
      fetch: fetcher,
      ...(token === undefined ? {} : { token }),
    }),
  };
};

const INDEX = { ecb: [], prices: [{ name: "ast_a.jsonl", version: "v1", size: 3 }] };

describe("the client of the reference data (016, E3)", () => {
  it("reads the index with the token, never following a redirect", async () => {
    const { seen, reference } = client(() => answer(200, JSON.stringify(INDEX)), "tok");
    expect(await reference.index()).toEqual(INDEX);
    expect(seen[0]?.url).toBe("https://atlas.example/api/reference/index");
    expect(seen[0]?.init?.redirect).toBe("error");
    expect(seen[0]?.init?.credentials).toBe("omit");
    const headers = seen[0]?.init?.headers as Record<string, string>;
    expect(headers["x-atlas-device-token"]).toBe("tok");
  });

  it("travels with the cookie of the web when there is no token", async () => {
    const { seen, reference } = client(() => answer(200, JSON.stringify(INDEX)));
    await reference.index();
    expect(seen[0]?.init?.credentials).toBe("same-origin");
    expect(seen[0]?.init?.headers).toEqual({});
  });

  it("asks a file on the version it holds, and says not modified, missing or the bytes and their version", async () => {
    const { seen, reference } = client((url) =>
      url.endsWith("/a.jsonl")
        ? answer(304, null)
        : url.endsWith("/b.jsonl")
          ? answer(404, JSON.stringify({ error: { code: "not_found", details: {} } }))
          : answer(200, "x", { etag: 'W/"v2"' }),
    );
    expect(await reference.get("prices", "a.jsonl", "v1")).toEqual({ kind: "not_modified" });
    const asked = seen[0]?.init?.headers as Record<string, string>;
    expect(asked["if-none-match"]).toBe('"v1"');
    expect(await reference.get("prices", "b.jsonl")).toEqual({ kind: "missing" });
    expect(seen[1]?.init?.headers).toEqual({});
    const read = await reference.get("ecb", "manifest.json");
    expect(read).toMatchObject({ kind: "file", version: "v2" });
    expect(new TextDecoder().decode((read as { bytes: Uint8Array }).bytes)).toBe("x");
  });

  it("says a failure by the code of the API, or as a transport it cannot read", async () => {
    const failing = async (reply: () => Promise<Response>, run: "index" | "get") => {
      const { reference } = client(reply);
      try {
        await (run === "index" ? reference.index() : reference.get("prices", "a.jsonl"));
      } catch (error) {
        return error as RemoteError;
      }
      throw new Error("no failure");
    };
    const coded = await failing(
      () => answer(401, JSON.stringify({ error: { code: "device_token_revoked", details: {} } })),
      "index",
    );
    expect(coded).toBeInstanceOf(RemoteError);
    expect(coded.code).toBe("device_token_revoked");
    expect((await failing(() => answer(500, "<html>"), "index")).code).toBe("transport_rejected");
    expect((await failing(() => answer(200, "{"), "index")).code).toBe("transport_rejected");
    expect((await failing(() => answer(200, "{}"), "index")).code).toBe("transport_rejected");
    expect((await failing(() => answer(502, "<html>"), "get")).code).toBe("transport_rejected");
    expect((await failing(() => answer(200, "x"), "get")).code).toBe("transport_rejected");
    expect((await failing(() => Promise.reject(new TypeError("fetch failed")), "index")).code).toBe(
      "network_failed",
    );
    const broken = () =>
      Promise.resolve({
        status: 200,
        headers: new Headers({ etag: '"v"' }),
        arrayBuffer: () => Promise.reject(new Error("cut")),
      } as unknown as Response);
    expect((await failing(broken, "get")).code).toBe("network_failed");
  });
});

describe("the size of what comes down (review of PR #108, N6)", () => {
  const MB = 1024 * 1024;

  it("refuses more than 20 MB, said by its length or counted as it arrives (N6)", async () => {
    const said = client(() =>
      answer(200, "x", { etag: '"v"', "content-length": String(20 * MB + 1) }),
    );
    await expect(said.reference.get("ecb", "manifest.json")).rejects.toMatchObject({
      code: "transport_rejected",
      details: { reason: "too_large" },
    });
    const big = new Uint8Array(20 * MB + 1);
    const streamed = client(() =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(big.subarray(0, 10 * MB));
              controller.enqueue(big.subarray(10 * MB));
              controller.close();
            },
          }),
          { status: 200, headers: { etag: '"v"' } },
        ),
      ),
    );
    await expect(streamed.reference.get("prices", "a.jsonl")).rejects.toMatchObject({
      code: "transport_rejected",
      details: { reason: "too_large" },
    });
    const index = client(() =>
      answer(200, JSON.stringify(INDEX), { "content-length": String(20 * MB + 1) }),
    );
    await expect(index.reference.index()).rejects.toMatchObject({
      details: { reason: "too_large" },
    });
  });

  /** `total` bytes, streamed in chunks of 8 MB, with no length said. */
  const streaming = (total: number) =>
    client(() => {
      const chunk = new Uint8Array(8 * MB);
      let left = total;
      return Promise.resolve(
        new Response(
          new ReadableStream({
            pull(controller) {
              if (left === 0) {
                controller.close();
                return;
              }
              const size = Math.min(left, chunk.length);
              controller.enqueue(chunk.subarray(0, size));
              left -= size;
            },
          }),
          { status: 200, headers: { etag: '"v"' } },
        ),
      );
    });

  it("takes up to 64 MB of each history of the ECB, never more (review of PR #108, round 2)", async () => {
    for (const name of ["api-exr.csv", "eurofxref-hist.csv"]) {
      const read = await streaming(64 * MB).reference.get("ecb", name);
      expect((read as { bytes: Uint8Array }).bytes.length).toBe(64 * MB);
      await expect(streaming(64 * MB + 1).reference.get("ecb", name)).rejects.toMatchObject({
        details: { reason: "too_large" },
      });
      const said = client(() =>
        answer(200, "x", { etag: '"v"', "content-length": String(64 * MB + 1) }),
      );
      await expect(said.reference.get("ecb", name)).rejects.toMatchObject({
        details: { reason: "too_large" },
      });
    }
  });

  it("keeps 20 MB for the manifest of the ECB and for a file of prices", async () => {
    for (const [kind, name] of [
      ["ecb", "manifest.json"],
      ["prices", "api-exr.csv"],
      ["prices", "a.jsonl"],
    ] as const) {
      await expect(streaming(20 * MB + 1).reference.get(kind, name)).rejects.toMatchObject({
        details: { reason: "too_large" },
      });
    }
  });

  it("takes exactly 20 MB", async () => {
    const { reference } = client(() =>
      Promise.resolve(
        new Response(new Uint8Array(20 * MB), { status: 200, headers: { etag: '"v"' } }),
      ),
    );
    const read = await reference.get("prices", "a.jsonl");
    expect((read as { bytes: Uint8Array }).bytes.length).toBe(20 * MB);
  });
});
