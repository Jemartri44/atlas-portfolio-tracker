import { readTokens, revokeToken } from "../../src/sync/devices.js";
import { readSession, signOut } from "../../src/sync/session.js";

/** Drives the web's callers of the API (but the boot, which has its own test) and reports how each asked. */
export const listCalls = async (): Promise<{ url: string; cache: RequestCache | undefined }[]> => {
  const calls: { url: string; cache: RequestCache | undefined }[] = [];
  const request = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), cache: init?.cache });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  await readSession(request);
  await signOut(request);
  await readTokens(request);
  await revokeToken(request, "AAAAAAAAAAAAAAAAAAAAAA");
  return calls;
};
