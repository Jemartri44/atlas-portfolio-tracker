// What a route answered, with the code and reason its log line carries —
// never anything else (`log.ts`).

import type { ApiRefusal } from "@atlas/domain/access";
import type { FunctionUrlResult } from "./event.js";
import { refused } from "./respond.js";

export interface Outcome {
  readonly result: FunctionUrlResult;
  readonly code?: string;
  readonly reason?: string;
  readonly dependency?: string;
  /** The public id of a token (ADR-0033, point 10): the most a log may say of one. */
  readonly tokenId?: string;
}

export const fail = (value: ApiRefusal): Outcome => ({
  result: refused(value),
  code: value.code,
  ...(typeof value.details.reason === "string" ? { reason: value.details.reason } : {}),
});
