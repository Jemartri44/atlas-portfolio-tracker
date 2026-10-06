// @vitest-environment happy-dom
//
// Feature 022 (ADR-0035, E2a): the web boots from the session and the ledger of
// the cloud. Over the real handler with the doubles of S3, SSM and Google
// (`api-support.ts`); only the network is scripted. What is under test is the
// order (session, ledger, projection), the four stops (no session, no
// connection, failed read, nothing shown) and that nothing is cached.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { futureLine } from "../../../../packages/adapters/test/fixtures.js";
import { allowListOf, NAMES } from "../../../api/test/harness.js";
import { bootCloud, watchConnection } from "../../src/ledger/cloud.js";
import { store } from "../../src/ledger/state.js";
import { goldenText } from "../helpers/golden.js";
import { press, showInShell, text, until } from "../helpers/render.jsx";
import { apiAt, sameOrigin, signedIn } from "./api-support.js";

const LEDGER = "ledger/ledger.jsonl";

interface Net {
  /** No connection at all: every request fails before leaving. */
  down: boolean;
  /** The cookie the browser holds, if any. */
  cookie: string | undefined;
  /** The next read of the ledger waits for this, then answers as `ledgerStatus` says. */
  hold?: Promise<void> | undefined;
  /** Answers the ledger with this status instead of serving it. */
  ledgerStatus?: number | undefined;
}

const rig = async (ledger: string = goldenText(), signed = true) => {
  const api = apiAt();
  api.s3.seed(LEDGER, ledger);
  const net: Net = { down: false, cookie: signed ? (await signedIn(api)).cookie : undefined };
  const asked: { url: string; init: RequestInit | undefined }[] = [];
  const through = sameOrigin(api, () => net.cookie);
  const request = (async (input: string | URL | Request, init?: RequestInit) => {
    asked.push({ url: String(input), init });
    if (net.down) {
      throw new TypeError("network down");
    }
    if (net.hold !== undefined && String(input) === "/api/ledger") {
      const wait = net.hold;
      net.hold = undefined;
      const status = net.ledgerStatus;
      net.ledgerStatus = undefined;
      await wait;
      if (status !== undefined) {
        return new Response(
          JSON.stringify({ error: { code: "remote_unavailable", details: {} } }),
          {
            status,
          },
        );
      }
    } else if (net.ledgerStatus !== undefined && String(input) === "/api/ledger") {
      return new Response(JSON.stringify({ error: { code: "remote_unavailable", details: {} } }), {
        status: net.ledgerStatus,
      });
    }
    return through(input, init);
  }) as typeof fetch;
  return { api, net, asked, request };
};

/** A screen that would show data: if the gate lets it through, its text is in the page. */
const Probe = () => <p>{`eventos:${store.snapshot()?.events.length ?? "ninguno"}`}</p>;

const shown = async () => showInShell("/", { "*": Probe });

// Every `watchConnection` of a test is removed at its end (M4 of the review).
const watchers: (() => void)[] = [];
const watching = (request: typeof fetch): void => {
  watchers.push(watchConnection(request));
};

beforeEach(() => {
  store.setLoad({ phase: "loading" });
});
afterEach(() => {
  for (const stop of watchers.splice(0)) {
    stop();
  }
  store.setDeps(undefined);
  store.setLoad({ phase: "loading" });
  document.body.innerHTML = "";
});

