// The aliases of the workspaces for Vite and Vitest, **read off the `exports` of each package**:
// `@atlas/<pkg>/<door>` goes to the source its `exports` points at (`./dist/x.js` → `./src/x.ts`).
// The `exports` are the one list of doors; nothing else names them (the Lambda packaging and the
// architecture tests read them too). Each alias matches its specifier exactly, so no order between
// a door and the barrel matters.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * @param {string} repoRoot the root of the repository
 * @param {readonly string[]} packages folders under the root, e.g. `packages/domain`
 * @returns {{ find: RegExp; replacement: string }[]}
 */
export const workspaceAliases = (repoRoot, packages) =>
  packages.flatMap((folder) => {
    const root = resolve(repoRoot, folder);
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return Object.entries(manifest.exports).map(([door, entry]) => {
      const specifier = door === "." ? manifest.name : `${manifest.name}${door.slice(1)}`;
      const source = entry.import.replace(/^\.\/dist\//, "./src/").replace(/\.js$/, ".ts");
      return {
        find: new RegExp(`^${specifier.replaceAll("/", "\\/")}$`),
        replacement: join(root, source),
      };
    });
  });
