// The service worker keeps the shell of the application and nothing of the API (ADR-0035, §3). The
// options are the ones `vite.config.ts` hands to the plugin, read as they are, not a copy.

import { describe, expect, it } from "vitest";
import { MANIFEST, WORKBOX_OPTIONS } from "../vite.config.js";

describe("the service worker", () => {
  it("precaches only the shell, by the patterns of static files", () => {
    expect(WORKBOX_OPTIONS.globPatterns).toEqual(["**/*.{js,css,html,svg,png,webmanifest,woff2}"]);
  });

  it("has no runtime caching rule: nothing fetched at run time is ever kept", () => {
    expect(WORKBOX_OPTIONS.runtimeCaching).toBeUndefined();
    expect(WORKBOX_OPTIONS.additionalManifestEntries).toBeUndefined();
    expect(WORKBOX_OPTIONS.importScripts).toBeUndefined();
  });

  it("never answers a navigation under /api/ with the shell", () => {
    const denied = WORKBOX_OPTIONS.navigateFallbackDenylist ?? [];
    for (const path of ["/api/auth/login", "/api/auth/callback", "/api/ledger", "/api/session"]) {
      expect(
        denied.some((rule) => rule.test(path)),
        path,
      ).toBe(true);
    }
    expect(denied.some((rule) => rule.test("/cartera"))).toBe(false);
    expect(WORKBOX_OPTIONS.navigateFallback).toBe("index.html");
  });
});

describe("the shortcuts of the installed application", () => {
  it("offer to record a purchase and a valuation from a long press on the icon", () => {
    expect(MANIFEST.shortcuts?.map(({ name, url }) => [name, url])).toEqual([
      ["Registrar compra", "/registrar/buy"],
      ["Registrar valoración", "/registrar/valuation"],
    ]);
  });
});
