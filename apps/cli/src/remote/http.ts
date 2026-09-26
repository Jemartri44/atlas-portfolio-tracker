// The console talking to the API (ADR-0033, point 4; `docs/api.md` §1 and
// §4): **only to the origin the token is for, only over HTTPS, and never
// following a redirect** (`redirect: "error"`), so the token cannot leave
// towards another origin. Every POST carries `x-amz-content-sha256` over the
// exact bytes of its body. The token travels only in its header.

import { createHash } from "node:crypto";
import { DEVICE_TOKEN_HEADER, isHttpsOrigin } from "@atlas/domain/access";

export type ApiAnswer =
  | { readonly ok: true; readonly body: Record<string, unknown> }
  | { readonly ok: false; readonly code: string };

/** Posts JSON to a route of the origin; the answer's error code, or `transport_rejected`/`network_failed`. */
export const postJson = async (
  fetcher: typeof fetch,
  origin: string,
  path: string,
  body: unknown,
  token?: string,
): Promise<ApiAnswer> => {
  if (!isHttpsOrigin(origin)) {
    // Checked before any request: a token never travels over plain HTTP.
    throw new RangeError("the origin of the API is https:// and a host");
  }
  const text = JSON.stringify(body);
  let response: Response;
  try {
    response = await fetcher(`${origin}${path}`, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        "x-amz-content-sha256": createHash("sha256").update(text, "utf8").digest("hex"),
        ...(token === undefined ? {} : { [DEVICE_TOKEN_HEADER]: token }),
      },
      body: text,
    });
  } catch {
    return { ok: false, code: "network_failed" };
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return { ok: false, code: "transport_rejected" };
  }
  if (response.status === 200 && typeof parsed === "object" && parsed !== null) {
    return { ok: true, body: parsed as Record<string, unknown> };
  }
  const code = (parsed as { error?: { code?: unknown } } | null)?.error?.code;
  return { ok: false, code: typeof code === "string" ? code : "transport_rejected" };
};
