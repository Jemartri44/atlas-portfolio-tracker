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
      "@atlas/adapters/browser": local("./packages/adapters/src/ledger-store/browser/index.ts"),
      "@atlas/adapters/clock": local("./packages/adapters/src/clock/system.ts"),
      "@atlas/adapters/random": local("./packages/adapters/src/random/web-crypto.ts"),
      "@atlas/adapters": local("./packages/adapters/src/index.ts"),
      "@atlas/domain": local("./packages/domain/src/index.ts"),
    },
  },
  test: {
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/dist/**", "**/dist-test/**"],
    projects: [
      { extends: true, test: { name: "domain", root: "packages/domain" } },
      { extends: true, test: { name: "adapters", root: "packages/adapters" } },
      { extends: true, test: { name: "cli", root: "apps/cli" } },
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
        test: { name: "web", root: "apps/web", environment: "node" },
      },
      { extends: true, test: { name: "repo", root: "tests" } },
    ],
    coverage: {
      provider: "v8",
      include: ["packages/domain/src/**"],
      reporter: ["text", "html"],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
