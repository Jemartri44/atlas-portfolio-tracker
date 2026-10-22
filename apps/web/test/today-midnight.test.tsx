// @vitest-environment happy-dom
import { BlobLedgerStore } from "@atlas/adapters/blob";
import type { UseCaseDeps } from "@atlas/domain";
import { createEffect, createRoot, untrack } from "solid-js";
import { render } from "solid-js/web";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadInto } from "../src/ledger/actions.js";
import { today } from "../src/ledger/state.js";
import { RequireLedger } from "../src/routes/guard.jsx";
import { goldenText } from "./helpers/golden.js";
import { MemoryBlob } from "./helpers/memory-blob.js";

let now = new Date("2029-07-01T21:00:00.000Z");

describe("today() in an open tab", () => {
  // One fake clock for the file: the watcher of the day starts once per module, on the first read.
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("tells its readers when the day changes in Madrid, not before", async () => {
    now = new Date("2029-07-01T21:00:00.000Z"); // 23:00 in Madrid
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

  it("repaints the screens of the ledger on the new day, as the forms take today() only when built", async () => {
    now = new Date("2029-07-01T21:00:00.000Z");
    const deps: UseCaseDeps = {
      store: new BlobLedgerStore(new MemoryBlob(goldenText(), true)),
      clock: { now: () => now },
      random: (target) => target.fill(7),
    };
    await loadInto({ deps, source: { expiresAt: "2099-01-01T00:00:00.000Z" } });
    await vi.advanceTimersByTimeAsync(60_000); // the watcher sees the clock back on the 1st
    const host = document.createElement("div");
    const built: string[] = [];
    // A component body is not tracked: it takes the day once, as the forms do.
    const Screen = () => {
      built.push(untrack(today));
      return <p>screen</p>;
    };
    const dispose = render(() => <RequireLedger>{() => <Screen />}</RequireLedger>, host);
    await vi.advanceTimersByTimeAsync(0);
    expect(built).toEqual(["2029-07-01"]);
    now = new Date("2029-07-01T22:00:00.000Z");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(built).toEqual(["2029-07-01", "2029-07-02"]);
    dispose();
  });
});
