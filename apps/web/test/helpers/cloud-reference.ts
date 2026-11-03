// What the cloud holds as reference data, answered as the API does (`docs/api.md` §6): the ECB
// manifest and file under `/api/reference/ecb/`, and price files under `/api/reference/prices/`.
// `referenceAnswer` is for tests that already stand in front of `fetch`; `serveReference` installs
// it as the global `fetch` for the ones that do not.

import { createHash } from "node:crypto";
import { priceFileName } from "@atlas/domain/quotes";

interface Reference {
  readonly ecb?: { readonly csv: string; readonly source?: "zip" | "api"; readonly hash?: string };
  /** The text of each `prices/<asset>.jsonl`, by asset. */
  readonly prices?: Readonly<Record<string, string>>;
  readonly symbols?: string;
  /** Every reference route answers with this status (the cloud is down, or refuses). */
  readonly status?: number;
}

const sha = (value: string): string => createHash("sha256").update(value).digest("hex");

const FILE_OF = { zip: "eurofxref-hist.csv", api: "api-exr.csv" } as const;

const found = (body: string): Response => new Response(body, { headers: { etag: '"v1"' } });
const missing = (): Response =>
  new Response(JSON.stringify({ error: { code: "not_found", details: {} } }), { status: 404 });

/** The answer of the API to a reference path, or `undefined` when the path is not reference data. */
export const referenceAnswer = (path: string, cloud: Reference): Response | undefined => {
  if (!path.startsWith("/api/reference/")) {
    return undefined;
  }
  if (cloud.status !== undefined) {
    return new Response(JSON.stringify({ error: { code: "not_allowed", details: {} } }), {
      status: cloud.status,
    });
  }
  const name = path.split("/").slice(4).join("/");
  if (path.startsWith("/api/reference/ecb/")) {
    const { ecb } = cloud;
    if (ecb === undefined) {
      return missing();
    }
    const source = ecb.source ?? "zip";
    if (name === "manifest.json") {
      return found(
        JSON.stringify({
          active: {
            file: FILE_OF[source],
            source,
            url: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.zip",
            fetched_at: "2026-10-01T15:30:00.000Z",
            sha256: ecb.hash ?? sha(ecb.csv),
          },
          rejected: [],
        }),
      );
    }
    return name === FILE_OF[source] ? found(ecb.csv) : missing();
  }
  if (name === "symbols.json") {
    return cloud.symbols === undefined ? missing() : found(cloud.symbols);
  }
  for (const [assetId, text] of Object.entries(cloud.prices ?? {})) {
    if (name === priceFileName(assetId)) {
      return found(text);
    }
  }
  return missing();
};

/** Installs the cloud as the global `fetch`; returns what restores it. */
export const serveReference = (cloud: Reference): (() => void) => {
  const holder = globalThis as { fetch: typeof fetch };
  const before = holder.fetch;
  holder.fetch = (async (input: RequestInfo | URL) => {
    const answer = referenceAnswer(String(input), cloud);
    if (answer === undefined) {
      throw new Error(`unexpected ${String(input)}`);
    }
    return answer;
  }) as typeof fetch;
  return () => {
    holder.fetch = before;
  };
};
