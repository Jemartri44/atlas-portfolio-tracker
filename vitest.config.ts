import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const local = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@atlas/domain": local("./packages/domain/src/index.ts"),
      "@atlas/adapters": local("./packages/adapters/src/index.ts"),
    },
  },
  test: {
    passWithNoTests: true,
    exclude: ["**/node_modules/**", "**/dist/**", "**/dist-test/**"],
    projects: [
      { extends: true, test: { name: "domain", root: "packages/domain" } },
      { extends: true, test: { name: "adapters", root: "packages/adapters" } },
      { extends: true, test: { name: "cli", root: "apps/cli" } },
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
