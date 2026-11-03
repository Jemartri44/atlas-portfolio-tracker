// @atlas/api: the Lambda behind CloudFront under `/api/*`.
// `createHandler` takes the narrow interfaces of S3 and SSM; the SDK plugs in
// only in the composition of production (`compose.ts`, `lambda.ts`), which
// the package of the Lambda bundles (`scripts/build-lambda.mjs`).

// What the Lambda reads from its environment: the infrastructure tests check Terraform against it.
export { API_CONFIG_VARIABLES, parseApiConfig } from "./access/config.js";
export type { FunctionUrlEvent, FunctionUrlResult } from "./event.js";
export { createHandler, type Handler, type HandlerDeps } from "./handler.js";
