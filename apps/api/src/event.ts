// The event of a Lambda Function URL, payload format 2.0 (block 0 of E1,
// `specs/015-api-access/questions.md` §1.4: «The request and response event
// formats follow the same schema as the Amazon API Gateway payload format
// version 2.0»), and its answer. Normalised once: header names in lower case,
// cookies from `cookies` **and** from a `cookie` header if one came, the body
// decoded from base64 when it says so.

import { parseCookieHeader } from "@atlas/domain/access";

export interface FunctionUrlEvent {
  readonly version?: string;
  readonly rawPath: string;
  readonly rawQueryString?: string;
  readonly cookies?: readonly string[];
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly body?: string;
  readonly isBase64Encoded?: boolean;
  readonly requestContext: {
    readonly requestId?: string;
    readonly http: { readonly method: string };
  };
}

export interface FunctionUrlResult {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  /** Each becomes a `Set-Cookie`: «don't manually add set-cookie headers» (AWS). */
  readonly cookies?: string[];
  readonly body: string;
  readonly isBase64Encoded: false;
}

export interface Request {
  readonly requestId: string;
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: ReadonlyMap<string, string>;
  readonly cookies: readonly (readonly [string, string])[];
  readonly bodyBytes: number;
  /** The body as UTF-8 text; `undefined` when its bytes are not UTF-8. */
  readonly bodyText: string | undefined;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

export const normalise = (event: FunctionUrlEvent): Request => {
  const headers = new Map<string, string>();
  for (const [name, value] of Object.entries(event.headers ?? {})) {
    if (value !== undefined) {
      headers.set(name.toLowerCase(), value);
    }
  }
  const cookies = [
    ...(event.cookies ?? []).flatMap((cookie) => parseCookieHeader(cookie)),
    ...parseCookieHeader(headers.get("cookie") ?? ""),
  ];
  const bytes =
    event.body === undefined
      ? new Uint8Array()
      : Buffer.from(event.body, event.isBase64Encoded === true ? "base64" : "utf8");
  let bodyText: string | undefined;
  try {
    bodyText = utf8.decode(bytes);
  } catch {
    bodyText = undefined;
  }
  return {
    requestId: event.requestContext.requestId ?? "unknown",
    method: event.requestContext.http.method,
    path: event.rawPath,
    query: new URLSearchParams(event.rawQueryString ?? ""),
    headers,
    cookies,
    bodyBytes: bytes.length,
    bodyText,
  };
};
