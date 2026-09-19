// @vitest-environment happy-dom
//
// The bucket as composed in docs/design/system.md §7.6: it opens with its
// result against the index, masked like any amount; its warnings are the one
// notice of the application and none links to the screen already open; and a
// bucket where nothing ever happened is one empty state.

import { describe, expect, it } from "vitest";
import { store } from "../src/ledger/state.js";
import Cubo from "../src/routes/cubo/index.jsx";
import { openLedger, show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

describe("the bucket", () => {
  it("opens with its result against the index, masked with the privacy mode", async () => {
    store.setPrivacy(true);
    const host = await show("/cubo?fecha=2029-01-15", Cubo);
    const hero = host.querySelector(".card .hero-figure");
    expect(hero?.querySelector(".mask")).not.toBeNull();
    expect(text(hero)).not.toMatch(/\d/);
  });

  it("says its warnings with the one notice, and never links to itself", async () => {
    const host = await show("/cubo?fecha=2029-01-15", Cubo);
    const warnings = host.querySelector('[aria-label="Avisos del cubo"]');
    expect(warnings?.querySelectorAll(".notice").length).toBeGreaterThan(0);
    expect(warnings?.querySelector('a[href="/cubo"]')).toBeNull();
    expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

  it("is one empty state when nothing ever happened in it", async () => {
    await openLedger("");
    const host = await show("/cubo", Cubo);
    expect(host.querySelectorAll(".card")).toHaveLength(1);
    expect(text(host.querySelector(".empty"))).toContain("El cubo está vacío.");
    expect(host.querySelector('.empty a[href="/registrar/tesis"]')).not.toBeNull();
  });
});
