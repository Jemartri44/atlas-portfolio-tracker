// `@atlas/access` (ADR-0007, amended 2026-11-03): the pure rules of the access to the API, over
// `@atlas/domain` only. The domain and the web never reach it (the domain imports nothing outside
// itself, `domain-imports.test.ts`; the web, `api.test.ts`), and it reaches nothing but the domain.

import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { accessRoot, listSources, parse, repoRoot } from "../support/source-graph.js";

const accessSrc = join(accessRoot, "src");

describe("architecture: @atlas/access imports only @atlas/domain", () => {
  it("declares @atlas/domain as its one dependency", () => {
    const manifest = JSON.parse(readFileSync(join(accessRoot, "package.json"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(manifest.dependencies).toEqual({ "@atlas/domain": "0.1.0" });
    expect(manifest.devDependencies).toBeUndefined();
    expect(manifest.peerDependencies).toBeUndefined();
  });

  it("imports its own modules and @atlas/domain, and nothing else: no Node, no SDK, no app", () => {
    const sources = listSources(accessSrc);
    expect(sources.length).toBeGreaterThan(3);
    const violations = sources.flatMap((file) =>
      parse(file)
        .specifiers.filter((specifier) => {
          if (specifier.startsWith("./") || specifier.startsWith("../")) {
            return relative(accessSrc, resolve(dirname(file), specifier)).startsWith("..");
          }
          return !/^@atlas\/domain(\/[a-z-]+)?$/.test(specifier);
        })
        .map((specifier) => `${relative(repoRoot, file)} -> ${specifier}`),
    );
    expect(violations).toEqual([]);
  });
});
