// Feature 022 (ADR-0035, §3): every request of the web to its own API says
// `cache: "no-store"`, so the HTTP cache of the browser never writes the
// ledger, the session or the list of devices to disk. One test per caller of
// the web; the ECB reference (`/api/reference/ecb/*`) is public and keeps its
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
      [
        "/api/auth/logout",
        "/api/devices/tokens",
        "/api/devices/tokens/AAAAAAAAAAAAAAAAAAAAAA/revoke",
        "/api/session",
      ].sort(),
    );
    for (const call of calls) {
      expect(call.cache, call.url).toBe("no-store");
    }
  });
});

// M3 of the review: the callers are found by walking the code, not by a list
// of this test. A file that reaches the network and is not known here fails.
const src = join(dirname(fileURLToPath(import.meta.url)), "../../src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

/** Files that go to the network, with how: the ones that build the request themselves are read. */
const KNOWN = new Map<string, string>([
  ["ledger/cloud.ts", "pass-through of the page's fetch to httpRemote (no-store inside it)"],
  ["sync/devices.ts", "own requests"],
  ["sync/session.ts", "own requests"],
  ["sync/engine.ts", "httpRemote"],
  ["ecb/cloud.ts", "httpReference: public data, ETag and 304 on purpose"],
]);

describe("the code that reaches the network", () => {
  it("is exactly the known callers, and each own request says no-store", () => {
    const found = new Map<string, string>();
    for (const file of files(src)) {
      const text = readFileSync(file, "utf8").replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
      if (
        /\bfetch\(|\brequest\(\s*[`"']|httpRemote\(|httpReference\(|XMLHttpRequest|sendBeacon/.test(
          text,
        )
      ) {
        found.set(relative(src, file).replaceAll("\\", "/"), "");
        if (/(^|\/)sync\/(devices|session)\.ts$/.test(file)) {
          for (const call of text.matchAll(/\brequest\(\s*[`"'][\s\S]*?\n\s*\}\s*\)?;?\s*\n?/g)) {
            expect(call[0], file).toContain('cache: "no-store"');
          }
        }
      }
    }
    expect([...found.keys()].sort()).toEqual([...KNOWN.keys()].sort());
  });
});
