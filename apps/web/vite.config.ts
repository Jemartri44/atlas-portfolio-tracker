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
        description: "Gestión de la cartera de inversión: movimientos, lotes FIFO y Renta.",
        lang: "es",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        // The paper of the page for the splash, the top bar for the system bar:
        // the light theme, the one a manifest can name (tokens.css).
        background_color: "#f3f2ee",
        theme_color: "#ffffff",
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
      // The subpaths first: aliases match by prefix, so the barrel would
      // otherwise swallow `@atlas/domain/fiscal`.
      "@atlas/domain/ecb": repo("../../packages/domain/src/ecb.ts"),
      "@atlas/domain/fiscal": repo("../../packages/domain/src/fiscal.ts"),
      "@atlas/domain/quotes": repo("../../packages/domain/src/quotes.ts"),
      "@atlas/domain/sync": repo("../../packages/domain/src/sync.ts"),
      "@atlas/domain": repo("../../packages/domain/src/index.ts"),
      "@atlas/adapters/blob": repo("../../packages/adapters/src/ledger-store/blob.ts"),
      "@atlas/adapters/web-device": repo(
        "../../packages/adapters/src/ledger-store/browser/web-device.ts",
      ),
      "@atlas/adapters/sync-client": repo("../../packages/adapters/src/sync/client.ts"),
      "@atlas/adapters/sync": repo(
        "../../packages/adapters/src/ledger-store/browser/sync-store.ts",
      ),
      "@atlas/adapters/reference": repo(
        "../../packages/adapters/src/ledger-store/browser/reference.ts",
      ),
      "@atlas/adapters/folder": repo("../../packages/adapters/src/ledger-store/browser/folder.ts"),
      "@atlas/adapters/prices": repo("../../packages/adapters/src/ledger-store/browser/prices.ts"),
      "@atlas/adapters/transfer": repo(
        "../../packages/adapters/src/ledger-store/browser/transfer.ts",
      ),
      "@atlas/adapters/drafts": repo("../../packages/adapters/src/ledger-store/browser/drafts.ts"),
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
    rollupOptions: {
      output: {
        /*
         * **The domain travels in one chunk** (feature 010, block 4).
         *
         * The browser downloads the domain at boot: the first screen projects
         * the ledger, so there is no way around it (ADR-0007). What there is a
         * way around is downloading it **in pieces**: when the fiscal engine
         * became reachable from a lazily loaded corner of the summary, the
         * grouping split the domain into two boot chunks to let the fiscal
         * chunk import only its half, and the same code cost 1,3 KB gzip more
         * — compression does not cross a chunk boundary, and each half pays
         * its own import plumbing. Measured: 73,0 KB before the card, 74,3
         * with it and 72,7 with this group, against a ceiling of 74,0.
         *
         * The test keeps out exactly what must **not** be on the boot path:
         * `tax/`, `informative/`, the `fiscal.ts` door and the three modules
         * of `filings/` that reach the tax chain — and, since feature 012,
         * everything of the ECB (`ecb/`, the `ecb.ts` door and the local
         * configuration in `config/`), which must never be on the boot path
         * either (decision (r) of its prompt); and, since feature 013, the
         * automatic daily closes (`quotes/` and the `quotes.ts` door), and since
         * feature 014 the sync of the ledger (`sync/`, the `sync.ts` door and
         * its two ports), lazy by construction. **The store of the browser rides
         * in the same chunk** (`blob.ts`, and `idb.ts`, `indexeddb.ts`,
         * `folder.ts` and the `index.ts` of `browser/`): it is boot too —
         * opening the ledger is the boot. Once the lazy screens of the ECB
         * shared the folder reader with the boot, the bundler split the whole
         * store into a boot chunk of its own, and that plumbing cost 0,5 KB
         * gzip (measured, feature 012). They are grouped by whoever
         * imports them, which is only ever a lazily loaded screen, and
         * `scripts/check-bundle.mjs` fails the build if any of them turns up
         * in a chunk `index.html` preloads.
         */
        advancedChunks: {
          groups: [
            {
              name: "domain",
              test: /packages[\\/](?:domain[\\/](?:vendor|src[\\/](?!tax[\\/]|informative[\\/]|fiscal\.ts|ecb[\\/]|ecb\.ts|config[\\/]|quotes[\\/]|quotes\.ts|sync[\\/]|sync\.ts|ports[\\/](?:remote-ledger|sync-state-store)\.ts|filings[\\/](?:closed-years|comparison|proposal)))|adapters[\\/]src[\\/]ledger-store[\\/](?:blob\.ts|browser[\\/](?:idb|indexeddb|picker|index)\.ts))/,
            },
          ],
        },
      },
    },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
}));
