// The entry of the Lambdas of the jobs (feature 016, E1): the composition of
// production with the SDK, at the top level, so a function that cannot be
// composed does not come up — and says only the name of why. One artefact for
// the five functions (§8.1 P4); `ATLAS_JOBS` says which tasks each one runs.
// Bundled with esbuild by `scripts/build-lambda.mjs`; nothing imports this file.

import { productionObjectStore, productionParameterStore } from "@atlas/adapters/aws-sdk";
import { productionMailSender } from "@atlas/adapters/aws-ses";
import { systemClock } from "@atlas/adapters/clock";
import { composeOrFail } from "./compose.js";

export const handler = composeOrFail(process.env, {
  objects: productionObjectStore,
  parameters: productionParameterStore,
  mail: productionMailSender,
  clock: systemClock,
  log: (line) => console.log(line),
});
