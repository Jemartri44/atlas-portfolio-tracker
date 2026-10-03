import { fileURLToPath } from "node:url";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

const local = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    // The subpaths go first: aliases are matched by prefix, so the barrel
    // would otherwise swallow `@atlas/adapters/blob`.
    alias: {
      "@atlas/adapters/blob": local("./packages/adapters/src/ledger-store/blob.ts"),
      "@atlas/adapters/web-device": local(
        "./packages/adapters/src/ledger-store/browser/web-device.ts",
      ),
      "@atlas/adapters/aws-sdk": local("./packages/adapters/src/aws/sdk.ts"),
      "@atlas/adapters/aws-admin": local("./packages/adapters/src/aws/sdk-admin.ts"),
      "@atlas/adapters/aws-jobs": local("./packages/adapters/src/aws/jobs.ts"),
      "@atlas/adapters/aws-daily": local("./packages/adapters/src/aws/daily.ts"),
      "@atlas/adapters/aws-ses": local("./packages/adapters/src/aws/sdk-ses.ts"),
      "@atlas/adapters/aws": local("./packages/adapters/src/aws/index.ts"),
      "@atlas/adapters/access": local("./packages/adapters/src/access/crypto.ts"),
      "@atlas/adapters/identity": local("./packages/adapters/src/identity/index.ts"),
      "@atlas/adapters/sync-client": local("./packages/adapters/src/sync/client.ts"),
      "@atlas/adapters/sync-http": local("./packages/adapters/src/sync/http-remote.ts"),
      "@atlas/adapters/reference-http": local("./packages/adapters/src/reference/http.ts"),
      "@atlas/adapters/sync": local("./packages/adapters/src/ledger-store/browser/sync-store.ts"),
      "@atlas/adapters/reference": local(
        "./packages/adapters/src/ledger-store/browser/reference.ts",
      ),
      "@atlas/adapters/folder": local("./packages/adapters/src/ledger-store/browser/folder.ts"),
      "@atlas/adapters/prices": local("./packages/adapters/src/ledger-store/browser/prices.ts"),
      "@atlas/adapters/transfer": local("./packages/adapters/src/ledger-store/browser/transfer.ts"),
      "@atlas/adapters/drafts": local("./packages/adapters/src/ledger-store/browser/drafts.ts"),
      "@atlas/adapters/browser": local("./packages/adapters/src/ledger-store/browser/index.ts"),
      "@atlas/adapters/clock": local("./packages/adapters/src/clock/system.ts"),
      "@atlas/adapters/random": local("./packages/adapters/src/random/web-crypto.ts"),
      "@atlas/adapters": local("./packages/adapters/src/index.ts"),
      "@atlas/domain/ecb": local("./packages/domain/src/ecb.ts"),
      "@atlas/domain/fiscal": local("./packages/domain/src/fiscal.ts"),
      "@atlas/domain/tools": local("./packages/domain/src/tools.ts"),
      "@atlas/domain/quotes": local("./packages/domain/src/quotes.ts"),
      "@atlas/domain/sync": local("./packages/domain/src/sync.ts"),
      "@atlas/domain/remote-answers": local("./packages/domain/src/remote-answers.ts"),
      "@atlas/domain/access": local("./packages/domain/src/access.ts"),
      "@atlas/domain/admin": local("./packages/domain/src/admin.ts"),
      "@atlas/domain/jobs": local("./packages/domain/src/jobs.ts"),
      "@atlas/domain": local("./packages/domain/src/index.ts"),
      "@atlas/api": local("./apps/api/src/index.ts"),
    },
  },
  test: {
    passWithNoTests: true,
    // Every outDir of a tsconfig (tests/test-outputs.test.ts): a compiled test
    // must never run a second time after a build.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-test/**",
      "**/dist-test-sync/**",
      "**/dist-test-browser/**",
    ],
    projects: [
      { extends: true, test: { name: "domain", root: "packages/domain" } },
      { extends: true, test: { name: "adapters", root: "packages/adapters" } },
      { extends: true, test: { name: "cli", root: "apps/cli" } },
      { extends: true, test: { name: "api", root: "apps/api" } },
      { extends: true, test: { name: "jobs", root: "apps/jobs" } },
      {
        extends: true,
        /*
         * Solid resolves its **server** build under the "node" condition, and
         * there a `createMemo` never updates. Vitest transforms through the SSR
         * pipeline, so the condition has to be set on both sides for the store
         * to be reactive in a plain Node process (Q8: no DOM, real signals).
         */
        /*
         * The Solid compiler, only for this project: its JSX is not standard
         * JSX, it compiles to fine-grained DOM operations, so esbuild alone
         * would produce something that renders nothing. Needed since feature
         * 007, where three tests render a component under `happy-dom`.
         */
        plugins: [solid()],
        resolve: { conditions: ["browser", "development"] },
        ssr: { resolve: { conditions: ["browser", "development"] } },
        /*
         * `@solidjs/router` ships **untransformed `.jsx`**, which Node refuses
         * to load, so any test that imported a screen died with "Unknown file
         * extension .jsx" before reaching a single assertion. Inlining it sends
         * it through Vite's pipeline like our own sources.
         *
         * This one line is what makes the component layer testable at all, and
         * that layer is where the four non-negotiable rules of this feature
         * actually live: the privacy mask on a chart axis, the hole that must
         * not be spanned, and the two screens cutting the ledger by the date
         * asked. Their view-models were tested; the wiring between them and the
         * pixels was not, and that is precisely where the defect of feature 004
         * was born.
         */
        /*
         * **No DOM by default**, still (decision (k) of the 006): the pure
         * layers (`format/`, `view-models/`, `ledger/`) are tested as
         * functions, and the rule that only `Amount` may format money is
         * checked on the **import graph**, which is structural and outlives any
         * testing library.
         *
         * `happy-dom` was authorised in feature 007 for the three things the
         * graph cannot see, and each test that needs it says so in its own
         * header with `@vitest-environment happy-dom`. Opting in per file rather
         * than switching the project keeps the other 60-odd tests running
         * exactly as they did.
         */
        test: {
          name: "web",
          root: "apps/web",
          environment: "node",
          /*
           * **No test of the web goes out to the network** (T1 of the review
           * of PR #90, round 2): `fetch` fails at once on any call a test did
           * not simulate, in both environments.
           */
          setupFiles: ["./test/setup/no-network.ts"],
          server: { deps: { inline: [/@solidjs\/router/] } },
        },
      },
      { extends: true, test: { name: "repo", root: "tests" } },
      {
        extends: true,
        // Feature 017: the infrastructure suite. It never reaches AWS: the guard
        // below refuses to start when the process has any credential.
        test: {
          name: "infra",
          root: "infra/test",
          setupFiles: ["./setup/no-credentials.ts"],
          // Rendering a plan loads the whole AWS provider: tens of seconds each.
          testTimeout: 600_000,
          hookTimeout: 600_000,
        },
      },
    ],
    // Measured in a pass of the domain alone (`npm run test:coverage:domain`;
    // feature 015, E5, §34): the merge of several projects once lost the hits
    // of a whole test file, and the 100 % depended on tests of other projects.
    coverage: {
      provider: "v8",
      include: ["packages/domain/src/**"],
      // `json` writes coverage/coverage-final.json, which the CI keeps when the
      // coverage fails (review of PR #90, CI-1).
      reporter: ["text", "html", "json"],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
