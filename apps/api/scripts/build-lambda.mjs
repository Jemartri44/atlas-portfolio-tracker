// The package of the Lambda of the API (feature 015, E3; `docs/dependencies.md`,
// esbuild): one ESM file for Node 22 with the SDK inside, and a ZIP of it that
// is the same bytes for the same sources (a fixed date, one entry), so what is
// validated in dev is what is promoted to prod (CLAUDE.md, «Build once»).
//
// It bundles the **sources** of the workspaces (`src/*.ts`), never their
// `dist/`, and refuses the package if any input is a test, a double or
// `tests/`: nothing of the tests reaches production. The ZIP is written by a
// few lines of `node:zlib`, with no new package.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, "..");
const repoRoot = resolve(apiRoot, "..", "..");

/** `@atlas/<pkg>/<door>` to the source its `exports` point at (`./dist/x.js` → `./src/x.ts`). */
const workspaceSources = {
  name: "atlas-workspace-sources",
  setup(esbuild) {
    esbuild.onResolve({ filter: /^@atlas\/(domain|adapters)(\/.*)?$/ }, async (args) => {
      const [, pkg, door] = /^@atlas\/(domain|adapters)(\/.*)?$/.exec(args.path);
      const root = join(repoRoot, "packages", pkg);
      const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
      const entry = manifest.exports[door === undefined ? "." : `.${door}`];
      if (entry === undefined) {
        return { errors: [{ text: `${args.path} is not an export of @atlas/${pkg}` }] };
      }
      const source = entry.import.replace(/^\.\/dist\//, "./src/").replace(/\.js$/, ".ts");
      return { path: join(root, source) };
    });
  },
};

/**
 * What of ours must never be inside the package of the Lambda: a test, a
 * double, `tests/` or a compiled output (the sources are bundled, never a
 * `dist/`). The packages of `node_modules` ship their own `dist*`.
 */
export const forbiddenInput = (input) =>
  !input.startsWith("node_modules/") &&
  (/(^|\/)(tests?|test-support|dist[^/]*)\//.test(input) || /test-only-/.test(input));

/** Builds the bundle; answers the files, the inputs and the text of the bundle. */
export const buildLambda = async (outDir) => {
  const result = await build({
    entryPoints: [join(apiRoot, "src", "lambda.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    // The ESM builds of the SDK, so what is not used is left out.
    mainFields: ["module", "main"],
    write: false,
    metafile: true,
    outfile: join(outDir, "index.mjs"),
    legalComments: "none",
    // Some dependencies of the SDK still `require` Node's own modules.
    banner: {
      js: 'import { createRequire as __atlasRequire } from "node:module"; const require = __atlasRequire(import.meta.url);',
    },
    plugins: [workspaceSources],
    logLevel: "silent",
  });
  const inputs = Object.keys(result.metafile.inputs).map((input) =>
    relative(repoRoot, resolve(input)).replaceAll("\\", "/"),
  );
  const offenders = inputs.filter(forbiddenInput);
  if (offenders.length > 0) {
    throw new Error(`the Lambda would carry tests or doubles: ${offenders.join(", ")}`);
  }
  const [output] = result.outputFiles;
  return { inputs, bundle: output.contents };
};

const u16 = (value) => {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value);
  return out;
};
const u32 = (value) => {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value >>> 0);
  return out;
};

/** A ZIP with one entry, deflated, dated 1980-01-01 00:00: the same bytes for the same bundle. */
export const zipOne = (name, content) => {
  const data = deflateRawSync(content, { level: 9 });
  const fileName = Buffer.from(name, "utf8");
  const checksum = crc32(content);
  const common = [
    u16(20), // version needed
    u16(0), // flags
    u16(8), // deflate
    u16(0), // time 00:00
    u16(0x21), // date 1980-01-01
    u32(checksum),
    u32(data.length),
    u32(content.length),
    u16(fileName.length),
    u16(0), // extra
  ];
  const local = Buffer.concat([u32(0x04034b50), ...common, fileName, data]);
  const central = Buffer.concat([
    u32(0x02014b50),
    u16(0x0314), // made by: Unix, 2.0
    ...common,
    u16(0), // comment
    u16(0), // disk
    u16(0), // internal attributes
    u32((0o100644 << 16) >>> 0), // -rw-r--r--
    u32(0), // offset of the local header
    fileName,
  ]);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(1),
    u16(1),
    u32(central.length),
    u32(local.length),
    u16(0),
  ]);
  return Buffer.concat([local, central, end]);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = join(apiRoot, "dist-lambda");
  const { inputs, bundle } = await buildLambda(outDir);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "index.mjs"), bundle);
  await writeFile(join(outDir, "lambda.zip"), zipOne("index.mjs", bundle));
  console.log(
    `Lambda: ${bundle.length} bytes from ${inputs.length} inputs, apps/api/dist-lambda/lambda.zip`,
  );
}
