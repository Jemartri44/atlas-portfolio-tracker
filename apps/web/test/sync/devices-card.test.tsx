// @vitest-environment happy-dom
//
// Feature 015, E2, block 4: the devices of the console in Ajustes (ADR-0033,
// point 8; plan §4.2, T37 and T38): each token with its state and its last
// sync, the recent issues marked, the name escaped, and revoking one by one,
// through the `fetch` the card is given.

import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { DevicesCard } from "../../src/routes/ajustes/sync/DevicesCard.jsx";
import { readTokens, revokeToken } from "../../src/sync/devices.js";

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 20; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const ACTIVE = {
  token_id: "AAAAAAAAAAAAAAAAAAAAAA",
  device_id: "DDDDDDDDDDDDDDDDDDDDDD",
  device_name: "<img src=x onerror=alert(1)>",
  issued_at: "2026-10-01T10:00:00Z",
  expires_at: "2026-12-30T10:00:00Z",
  status: "active",
  last_sync_at: "2026-10-02T08:00:00Z",
  recent: true,
};
const REVOKED = {
  ...ACTIVE,
  token_id: "BBBBBBBBBBBBBBBBBBBBBB",
  device_name: "sobremesa",
  status: "revoked",
  revoked_at: "2026-10-03T09:00:00Z",
  recent: false,
  last_sync_at: undefined,
};

const api = (tokens: unknown[]) => {
  const calls: { method: string; url: string; init: RequestInit | undefined }[] = [];
  const request = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url: String(url), init });
    if (String(url) === "/api/devices/tokens") {
      return new Response(JSON.stringify({ tokens }), { status: 200 });
    }
    return new Response(JSON.stringify({ token_id: ACTIVE.token_id, revoked_at: "x" }), {
      status: 200,
    });
  }) as typeof fetch;
  return { request, calls };
};

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.innerHTML = "";
});

const show = async (request: typeof fetch): Promise<HTMLElement> => {
  const host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <DevicesCard request={request} />, host);
  await settle();
  return host;
};

describe("the client of the devices", () => {
  it("reads the list and revokes with the hash of the body, never following a redirect", async () => {
    const { request, calls } = api([ACTIVE]);
    expect(await readTokens(request)).toEqual({ kind: "list", tokens: [ACTIVE] });
    expect(await revokeToken(request, ACTIVE.token_id)).toBe("revoked");
    const post = calls.at(-1) as (typeof calls)[number];
    expect(post.url).toBe(`/api/devices/tokens/${ACTIVE.token_id}/revoke`);
    expect(post.init?.redirect).toBe("error");
    expect(post.init?.body).toBe("{}");
    const headers = post.init?.headers as Record<string, string>;
    expect(headers["x-amz-content-sha256"]).toBe(
      "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    );
  });

  it("tells the failures apart by their code", async () => {
    const refusing = (async () =>
      new Response(JSON.stringify({ error: { code: "unauthenticated", details: {} } }), {
        status: 401,
      })) as unknown as typeof fetch;
    expect(await readTokens(refusing)).toEqual({ kind: "failed", code: "unauthenticated" });
    const broken = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    expect(await readTokens(broken)).toEqual({ kind: "failed", code: "network_failed" });
    expect(await revokeToken(broken, ACTIVE.token_id)).toEqual({ code: "network_failed" });
    const odd = (async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch;
    expect(await readTokens(odd)).toEqual({ kind: "failed", code: "transport_rejected" });
  });
});

describe("DevicesCard", () => {
  it("lists each token with its state and last sync, the recent ones marked, the name as text", async () => {
    const host = await show(
      api([ACTIVE, REVOKED, { token_id: "broken", status: "unreadable" }]).request,
    );
    const text = host.textContent ?? "";
    expect(text).toContain("<img src=x onerror=alert(1)>");
    expect(host.querySelector("img")).toBeNull();
    expect(text).toContain("Activo");
    expect(text).toContain("Reciente");
    expect(text).toContain("Revocado");
    expect(text).toContain("Ilegible");
    expect(text).toContain("Última sincronización");
    expect(text).toContain("nunca");
    // Only the live one can be revoked.
    expect(host.querySelectorAll("button")).toHaveLength(1);
  });

  it("revokes one and reads the list again", async () => {
    const { request, calls } = api([ACTIVE]);
    const host = await show(request);
    (host.querySelector("button") as HTMLButtonElement).click();
    await settle();
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET /api/devices/tokens",
      `POST /api/devices/tokens/${ACTIVE.token_id}/revoke`,
      "GET /api/devices/tokens",
    ]);
  });
});
