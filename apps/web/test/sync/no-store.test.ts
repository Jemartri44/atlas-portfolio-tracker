// Feature 022 (ADR-0035, §3): every request of the web to its own API says
// `cache: "no-store"`, so the HTTP cache of the browser never writes the
// ledger, the session or the list of devices to disk. One test per caller of
// the web; the ECB reference (`/api/reference/ecb/*`) is public and keeps its
// `ETag`/`304` on purpose, and is not among them.

import { describe, expect, it } from "vitest";
import { listCalls } from "./no-store-support.js";

describe("requests of the web to the API", () => {
  it("every caller asks with no-store", async () => {
    const calls = await listCalls();
    expect(calls.map((call) => call.url).sort()).toEqual(
      [
        "/api/auth/logout",
        "/api/devices/tokens",
        "/api/devices/tokens/AAAAAAAAAAAAAAAAAAAAAA/revoke",
        "/api/session",
      ].sort(),
    );
    for (const call of calls) {
      expect(call.cache, call.url).toBe("no-store");
    }
  });
});
