// The package of the Lambda of the API (feature 015, E3; `docs/dependencies.md`,
// esbuild): `apps/api/src/lambda.ts` bundled by the common builder of the
// Lambdas (`scripts/lambda-package.mjs`, feature 016, P-H) into
// `apps/api/dist-lambda/lambda.zip`.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleLambda, forbiddenInput, zipOne } from "../../../scripts/lambda-package.mjs";

export { forbiddenInput, zipOne };

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Builds the bundle; answers the files, the inputs and the text of the bundle. */
export const buildLambda = (outDir) => bundleLambda("apps/api/src/lambda.ts", outDir);

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
