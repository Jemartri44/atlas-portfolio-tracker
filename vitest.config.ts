import { fileURLToPath } from "node:url";
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
        resolve: { conditions: ["browser", "development"] },
        ssr: { resolve: { conditions: ["browser", "development"] } },
        test: { name: "web", root: "apps/web" },
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
