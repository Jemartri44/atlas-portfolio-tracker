// @vitest-environment happy-dom
//
// Feature 016, E3, block 2 (R37; mutant 25): the web of the phone downloads
// the ECB history from its own cloud — the manifest, then the file in force,
// its SHA-256 checked against the manifest before anything reads it — and
// keeps it as the imported copy is kept, marked as from the cloud. Only when
// the card of the ECB opens or the user asks; never at start or on a timer.
// Over a `fetch` that answers as the API does; never the network.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import { downloadCloudHistory } from "../src/ecb/cloud.js";
import { loadWebHistory, reloadWebHistory } from "../src/ecb/history.js";
import Ajustes from "../src/routes/ajustes/index.jsx";
import { settle, show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const root = dirname(fileURLToPath(import.meta.url));
const csv = readFileSync(join(root, "../../../tests/fixtures/ecb/eurofxref-hist.csv"), "utf8");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

const manifestOf = (content: string, hash = sha(content)) =>
  JSON.stringify({
    active: {
      file: "eurofxref-hist.csv",
      source: "zip",
      url: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.zip",
      fetched_at: "2026-10-01T15:30:00.000Z",
      sha256: hash,
    },
    rejected: [],
  });

interface Cloud {
  manifest?: string;
  file?: string;
  status?: number;
  session?: boolean;
}

/** The API of the tests: the session, the manifest (version m-<sha>) and the file. */
const api = (cloud: Cloud) => {
  const asked: { path: string; ifNoneMatch: string | null }[] = [];
  const request = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const headers = new Headers(init?.headers);
    asked.push({ path, ifNoneMatch: headers.get("if-none-match") });
    if (path === "/api/session") {
      return cloud.session === false
        ? new Response(JSON.stringify({ error: { code: "unauthenticated", details: {} } }), {
            status: 401,
          })
        : new Response(
            JSON.stringify({
              signed_in: true,
              expires_at: "2026-10-30T00:00:00.000Z",
              device_id: "D".repeat(22),
            }),
          );
    }
    if (cloud.status !== undefined) {
      return new Response(JSON.stringify({ error: { code: "device_forgotten", details: {} } }), {
        status: cloud.status,
      });
    }
    if (path === "/api/reference/ecb/manifest.json") {
      if (cloud.manifest === undefined) {
        return new Response(JSON.stringify({ error: { code: "not_found", details: {} } }), {
          status: 404,
        });
      }
      const version = `m-${sha(cloud.manifest).slice(0, 8)}`;
      return headers.get("if-none-match") === `"${version}"`
        ? new Response(null, { status: 304, headers: { etag: `"${version}"` } })
        : new Response(cloud.manifest, { headers: { etag: `"${version}"` } });
    }
    if (path === "/api/reference/ecb/eurofxref-hist.csv" && cloud.file !== undefined) {
      return new Response(cloud.file, { headers: { etag: '"f1"' } });
    }
    throw new Error(`unexpected ${path}`);
  }) as typeof fetch;
  return { asked, request };
};

const holder = globalThis as { indexedDB?: unknown };
const before = holder.indexedDB;
beforeAll(() => {
  holder.indexedDB = new FakeIdbFactory();
});
beforeEach(() => {
  holder.indexedDB = new FakeIdbFactory();
});
afterAll(() => {
  holder.indexedDB = before;
});

const NOW = () => new Date("2026-10-02T08:00:00.000Z");

