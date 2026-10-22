import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { bytesCompressed } from "../src/respond.js";

const big = (letter: string) => new TextEncoder().encode(letter.repeat(300_000));
const unpacked = (body: string) => gunzipSync(Buffer.from(body, "base64")).toString("utf8")[0];

describe("bytesCompressed", () => {
  it("gzips a version once: the same etag is answered from memory (it names the content)", () => {
    const first = bytesCompressed(200, big("a"), { etag: '"v-once"' }, "gzip");
    // A different body under the same etag cannot happen for real; here it shows nothing was compressed again.
    const again = bytesCompressed(200, big("b"), { etag: '"v-once"' }, "gzip");
    expect(again.body).toBe(first.body);
    expect(unpacked(again.body)).toBe("a");
  });

  it("compresses a new etag, and forgets the oldest after four", () => {
    const etags = ["1", "2", "3", "4", "5"].map((n) => ({ etag: `"v-evict-${n}"` }));
    for (const headers of etags) {
      bytesCompressed(200, big("a"), headers, "gzip");
    }
    const fresh = bytesCompressed(200, big("b"), etags[0] ?? {}, "gzip");
    expect(unpacked(fresh.body)).toBe("b");
    const kept = bytesCompressed(200, big("b"), etags[4] ?? {}, "gzip");
    expect(unpacked(kept.body)).toBe("a");
  });

  it("compresses without remembering when there is no etag", () => {
    expect(unpacked(bytesCompressed(200, big("a"), {}, "gzip").body)).toBe("a");
    expect(unpacked(bytesCompressed(200, big("b"), {}, "gzip").body)).toBe("b");
  });
});
