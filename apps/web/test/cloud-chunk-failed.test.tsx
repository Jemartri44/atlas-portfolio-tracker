// @vitest-environment happy-dom
//
// A cloud chunk that cannot be fetched (a stale index.html after a deploy) must end in the gate
// with «Reintentar», not in a skeleton for ever.

import { describe, expect, it, vi } from "vitest";
import { startCloud } from "../src/ledger/start.js";
import { store } from "../src/ledger/state.js";
import CloudGate from "../src/shell/CloudGate.jsx";
import { show, text, until } from "./helpers/render.jsx";

vi.mock("../src/ledger/cloud.js", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

describe("the start of the cloud mode when its chunk does not load", () => {
  it("shows the failure and a way to retry", async () => {
    await startCloud();
    expect(store.load().phase).toBe("cloud_failed");
    const host = await show("/", CloudGate);
    await until(() => text(host).includes("Reintentar"), "the retry button");
    expect(text(host)).toContain("No se ha podido cargar la aplicación");
  });
});