describe("the ECB history of the cloud in the web (016, E3, block 2)", () => {
  it("downloads the file in force, checks its SHA-256 and keeps it as from the cloud", async () => {
    const { asked, request } = api({ manifest: manifestOf(csv), file: csv });
    expect(await downloadCloudHistory(request, NOW)).toEqual({
      kind: "saved",
      latest: "2026-03-31",
      source: "zip",
    });
    expect(asked.map((a) => a.path)).toEqual([
      "/api/reference/ecb/manifest.json",
      "/api/reference/ecb/eurofxref-hist.csv",
    ]);
    const web = await loadWebHistory();
    expect(web).toMatchObject({ origin: "cloud", source: "zip", latest: "2026-03-31" });
    // Asked again on the version it holds: nothing travels.
    asked.length = 0;
    expect(await downloadCloudHistory(request, NOW)).toEqual({ kind: "up_to_date" });
    expect(asked).toEqual([
      {
        path: "/api/reference/ecb/manifest.json",
        ifNoneMatch: `"m-${sha(manifestOf(csv)).slice(0, 8)}"`,
      },
    ]);
  });

  it("never uses a file that is not the one its manifest records (mutant 25)", async () => {
    const { importedHistory } = await import("@atlas/adapters/reference");
    const held = JSON.stringify(await importedHistory());
    const other = csv.replace(/^2026-03-31.*\n/m, "");
    const { request } = api({ manifest: manifestOf(other, sha("something else")), file: other });
    expect(await downloadCloudHistory(request, NOW)).toEqual({ kind: "damaged" });
    const unreadable = api({ manifest: "{", file: other });
    expect(await downloadCloudHistory(unreadable.request, NOW)).toEqual({ kind: "damaged" });
    // Nothing of it was kept.
    expect(JSON.stringify(await importedHistory())).toBe(held);
  });

  it("never replaces what it holds with a history that changes a published rate", async () => {
    await downloadCloudHistory(api({ manifest: manifestOf(csv), file: csv }).request, NOW);
    const changed = csv.replace(",0.8595,", ",0.8596,");
    const { request } = api({ manifest: manifestOf(changed), file: changed });
    expect(await downloadCloudHistory(request, NOW)).toEqual({ kind: "rejected", total: 1 });
    expect((await reloadWebHistory()).history).toBeDefined();
  });

  it("says a cloud with no history, and a failure by its code", async () => {
    expect(await downloadCloudHistory(api({}).request, NOW)).toEqual({ kind: "none" });
    expect(await downloadCloudHistory(api({ status: 403 }).request, NOW)).toEqual({
      kind: "failed",
      code: "device_forgotten",
    });
  });

  it("comes down when the card opens with a session, and says it", async () => {
    const { asked, request } = api({ manifest: manifestOf(csv), file: csv });
    const real = globalThis.fetch;
    globalThis.fetch = request;
    try {
      await reloadWebHistory();
      const host = await show("/ajustes", Ajustes);
      await settle(100);
      const said = text(host);
      expect(said).toContain("Bajado de tu nube");
      expect(said).toContain("Bajar de la nube");
      expect(asked.map((a) => a.path)).toContain("/api/reference/ecb/manifest.json");
    } finally {
      globalThis.fetch = real;
    }
  });

  it("downloads nothing when the card opens without a session", async () => {
    const { asked, request } = api({ manifest: manifestOf(csv), file: csv, session: false });
    const real = globalThis.fetch;
    globalThis.fetch = request;
    try {
      const host = await show("/ajustes", Ajustes);
      await settle(100);
      expect(asked.filter((a) => a.path.startsWith("/api/reference/"))).toEqual([]);
      expect(text(host)).not.toContain("Bajar de la nube");
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe("nothing downloads the history of the cloud at start or on a timer (mutant 25)", () => {
  const src = join(root, "../src");
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(join(dir, entry.name))
        : /\.tsx?$/.test(entry.name)
          ? [join(dir, entry.name)]
          : [],
    );

  it("is reached only from the card of the ECB, which keeps no timer", () => {
    const importers = files(src).filter((file) =>
      /ecb\/cloud\.js/.test(readFileSync(file, "utf8")),
    );
    expect(importers.map((file) => file.slice(src.length + 1))).toEqual([
      "routes/ajustes/EcbCard.tsx",
    ]);
    const card = readFileSync(join(src, "routes/ajustes/EcbCard.tsx"), "utf8");
    expect(card).not.toMatch(/setTimeout|setInterval|requestIdleCallback/);
    // It downloads from `onMount` and from its button, and from nothing else.
    expect(card.match(/downloadCloudHistory\(/g)).toHaveLength(1);
  });
});
