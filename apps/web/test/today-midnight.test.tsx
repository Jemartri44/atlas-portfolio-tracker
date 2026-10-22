import { BlobLedgerStore } from "@atlas/adapters/blob";
import type { UseCaseDeps } from "@atlas/domain";
import { createEffect, createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadInto } from "../src/ledger/actions.js";
import { today } from "../src/ledger/state.js";
import { goldenText } from "./helpers/golden.js";
import { MemoryBlob } from "./helpers/memory-blob.js";

describe("today() in an open tab", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tells its readers when the day changes in Madrid, not before", async () => {
    vi.useFakeTimers();
    let now = new Date("2029-07-01T21:00:00.000Z"); // 23:00 in Madrid
    const deps: UseCaseDeps = {
      store: new BlobLedgerStore(new MemoryBlob(goldenText(), true)),
      clock: { now: () => now },
      random: (target) => target.fill(7),
    };
    await loadInto({ deps, source: { expiresAt: "2099-01-01T00:00:00.000Z" } });
    const seen: string[] = [];
    const dispose = createRoot((stop) => {
      createEffect(() => seen.push(today()));
      return stop;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual(["2029-07-01"]);
    now = new Date("2029-07-01T21:30:00.000Z");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(seen).toEqual(["2029-07-01"]);
    now = new Date("2029-07-01T22:00:00.000Z"); // midnight in Madrid (CEST)
    await vi.advanceTimersByTimeAsync(60_000);
    expect(seen).toEqual(["2029-07-01", "2029-07-02"]);
    dispose();
  });
});
