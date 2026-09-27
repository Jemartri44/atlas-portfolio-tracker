// The package of the scheduled jobs (feature 016, E1; §8.1 P4): one artefact
// for the five functions, `apps/jobs/src/lambda.ts` bundled by the common builder of the
// Lambdas (`scripts/lambda-package.mjs`, feature 016, P-H) into
// `apps/jobs/dist-lambda/jobs.zip`.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleLambda, forbiddenInput, zipOne } from "../../../scripts/lambda-package.mjs";

export { forbiddenInput, zipOne };

const jobsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Builds the bundle; answers the files, the inputs and the text of the bundle. */
export const buildJobs = (outDir) => bundleLambda("apps/jobs/src/lambda.ts", outDir);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = join(jobsRoot, "dist-lambda");
  const { inputs, bundle } = await buildJobs(outDir);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "index.mjs"), bundle);
  await writeFile(join(outDir, "jobs.zip"), zipOne("index.mjs", bundle));
  console.log(
    `Jobs: ${bundle.length} bytes from ${inputs.length} inputs, apps/jobs/dist-lambda/jobs.zip`,
  );
}
