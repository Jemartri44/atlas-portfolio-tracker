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

import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import solid from "vite-plugin-solid";

const repo = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const repoRoot = realpathSync(repo("../../"));

/**
 * A module id as the guard compares it: without the `\0` of a virtual module
 * and without its query (`?raw`, `?url`, `?worker&inline`, which travels
 * apart), and **after `realpath`**, relative to the repository — so no alias,
 * no `preserveSymlinks` and no `node_modules/@atlas/…` can make a file of a
 * package look like another path (round 3 of the review of PR #90).
 */
const normalise = (raw: string): { id: string; query: string } => {
  const bare = raw.replace(/^\0/, "");
  const at = bare.indexOf("?");
  const path = at === -1 ? bare : bare.slice(0, at);
  const query = at === -1 ? "" : bare.slice(at + 1);
  if (!isAbsolute(path)) {
    return { id: path, query };
  }
  const real = existsSync(path) ? realpathSync(path) : path;
  return { id: relative(repoRoot, real).replaceAll("\\", "/"), query };
};

interface Graph {
  readonly chunks: readonly {
    readonly file: string;
    readonly entry: string | null;
    readonly modules: readonly {
      readonly id: string;
      readonly query: string;
      readonly bytes: number;
      readonly exports: readonly string[];
    }[];
  }[];
  readonly assets: readonly { readonly file: string; readonly sources: readonly string[] }[];
}

/** The graphs of the workers, filled while the main build transforms their imports. */
const workerGraphs: Graph[] = [];

/**
 * **The real graph of the bundle**, for the authoritative guard (rounds 2 and
 * 3 of the review of PR #90): every module Rolldown put in every chunk, with
 * the bytes it renders and the names the bundle uses of it, and every asset
 * with the files it comes from, written next to the output for
 * `scripts/check-bundle.mjs` to read. **The workers are other builds**: the
 * same plugin goes in `worker.plugins`, and their graphs travel inside the
 * one of the main build, which runs after them. The static guards of
 * `tests/api-access.test.ts` read the sources and are a quick warning; what
 * the browser can download is decided here, and a module the web must not
 * reach — however it got in: a relay, a relative path, `require`,
 * `import.meta.glob`, a string, a worker, a query, an alias — is in this list
 * or it is not in the bundle. Never precached nor served: `.json` is not among
 * the patterns of the service worker, and the deploy (017) leaves `.vite/` out
 * like Vite's own manifest.
 */
const moduleGraph = (build: "main" | "worker"): Plugin => ({
  name: `atlas-module-graph-${build}`,
  apply: "build",
  buildStart() {
    if (build === "main") {
      workerGraphs.length = 0;
    }
  },
  generateBundle(_options, bundle) {
    const graph: Graph = {
      chunks: Object.values(bundle)
        .filter((output) => output.type === "chunk")
        .map((chunk) => ({
          file: chunk.fileName,
          entry: chunk.facadeModuleId === null ? null : normalise(chunk.facadeModuleId).id,
          modules: chunk.moduleIds.map((id) => ({
            ...normalise(id),
            bytes: chunk.modules[id]?.renderedLength ?? 0,
            exports: chunk.modules[id]?.renderedExports ?? [],
          })),
        })),
      assets: Object.values(bundle)
        .filter((output) => output.type === "asset")
        .map((asset) => ({
          file: asset.fileName,
          // Relative to the root of the web when they are not absolute.
          sources: asset.originalFileNames.map(
            (source) => normalise(isAbsolute(source) ? source : repo(`./${source}`)).id,
          ),
        })),
    };
    if (build === "worker") {
      workerGraphs.push(graph);
      return;
    }
    this.emitFile({
      type: "asset",
      fileName: ".vite/atlas-modules.json",
      source: `${JSON.stringify({ ...graph, workers: workerGraphs }, null, 1)}\n`,
    });
  },
});

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
    moduleGraph("main"),
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
        // Except under /api/: the sign-in (`/api/auth/login`) and the return
        // from Google are navigations the Lambda must answer. Found on the
        // screen in feature 015: with the service worker installed, the SPA
        // painted «Aquí no hay nada» instead of going to Google.
        navigateFallbackDenylist: [/^\/api\//],
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
  // The workers are built apart; their graph goes to the guard like the rest.
  worker: { plugins: () => [moduleGraph("worker")] },
  build: {
    target: "es2022",
    sourcemap: true,
    /*
     * **An asset that is a source of code is not inlined by size** (round 4
     * of the review of PR #90, V3-inline). `new URL("…", import.meta.url)`
     * makes the file an asset, and Vite inlines an asset under 4 KiB as a
     * `data:` URL instead of emitting it: the text of a vetoed source then
     * travelled inside a chunk, out of every graph. Emitted, it is a file
     * `check-bundle.mjs` refuses. Anything else keeps the default of Vite
     * (`undefined`). **This does not cover `?inline`** (round 5): Vite reads
     * that query before it asks this function, and inlines whatever the
     * function says; what stops it is the rule of `data:` URLs of
     * `check-bundle.mjs`, which reads the MIME type and the graph.
     */
    assetsInlineLimit: (filePath: string): boolean | undefined =>
      /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)(\?|$)/.test(filePath) ? false : undefined,
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
