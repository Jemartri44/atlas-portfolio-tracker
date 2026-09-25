// The API composed with its test doubles, and a browser of one: a cookie jar
// that keeps what the API sets, so a sign-in can be walked end to end.

import { randomBytes } from "node:crypto";
import { base64url } from "@atlas/adapters/access";
import { parameterNames } from "@atlas/adapters/aws";
import { type ApiConfig, parseApiConfig } from "@atlas/domain/access";
import { TestOnlyFakeS3 } from "../../../packages/adapters/test/aws/test-only-fake-s3.js";
import { TestOnlyFakeSsm } from "../../../packages/adapters/test/aws/test-only-fake-ssm.js";
import {
  type FakeAccount,
  TestOnlyFakeGoogle,
} from "../../../packages/adapters/test/identity/test-only-fake-google.js";
import type { FunctionUrlEvent, FunctionUrlResult } from "../src/event.js";
import { createHandler, type HandlerDeps } from "../src/handler.js";

export const SELF = "https://atlas.example";
export const ALLOWED: FakeAccount = { sub: "108234567890123456789", email: "user@example.test" };
export const STRANGER: FakeAccount = {
  sub: "108999999999999999999",
  email: "someone@example.test",
};
export const SESSION_KEY = base64url(Buffer.alloc(32, 42));

export const CONFIG: ApiConfig = parseApiConfig({
  ATLAS_ENV: "dev",
  ATLAS_ORIGIN: SELF,
  ATLAS_DATA_BUCKET: "atlas-dev-data-test",
  ATLAS_SESSION_TTL_SECONDS: "28800",
  ATLAS_LOGIN_TTL_SECONDS: "600",
  ATLAS_CONSOLE_CODE_TTL_SECONDS: "300",
  ATLAS_TOKEN_LIFETIME_DAYS: "90",
  ATLAS_RECENT_ISSUE_DAYS: "7",
  ATLAS_CLOCK_TOLERANCE_SECONDS: "600",
  ATLAS_ALLOW_LIST_CACHE_SECONDS: "120",
  ATLAS_SECRETS_CACHE_SECONDS: "300",
});

export const NAMES = parameterNames(CONFIG.ssmPrefix);

export const allowListOf = (...accounts: FakeAccount[]): string =>
  JSON.stringify({
    allow_list_format: 1,
    entries: accounts.map(({ sub, email }) => ({ sub, email })),
  });

export interface CallOptions {
  readonly query?: Record<string, string>;
  readonly rawQuery?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly base64?: boolean;
  /** Extra cookies, besides the jar. */
  readonly cookies?: string[];
  readonly jar?: boolean;
}

/** `name=value` of each `Set-Cookie`, and whether it clears the cookie. */
export const setCookies = (result: FunctionUrlResult): Map<string, string> =>
  new Map(
    (result.cookies ?? []).map((cookie) => {
      const [pair] = cookie.split(";") as [string];
      const at = pair.indexOf("=");
      return [pair.slice(0, at), pair.slice(at + 1)];
    }),
  );

export const setup = (overrides: Partial<HandlerDeps> = {}) => {
  const s3 = new TestOnlyFakeS3();
  const ssm = new TestOnlyFakeSsm();
  ssm.set(NAMES.allowList, allowListOf(ALLOWED));
  ssm.set(NAMES.clientId, "client-dev");
  ssm.set(NAMES.clientSecret, "secret-dev");
  ssm.set(NAMES.sessionKey, SESSION_KEY);
  let now = Date.UTC(2026, 9, 1, 10, 0, 0);
  const google = new TestOnlyFakeGoogle("secret-dev", undefined, () => Math.floor(now / 1000));
  const logs: string[] = [];
  const handler = createHandler({
    config: CONFIG,
    objects: s3,
    parameters: ssm,
    identity: google,
    now: () => new Date(now),
    random: (bytes) => randomBytes(bytes),
    log: (line) => logs.push(line),
    ...overrides,
  });
  const jar = new Map<string, string>();
  let counter = 0;

  const call = async (
    method: string,
    path: string,
    options: CallOptions = {},
  ): Promise<FunctionUrlResult> => {
    counter += 1;
    const rawQueryString = options.rawQuery ?? new URLSearchParams(options.query ?? {}).toString();
    const cookies = [
      ...(options.jar === false ? [] : [...jar].map(([name, value]) => `${name}=${value}`)),
      ...(options.cookies ?? []),
    ];
    const event: FunctionUrlEvent = {
      version: "2.0",
      rawPath: path,
      rawQueryString,
      ...(cookies.length > 0 ? { cookies } : {}),
      headers: options.headers ?? {},
      ...(options.body === undefined ? {} : { body: options.body }),
      isBase64Encoded: options.base64 === true,
      requestContext: { requestId: `req-${counter}`, http: { method } },
    };
    const result = await handler(event);
    for (const [name, value] of setCookies(result)) {
      if (value === "") {
        jar.delete(name);
      } else {
        jar.set(name, value);
      }
    }
    return result;
  };

  /** A whole sign-in of the web: start, the user chooses `account` at the provider, the return. */
  const signIn = async (account: FakeAccount = ALLOWED, deviceId?: string) => {
    const start = await call(
      "GET",
      "/api/auth/login",
      deviceId === undefined ? {} : { query: { device_id: deviceId } },
    );
    const back = google.authorize(start.headers.location as string, account);
    const done = await call("GET", "/api/auth/callback", {
      query: { code: back.code, state: back.state },
    });
    return { start, back, done };
  };

  const session = () => jar.get("__Host-atlas_session");

  return {
    s3,
    ssm,
    google,
    logs,
    jar,
    call,
    signIn,
    session,
    advance: (ms: number) => {
      now += ms;
    },
    nowMs: () => now,
  };
};

export const errorOf = (
  result: FunctionUrlResult,
): { code: string; details: Record<string, unknown> } =>
  (JSON.parse(result.body) as { error: { code: string; details: Record<string, unknown> } }).error;
