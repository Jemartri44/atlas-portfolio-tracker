// @vitest-environment happy-dom
//
// What the gate does with a ledger that arrives while a write is in flight (a `412` reads it
// again) and with a new day that arrives meanwhile. The screen it holds keeps what the person
// typed, so it is **not** painted again; but it must read the ledger that is there now, and a
// later silent reload of that same ledger must not paint it either.

import { BlobLedgerStore } from "@atlas/adapters/blob";
import type { UseCaseDeps } from "@atlas/domain";
import { render } from "solid-js/web";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadInto } from "../src/ledger/actions.js";
import { type LedgerSnapshot, store } from "../src/ledger/state.js";
import { RequireLedger } from "../src/routes/guard.jsx";
import { goldenText } from "./helpers/golden.js";
import { MemoryBlob } from "./helpers/memory-blob.js";

let now = new Date("2029-07-01T10:00:00.000Z");
const source = { expiresAt: "2099-01-01T00:00:00.000Z" };
const depsOf = (text: string): UseCaseDeps => ({
  store: new BlobLedgerStore(new MemoryBlob(text, true)),
  clock: { now: () => now },
  random: (target) => target.fill(7),
});
const other = (): string => `${goldenText()}`.split("\n").slice(0, -2).join("\n").concat("\n");

/** A screen that counts how many times it was painted and keeps the ledger it was given. */
const mount = (): {
  mounts: () => number;
  seen: () => LedgerSnapshot | undefined;
  stop: () => void;
} => {
  let mounts = 0;
  let seen: LedgerSnapshot | undefined;
  const host = document.createElement("div");
  const stop = render(
    () => (
      <RequireLedger>
        {(snapshot) => {
          mounts += 1;
          seen = snapshot;
          return <p>screen</p>;
        }}
      </RequireLedger>
    ),
    host,
  );
  return { mounts: () => mounts, seen: () => seen, stop };
};

describe("the gate while a write is in flight", () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("gives the screen the ledger that arrived, without painting it again, and stays put after", async () => {
    now = new Date("2029-07-01T10:00:00.000Z");
    await loadInto({ deps: depsOf(goldenText()), source });
    await vi.advanceTimersByTimeAsync(60_000);
    const screen = mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.mounts()).toBe(1);
    const first = screen.seen()?.etag;

    store.setWriting(true);
    await loadInto({ deps: depsOf(other()), source }, undefined, undefined, true);
    store.setWriting(false);
    await vi.advanceTimersByTimeAsync(0);
    const arrived = store.snapshot()?.etag;
    expect(arrived).not.toBe(first);
    expect(screen.mounts()).toBe(1);
    expect(screen.seen()?.etag).toBe(arrived);
    expect(screen.seen()?.events.length).toBe(store.snapshot()?.events.length);

    // The same ledger read again, in silence: nothing to paint.
    await loadInto({ deps: depsOf(other()), source }, undefined, undefined, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.mounts()).toBe(1);
    screen.stop();
  });

  it("paints the new day once the write is over", async () => {
    now = new Date("2029-07-01T21:00:00.000Z"); // 23:00 in Madrid
    await loadInto({ deps: depsOf(goldenText()), source });
    await vi.advanceTimersByTimeAsync(60_000);
    const screen = mount();
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.mounts()).toBe(1);

    store.setWriting(true);
    now = new Date("2029-07-01T22:00:00.000Z"); // midnight in Madrid
    await vi.advanceTimersByTimeAsync(60_000);
    expect(screen.mounts()).toBe(1);
    store.setWriting(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.mounts()).toBe(2);
    screen.stop();
  });
});
