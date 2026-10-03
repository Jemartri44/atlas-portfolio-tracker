// Feature 016, block 1 of E1: the package of the scheduled jobs
// (`apps/jobs/scripts/build-lambda.mjs`), one artefact for the five functions
// (§8.1 P4). Like the package of the API (`tests/lambda-package.test.ts`) it
// carries the SDK and the sources of the product, never a test or a double —
// the file notifier of the captures included (mutant 10) — it is the same
// bytes twice, and it is a module Node loads, up to the composition, which
// refuses to start without its configuration.
//
// **The one declared exception to the guardian of the doubles** (§8.2 m3) is
// the simulated price source of `dev`, which travels in the artefact because
// it is built once and promoted, and which the composition refuses in `prod`.
// It is named here, and nothing else may be.

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(repoRoot, "apps", "jobs", "scripts", "build-lambda.mjs");

/** The doubles that may travel in the artefact: only the simulated source of `dev` (m3). */
const DECLARED_DOUBLES = ["packages/adapters/src/aws/simulated-prices.ts"] as const;

interface Script {
  buildJobs(outDir: string): Promise<{ inputs: string[]; bundle: Uint8Array }>;
  zipOne(name: string, content: Uint8Array): Buffer;
}

const load = async (): Promise<Script> => (await import(pathToFileURL(script).href)) as Script;

/** A double by its name: a fake, a stub, a simulated or file notifier, anything `test-only-`. */
const looksLikeDouble = (input: string): boolean =>
  /test-only-|(^|\/)(tests?|test-support)\/|(fake|stub|simulated|file-notifier)[^/]*\.[jt]s$/.test(
    input,
  );

describe("the package of the scheduled jobs (016, E1)", () => {
  it("bundles the jobs, the SDK of SES and nothing of the tests", async () => {
    const { buildJobs } = await load();
    const { inputs } = await buildJobs(join(tmpdir(), "atlas-jobs"));
    expect(inputs).toContain("apps/jobs/src/lambda.ts");
    expect(inputs).toContain("apps/jobs/src/handler.ts");
    expect(inputs).toContain("packages/adapters/src/aws/sdk-ses.ts");
    expect(inputs.some((input) => input.startsWith("node_modules/@aws-sdk/client-sesv2/"))).toBe(
      true,
    );
    const ours = inputs.filter((input) => !input.startsWith("node_modules/"));
    expect(
      ours.filter(
        (input) =>
          !/^(apps\/jobs\/src|packages\/(domain|adapters)\/src|packages\/domain\/vendor)\//.test(
            input,
          ),
      ),
    ).toEqual([]);
    expect(
      ours.filter(
        (input) =>
          looksLikeDouble(input) && !(DECLARED_DOUBLES as readonly string[]).includes(input),
      ),
    ).toEqual([]);
    expect(ours.filter((input) => /^apps\/(api|cli|web)\/|(^|\/)dist[^/]*\//.test(input))).toEqual(
      [],
    );
  }, 60_000);

  it("is the same bytes twice, a ZIP with one entry that inflates to the bundle", async () => {
    const { buildJobs, zipOne } = await load();
    const first = await buildJobs(join(tmpdir(), "atlas-jobs-1"));
    const second = await buildJobs(join(tmpdir(), "atlas-jobs-2"));
    expect(Buffer.from(first.bundle).equals(Buffer.from(second.bundle))).toBe(true);
    const zip = zipOne("index.mjs", first.bundle);
    const nameLength = zip.readUInt16LE(26);
    const compressed = zip.readUInt32LE(18);
    expect(zip.subarray(30, 30 + nameLength).toString()).toBe("index.mjs");
    const data = zip.subarray(30 + nameLength, 30 + nameLength + compressed);
    expect(Buffer.from(inflateRawSync(data)).equals(Buffer.from(first.bundle))).toBe(true);
  }, 60_000);

  it("loads in Node and refuses to start without its configuration", async () => {
    const { buildJobs } = await load();
    const dir = await mkdtemp(join(tmpdir(), "atlas-jobs-run-"));
    const { bundle } = await buildJobs(dir);
    const file = join(dir, "index.mjs");
    await writeFile(file, bundle);
    const saved = Object.entries(process.env).filter(([name]) => name.startsWith("ATLAS_"));
    for (const [name] of saved) {
      delete process.env[name];
    }
    try {
      await expect(import(pathToFileURL(file).href)).rejects.toThrow("compose_failed");
    } finally {
      for (const [name, value] of saved) {
        process.env[name] = value;
      }
    }
  }, 60_000);
});
