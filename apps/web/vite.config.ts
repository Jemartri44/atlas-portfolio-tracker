// Vite 8 + Solid. Three things here are not preferences (ADR-0017):
//
// 1. `build.minify` is left at its default. Vite 8 moved to Rolldown/Oxc and
//    `minify: "esbuild"` fails; the `esbuild` of docs/dependencies.md is for
//    bundling the Lambda, which is a different use.
// 2. `@atlas/*` resolve to **source**, like vitest.config.ts already does, so a
//    change in the domain shows up without rebuilding dist and Rolldown shakes
//    the tree over the sources.
// 3. The adapters barrel is never imported: it pulls `node:fs` through
//    FileLedgerStore. Only the subpaths are aliased, and both the architecture
//    test and scripts/check-bundle.mjs verify it on the real output.

import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import solid from "vite-plugin-solid";

const repo = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * Production CSP (constitution, security; ADR-0017). The dev server needs inline
 * scripts, so it gets its own. It has to be **the same string** as the one in
 * `index.html`, which is what `transformIndexHtml` swaps in dev.
 *
 * No `frame-ancestors`: a `<meta>` element cannot deliver it, so announcing it
 * here would promise a protection that does not exist. It is an HTTP header of
 * the distribution (phase 4).
 */
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** Dev CSP: identical but allowing the inline scripts Vite injects for HMR. Documented in the README. */
const DEVELOPMENT_CSP = PRODUCTION_CSP.replace(
  "script-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
)
  .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
  .replace("connect-src 'self'", "connect-src 'self' ws: wss:");

export default defineConfig(({ command }) => ({
  plugins: [
    solid(),
    {
      // index.html carries the production policy; in dev it is relaxed in place
      // so the two cannot drift apart into two separate files.
      name: "atlas-csp",
      transformIndexHtml: (html: string): string =>
        command === "serve" ? html.replace(PRODUCTION_CSP, DEVELOPMENT_CSP) : html,
    },
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png"],
      manifest: {
        name: "Atlas",
        short_name: "Atlas",
        description: "Gestión de la cartera de inversión: libro mayor, lotes FIFO y Renta.",
        lang: "es",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#0b1220",
        theme_color: "#0b1220",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        // The ledger lives on the device: nothing to fetch, nothing to fall back to.
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@atlas/domain": repo("../../packages/domain/src/index.ts"),
      "@atlas/adapters/blob": repo("../../packages/adapters/src/ledger-store/blob.ts"),
      "@atlas/adapters/browser": repo("../../packages/adapters/src/ledger-store/browser/index.ts"),
      "@atlas/adapters/clock": repo("../../packages/adapters/src/clock/system.ts"),
      "@atlas/adapters/random": repo("../../packages/adapters/src/random/web-crypto.ts"),
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
    // No `minify: "esbuild"` here on purpose (see the header).
    chunkSizeWarningLimit: 300,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
}));
