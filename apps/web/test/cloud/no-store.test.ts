// Every request of the web to its own API says `cache: "no-store"` (ADR-0035, §3), so the HTTP
// cache of the browser never writes the ledger or the session to disk. One
// test per caller of the web; the ECB reference (`/api/reference/ecb/*`) is public and keeps its
// `ETag`/`304` on purpose, and is not among them.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listCalls } from "./no-store-support.js";

describe("requests of the web to the API", () => {
  it("every caller asks with no-store", async () => {
    const calls = await listCalls();
    expect(calls.map((call) => call.url).sort()).toEqual(
      ["/api/auth/logout", "/api/auth/logout-all", "/api/session"].sort(),
    );
    for (const call of calls) {
      expect(call.cache, call.url).toBe("no-store");
    }
  });
});

// The callers are found by walking the code, not by a list of this test. A file that reaches the
// network and is not known here fails.
const src = join(dirname(fileURLToPath(import.meta.url)), "../../src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

/** Files that go to the network, with how: the ones that build the request themselves are read. */
const KNOWN = new Map<string, string>([
  ["ledger/cloud.ts", "pass-through of the page's fetch to httpRemote (no-store inside it)"],
  ["auth/session.ts", "own requests"],
  ["ecb/history.ts", "httpReference: public data, read whole into memory"],
  ["prices/quotes.ts", "httpReference: public data, read whole into memory"],
]);

describe("the code that reaches the network", () => {
  it("is exactly the known callers, and each own request says no-store", () => {
    const found = new Map<string, string>();
    for (const file of files(src)) {
      const text = readFileSync(file, "utf8").replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
      if (
        /\bfetch\(|\brequest\(\s*([`"']|path\b)|httpRemote\(|httpReference\(|XMLHttpRequest|sendBeacon/.test(
          text,
        )
      ) {
        found.set(relative(src, file).replaceAll("\\", "/"), "");
        if (/(^|\/)auth\/session\.ts$/.test(file)) {
          const calls = [
            ...text.matchAll(/\brequest\(\s*([`"']|path\b)[\s\S]*?\n\s*\}\s*\)?;?\s*\n?/g),
          ];
          expect(calls.length, file).toBe(2);
          for (const call of calls) {
            expect(call[0], file).toContain('cache: "no-store"');
          }
        }
      }
    }
    expect([...found.keys()].sort()).toEqual([...KNOWN.keys()].sort());
  });
});
