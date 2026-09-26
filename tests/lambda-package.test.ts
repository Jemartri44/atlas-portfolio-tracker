// Feature 015, E3: the package of the Lambda (`apps/api/scripts/build-lambda.mjs`).
// It carries the SDK and the sources of the product, never a test, a double
// or `tests/`; it is the same bytes twice; and it is a module Node loads —
// up to the composition, which refuses to start without its configuration.

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(repoRoot, "apps", "api", "scripts", "build-lambda.mjs");

interface Script {
  buildLambda(outDir: string): Promise<{ inputs: string[]; bundle: Uint8Array }>;
  zipOne(name: string, content: Uint8Array): Buffer;
  forbiddenInput(input: string): boolean;
}

const load = async (): Promise<Script> => (await import(pathToFileURL(script).href)) as Script;

describe("the package of the Lambda (E3)", () => {
  it("bundles the product and the SDK, and nothing of the tests", async () => {
    const { buildLambda } = await load();
    const { inputs } = await buildLambda(join(tmpdir(), "atlas-lambda"));
    expect(inputs).toContain("apps/api/src/lambda.ts");
    expect(inputs).toContain("apps/api/src/handler.ts");
    expect(inputs).toContain("packages/adapters/src/aws/sdk-s3.ts");
    expect(inputs.some((input) => input.startsWith("node_modules/@aws-sdk/client-s3/"))).toBe(true);
    expect(inputs.some((input) => input.startsWith("node_modules/@aws-sdk/client-ssm/"))).toBe(
      true,
    );
    const ours = inputs.filter((input) => !input.startsWith("node_modules/"));
    expect(ours.filter((input) => /(^|\/)(tests?|dist[^/]*)\/|test-only-/.test(input))).toEqual([]);
    expect(
      ours.filter(
        (input) =>
          !/^(apps\/api\/src|packages\/(domain|adapters)\/src|packages\/domain\/vendor)\//.test(
            input,
          ),
      ),
    ).toEqual([]);
    expect(
      inputs.some((input) => input.startsWith("apps/web/") || input.startsWith("apps/cli/")),
    ).toBe(false);
  }, 60_000);

  it("refuses an input that is a test, a double or a compiled output", async () => {
    const { forbiddenInput } = await load();
    for (const input of [
      "tests/support/x.ts",
      "packages/adapters/test/aws/test-only-fake-s3.ts",
      "packages/domain/dist/index.js",
      "apps/api/dist-test/x.js",
    ]) {
      expect(forbiddenInput(input), input).toBe(true);
    }
    expect(forbiddenInput("packages/adapters/src/aws/sdk-s3.ts")).toBe(false);
    expect(forbiddenInput("node_modules/@aws-sdk/client-s3/dist-es/index.js")).toBe(false);
  });

  it("is the same bytes twice, a ZIP with one entry that inflates to the bundle", async () => {
    const { buildLambda, zipOne } = await load();
    const first = await buildLambda(join(tmpdir(), "atlas-lambda-1"));
    const second = await buildLambda(join(tmpdir(), "atlas-lambda-2"));
    expect(Buffer.from(first.bundle).equals(Buffer.from(second.bundle))).toBe(true);
    const zip = zipOne("index.mjs", first.bundle);
    expect(zip.equals(zipOne("index.mjs", second.bundle))).toBe(true);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const nameLength = zip.readUInt16LE(26);
    const compressed = zip.readUInt32LE(18);
    expect(zip.subarray(30, 30 + nameLength).toString()).toBe("index.mjs");
    const data = zip.subarray(30 + nameLength, 30 + nameLength + compressed);
    expect(Buffer.from(inflateRawSync(data)).equals(Buffer.from(first.bundle))).toBe(true);
  }, 60_000);

  it("loads in Node and refuses to start without its configuration", async () => {
    const { buildLambda } = await load();
    const dir = await mkdtemp(join(tmpdir(), "atlas-lambda-run-"));
    const { bundle } = await buildLambda(dir);
    const file = join(dir, "index.mjs");
    await writeFile(file, bundle);
    const saved = Object.entries(process.env).filter(([name]) => name.startsWith("ATLAS_"));
    for (const [name] of saved) {
      delete process.env[name];
    }
    try {
      // Only a generic error: the reason goes to the log by its name (review of PR #96, N2).
      await expect(import(pathToFileURL(file).href)).rejects.toThrow("compose_failed");
    } finally {
      for (const [name, value] of saved) {
        process.env[name] = value;
      }
    }
  }, 60_000);
});