describe("cloud boot", () => {
  it("reads the session, then the ledger, and projects it once", async () => {
    const { request, asked } = await rig();
    const host = await shown();
    await bootCloud(request);
    await until(() => store.load().phase === "ready", "the ledger loaded");
    const phase = store.load();
    expect(phase.phase === "ready" && phase.source.kind).toBe("cloud");
    expect(store.snapshot()?.events.length).toBe(200);
    // The boot is the session and then the ledger; the frame's counter of drafts
    // asks for them once the ledger is there, and nothing else is asked.
    const urls = asked.map((call) => call.url);
    expect(urls.slice(0, 2)).toEqual(["/api/session", "/api/ledger"]);
    expect(urls.slice(2).every((url) => url === "/api/drafts")).toBe(true);
    expect(text(host)).toContain("eventos:200");
  });

  it("asks every request with `no-store` and names no device (ADR-0035, E4)", async () => {
    const { request, asked } = await rig();
    await bootCloud(request);
    expect(asked.length).toBeGreaterThan(0);
    for (const call of asked) {
      expect(call.init?.cache, call.url).toBe("no-store");
      expect(call.init?.redirect, call.url).toBe("error");
    }
    const ledger = asked.find((call) => call.url === "/api/ledger");
    expect(ledger).toBeDefined();
    expect(new Headers(ledger?.init?.headers).has("x-atlas-expected-device")).toBe(false);
  });

  it("with no session shows only the way in, and no data", async () => {
    const { request, asked } = await rig(goldenText(), false);
    const host = await shown();
    await bootCloud(request);
    await until(() => text(host).includes("Entrar con Google"), "the sign-in");
    expect(store.load()).toEqual({ phase: "signed_out", reason: "signed_out" });
    // A button that navigates by itself: a router link would show the unknown screen.
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);
    await press(host, "Entrar con Google");
    expect(assign).toHaveBeenCalledWith("/api/auth/login");
    assign.mockRestore();
    expect(text(host)).not.toContain("eventos:");
    expect(host.querySelector("nav")).toBeNull();
    // The ledger was never asked for.
    expect(asked.map((call) => call.url)).toEqual(["/api/session"]);
  });

  it.each([["a cookie the API does not accept", "expired", "ha caducado"]])(
    "says why when %s",
    async (_what, reason, sentence) => {
      const { request, net } = await rig();
      net.cookie = "not-a-session";
      const host = await shown();
      await bootCloud(request);
      await until(() => text(host).includes("Entrar con Google"), "the sign-in");
      expect(store.load()).toEqual({ phase: "signed_out", reason });
      expect(text(host)).toContain(sentence);
    },
  );

  it("a session whose account left the allow-list is said, and nothing is read", async () => {
    const { request, api, asked } = await rig();
    api.ssm.set(NAMES.allowList, allowListOf());
    api.advance(60 * 60 * 1000);
    const host = await shown();
    await bootCloud(request);
    await until(() => text(host).includes("Entrar con Google"), "the sign-in");
    expect(store.load()).toEqual({ phase: "signed_out", reason: "not_allowed" });
    expect(text(host)).toContain("no tiene acceso");
    expect(asked.map((call) => call.url)).toEqual(["/api/session"]);
  });

  it("without connection shows «Sin conexión», no data and no form", async () => {
    const { request, net } = await rig();
    net.down = true;
    const host = await shown();
    await bootCloud(request);
    await until(() => text(host).includes("Sin conexión"), "the offline screen");
    expect(store.load()).toEqual({ phase: "offline" });
    expect(text(host)).toContain("Reintentar");
    expect(text(host)).not.toContain("eventos:");
    expect(host.querySelector("nav")).toBeNull();
    expect(host.querySelector("form, input")).toBeNull();
  });

  it("«Reintentar» reads everything again, and the connection coming back does too", async () => {
    const { request, net, asked } = await rig();
    net.down = true;
    const host = await shown();
    watching(request);
    await bootCloud(request);
    await until(() => text(host).includes("Sin conexión"), "the offline screen");

    net.down = false;
    window.dispatchEvent(new Event("online"));
    await until(() => store.load().phase === "ready", "the ledger read again");
    await until(() => text(host).includes("eventos:200"), "the data back");
    // Session and ledger were asked for again, not kept from before.
    expect(asked.filter((call) => call.url === "/api/ledger").length).toBe(1);
  });

  it("the button «Reintentar» reads the session and the ledger again", async () => {
    const { request, net } = await rig();
    net.down = true;
    const host = await shown();
    await bootCloud(request);
    await until(() => text(host).includes("Sin conexión"), "the offline screen");

    net.down = false;
    const page = globalThis.fetch;
    globalThis.fetch = request;
    try {
      await press(host, "Reintentar");
      await until(() => text(host).includes("eventos:200"), "the data after the button");
    } finally {
      globalThis.fetch = page;
    }
  });

  it("losing the connection with the application open hides the data at once", async () => {
    const { request } = await rig();
    const host = await shown();
    watching(request);
    await bootCloud(request);
    await until(() => text(host).includes("eventos:200"), "the data");

    window.dispatchEvent(new Event("offline"));
    await until(() => text(host).includes("Sin conexión"), "the offline screen");
    expect(store.snapshot()).toBeUndefined();
    expect(store.deps()).toBeUndefined();
    expect(text(host)).not.toContain("eventos:");
  });

  it("a ledger that arrives while the device went offline is not shown", async () => {
    const { request } = await rig();
    const host = await shown();
    const navigatorOnline = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    try {
      await bootCloud(request);
      await until(() => text(host).includes("Sin conexión"), "the offline screen");
      expect(store.snapshot()).toBeUndefined();
    } finally {
      if (navigatorOnline === undefined) {
        Reflect.deleteProperty(window.navigator, "onLine");
      } else {
        Object.defineProperty(window.navigator, "onLine", navigatorOnline);
      }
    }
  });

  it("an old boot never overwrites a newer one: offline then back, with a read in flight", async () => {
    const { request, net } = await rig();
    const host = await shown();
    watching(request);
    let release: () => void = () => undefined;
    net.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    net.ledgerStatus = 503;
    const old = bootCloud(request);
    await until(() => net.hold === undefined, "the old read in flight");
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    await until(() => text(host).includes("eventos:200"), "the newer boot ready");
    release();
    await old;
    // The old read ended in a failure; it must not replace what the newer boot shows.
    expect(store.load().phase).toBe("ready");
    expect(text(host)).toContain("eventos:200");
  });

  it("an old read that succeeds after going offline does not bring the data back", async () => {
    const { request, net } = await rig();
    const host = await shown();
    watching(request);
    let release: () => void = () => undefined;
    net.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const old = bootCloud(request);
    await until(() => net.hold === undefined, "the read in flight");
    window.dispatchEvent(new Event("offline"));
    await until(() => text(host).includes("Sin conexión"), "the offline screen");
    release();
    await old;
    expect(store.load()).toEqual({ phase: "offline" });
    expect(text(host)).not.toContain("eventos:");
  });

  it("a failed read says so and offers to retry; nothing partial is shown", async () => {
    const { request, net } = await rig();
    net.ledgerStatus = 503;
    const host = await shown();
    await bootCloud(request);
    await until(() => text(host).includes("No se han podido leer tus datos"), "the failure");
    expect(store.load().phase).toBe("cloud_failed");
    expect(text(host)).toContain("Reintentar");
    expect(text(host)).not.toContain("eventos:");

    net.ledgerStatus = undefined;
    await bootCloud(request);
    await until(() => text(host).includes("eventos:200"), "the data after retrying");
  });

  it("a ledger newer than this application is refused with its own sentence", async () => {
    const { request } = await rig(`${futureLine()}\n`);
    const host = await shown();
    await bootCloud(request);
    await until(() => store.load().phase === "cloud_failed", "the refusal");
    expect(text(host)).toContain("No se han podido leer tus datos");
    expect(text(host)).not.toContain("eventos:");
  });

  it("an API that does not answer as it should is a failure, not an empty ledger", async () => {
    const request = (async () => new Response("<html>", { status: 200 })) as typeof fetch;
    await bootCloud(request);
    expect(store.load().phase).toBe("cloud_failed");
  });
});
