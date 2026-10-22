// @vitest-environment happy-dom
//
// Under happy-dom its window brings a `fetch` of its own that resolves `/api/session` against
// `http://localhost:3000` and goes out to the network. Both the global and the window's are the
// failing one (`test/setup/no-network.ts`).

import { describe, expect, it } from "vitest";

describe("the environment of the tests of the web (happy-dom)", () => {
  it("fails at once, naming the call, on a fetch nobody simulated", async () => {
    await expect(fetch("/api/session")).rejects.toThrow(
      "fetch sin simular en un test: GET /api/session",
    );
    await expect(window.fetch("/api/auth/logout", { method: "POST" })).rejects.toThrow(
      "fetch sin simular en un test: POST /api/auth/logout",
    );
  });
});
