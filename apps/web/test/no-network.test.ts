// T1 of the review of PR #90, round 2: **no test of the web goes out to the
// network.** The page of Ajustes carries the card of the session, and its
// `GET /api/session` left the process for `http://localhost:3000` under
// happy-dom — a refused connection on one machine, a 404 of whatever listened
// there on another, and a suite that failed or passed with the load. The
// environment of the web installs a `fetch` that fails at once on any call a
// test did not simulate (`test/setup/no-network.ts`); this file holds it, in
// the plain Node environment, and `no-network.dom.test.ts` under happy-dom.

import { describe, expect, it } from "vitest";

describe("the environment of the tests of the web (node)", () => {
  it("fails at once, naming the call, on a fetch nobody simulated", async () => {
    await expect(fetch("/api/session")).rejects.toThrow(
      "fetch sin simular en un test: GET /api/session",
    );
    await expect(globalThis.fetch("https://example.invalid/x", { method: "POST" })).rejects.toThrow(
      "fetch sin simular en un test: POST https://example.invalid/x",
    );
  });
});
