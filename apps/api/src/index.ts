// @atlas/api: the Lambda behind CloudFront under `/api/*` (feature 015).
// Without the AWS SDK installed (§7 P3, pending the user), there is no
// production composition yet: `createHandler` takes the narrow interfaces of
// S3 and SSM, and the SDK plugs in only there.

export type { FunctionUrlEvent, FunctionUrlResult } from "./event.js";
export { createHandler, type Handler, type HandlerDeps } from "./handler.js";
