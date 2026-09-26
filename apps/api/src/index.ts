// @atlas/api: the Lambda behind CloudFront under `/api/*` (feature 015).
// `createHandler` takes the narrow interfaces of S3 and SSM; the SDK plugs in
// only in the composition of production (`compose.ts`, `lambda.ts`), which
// the package of the Lambda bundles (`scripts/build-lambda.mjs`).

export type { FunctionUrlEvent, FunctionUrlResult } from "./event.js";
export { createHandler, type Handler, type HandlerDeps } from "./handler.js";
