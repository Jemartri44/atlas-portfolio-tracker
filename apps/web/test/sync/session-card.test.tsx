// @vitest-environment happy-dom
//
// The card «Sincronización» of Ajustes receives its `fetch` (T1 of the review
// of PR #90, round 2): the API it asks is the one it is given, never the
// global, which in the tests fails at once (`test/setup/no-network.ts`).

import { readWebDeviceId } from "@atlas/adapters/web-device";
import { render } from "solid-js/web";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../../packages/adapters/test/fake-idb.js";
import { SessionCard } from "../../src/routes/ajustes/sync/SessionCard.jsx";

const ID = "BBBBBBBBBBBBBBBBBBBBBB";

const holder = globalThis as { indexedDB?: unknown };
const before = holder.indexedDB;
let dispose: (() => void) | undefined;
beforeEach(() => {
  holder.indexedDB = new FakeIdbFactory();
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
});
afterAll(() => {
  holder.indexedDB = before;
});

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 20; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

/** An API that answers the session as signed in and the sign-out with a 204, and says what it was asked. */
const api = () => {
  const calls: string[] = [];
  const request = (async (url: string | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${String(url)}`);
    return String(url) === "/api/session"
      ? new Response(
          JSON.stringify({ signed_in: true, expires_at: "2026-10-01T18:00:00Z", device_id: ID }),
          { status: 200 },
        )
      : new Response(null, { status: 204 });
  }) as typeof fetch;
  return { request, calls };
};

describe("SessionCard", () => {
  it("asks the session of the API it is given, and adopts the device id it answers", async () => {
    const { request, calls } = api();
    const host = document.createElement("div");
    document.body.append(host);
    dispose = render(() => <SessionCard request={request} />, host);
    await settle();
    expect(host.textContent).toContain("iniciada, hasta el");
    expect(host.textContent).toContain(ID);
    expect(calls).toEqual(["GET /api/session"]);
    expect(await readWebDeviceId()).toBe(ID);
  });

  it("closes the session through the API it is given", async () => {
    const { request, calls } = api();
    const host = document.createElement("div");
    document.body.append(host);
    dispose = render(() => <SessionCard request={request} />, host);
    await settle();
    const close = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Cerrar sesión",
    );
    close?.click();
    await settle();
    expect(calls).toEqual(["GET /api/session", "POST /api/auth/logout", "GET /api/session"]);
    expect(host.textContent).not.toContain("No se ha podido cerrar la sesión");
  });

  it("without an API of its own, uses the global one — which, in a test, fails at once", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    dispose = render(() => <SessionCard />, host);
    await settle();
    expect(host.textContent).toContain("No hay conexión con la nube de Atlas.");
  });
});
