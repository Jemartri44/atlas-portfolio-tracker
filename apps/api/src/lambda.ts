// The entry of the Lambda (feature 015, E3): the composition of production
// with the SDK, awaited at the top level, so the Lambda does not come up if
// it cannot be composed (`compose.ts`) — and says only the name of why. Bundled with esbuild by
// `scripts/build-lambda.mjs`; nothing imports this file.

import { productionObjectStore, productionParameterStore } from "@atlas/adapters/aws-sdk";
import { composeOrFail } from "./compose.js";

export const handler = await composeOrFail(process.env, {
  objects: productionObjectStore,
  parameters: productionParameterStore,
  fetch: globalThis.fetch,
  log: (line) => console.log(line),
});
