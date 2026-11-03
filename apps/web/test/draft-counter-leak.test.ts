// @vitest-environment happy-dom
//
// The counter of drafts listens to the window while its slot is on the page, and stops when the
// frame is replaced — also when it showed nothing (a count of 0 leaves the slot empty).

import { describe, expect, it, vi } from "vitest";
import { mountDraftCounter } from "../src/drafts/counter.js";
import { DRAFTS_CHANGED } from "../src/drafts/store.js";

describe("the counter of drafts", () => {
  it("stops listening once its empty slot has left the page", () => {
    const slot = document.createElement("span");
    document.body.append(slot);
    const removed = vi.spyOn(window, "removeEventListener");
    mountDraftCounter(slot);
    slot.remove();
    window.dispatchEvent(new Event(DRAFTS_CHANGED));
    expect(removed.mock.calls.some(([name]) => name === DRAFTS_CHANGED)).toBe(true);
    removed.mockRestore();
  });
});
