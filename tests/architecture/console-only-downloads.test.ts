import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { exportsOf as sharedExportsOf } from "../support/source-graph.js";
import {
  domainSrc,
  listSourceFiles,
  listTsFiles,
  repoRoot,
  specifiersOf,
  webSrc,
} from "./support.js";

// ---------------------------------------------------------------------------
// The addresses of the ECB and of the price sources, and the file of the keys, never reach the web.
// ---------------------------------------------------------------------------

describe("architecture: the ECB and the prices are downloaded by the console only", () => {
  const adapters = join(repoRoot, "packages", "adapters");
  const adaptersSrc = join(adapters, "src");

  /**
   * Every file of the adapters the web can bundle: what each subpath of `exports` points at, **read
   * off `package.json`, excluding `"."`** (the barrel of Node), and everything those files import,
   * at any depth. A subpath added tomorrow is looked at without anybody writing it here.
   */
  const webReachableAdapters = (): string[] => {
    // Every condition of each export, one module or a failure.
    const pending = [...sharedExportsOf(adapters)]
      .filter(([subpath]) => subpath !== ".")
      .map(([, source]) => source);
    const seen = new Set<string>();
    while (pending.length > 0) {
      const file = pending.pop() as string;
      if (seen.has(file)) {
        continue;
      }
      seen.add(file);
      for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
        if (specifier.startsWith(".")) {
          pending.push(resolve(dirname(file), specifier).replace(/\.js$/, ".ts"));
        }
      }
    }
    return [...seen];
  };

  /**
   * The web downloads nothing from a third party (ADR-0028, ADR-0029, ADR-0031): **the addresses of
   * the ECB and of the APIs of prices live in `@atlas/adapters`, outside every subpath the web
   * imports, and never in the domain**, which the web bundles whole. The check of origins of the
   * bundle catches a URL that reaches the output; this catches it in the source, before, and also
   * without its scheme. The hosts of the four sources ADR-0031 names are all here, the two that
   * were dropped included: none of them may reach the web.
   */
  it("keeps the addresses of the ECB and of the sources of prices out of what the web bundles", () => {
    const reachable = webReachableAdapters();
    expect(reachable.some((file) => file.endsWith(join("reference", "http.ts")))).toBe(true);
    const webReachable = [...listTsFiles(domainSrc), ...listSourceFiles(webSrc), ...reachable];
    const hosts =
      /["'`][^"'`\n]*(?:ecb\.europa\.eu|eodhd\.com|eodhistoricaldata\.com|api\.coingecko\.com|openfigi\.com)/;
    const violations = webReachable
      // Inside a string, with or without its scheme. Comments are not stripped
      // first: a line comment starts with the `//` of every `https://`, and
      // stripping them hid the very address this looks for.
      .filter((file) => hosts.test(readFileSync(file, "utf8")))
      .map((file) => relative(repoRoot, file));
    expect(violations).toEqual([]);
    // And the places they do live are where the test above does not look.
    expect(readFileSync(join(adaptersSrc, "ecb", "source.ts"), "utf8")).toContain("ecb.europa.eu");
    expect(readFileSync(join(adaptersSrc, "prices", "eodhd.ts"), "utf8")).toContain("eodhd.com");
    expect(reachable.some((file) => file.includes(join("src", "prices")))).toBe(false);
  });

  /** And the web never reads the keys: nothing it bundles names the file or its reader. */
  it("never lets the web reach the file of the keys", () => {
    const offenders = [
      ...listTsFiles(domainSrc),
      ...listSourceFiles(webSrc),
      ...webReachableAdapters(),
    ]
      .filter((file) =>
        /secrets\.json|readSecrets|prices\/secrets/.test(readFileSync(file, "utf8")),
      )
      .map((file) => relative(repoRoot, file));
    expect(offenders).toEqual([]);
  });
});
