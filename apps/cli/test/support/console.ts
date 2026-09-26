// The console of the tests of feature 015 (E2 and E3): `atlas` run with the
// API composed with its doubles of Google, SSM and S3 (`apps/api/test/harness.ts`)
// as its network. The browser of the user is a function that walks the start,
// the provider and the return; the loopback is a real socket on 127.0.0.1.

import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileLedgerStore } from "@atlas/adapters";
import type { UseCaseDeps } from "@atlas/domain";
import { ALLOWED, SELF, setup } from "../../../api/test/harness.js";
import type { Io } from "../../src/context.js";
import { run } from "../../src/main.js";
import type { RemoteEnvironment } from "../../src/remote/environment.js";

export type Api = ReturnType<typeof setup>;

export interface Seen {
  readonly url: string;
  readonly redirect: RequestInit["redirect"];
  readonly token: string | null;
}

/** What a test changes in the answers of the API or around the browser. */
export interface Hooks {
  tamper?: (path: string, body: string) => string;
  onOpen?: (() => Promise<void>) | undefined;
}

/**
 * The console's `fetch`, answered by the handler: a body of bytes travels as
 * its text, an answer in base64 as its bytes, and a redirect with
 * `redirect: "error"` throws, as fetch does.
 */
export const consoleFetch = (api: Api, seen: Seen[], hooks: Hooks = {}): typeof fetch =>
  (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    seen.push({
      url: url.href,
      redirect: init?.redirect,
      token: headers.get("x-atlas-device-token"),
    });
    if (url.origin !== SELF) {
      throw new TypeError("fetch failed");
    }
    const result = await api.call(init?.method ?? "GET", url.pathname, {
      headers: Object.fromEntries(headers),
      ...(init?.body === undefined || init.body === null
        ? {}
        : {
            body:
              typeof init.body === "string"
                ? init.body
                : new TextDecoder().decode(init.body as Uint8Array),
          }),
      jar: false,
    });
    if (result.statusCode === 302 && init?.redirect === "error") {
      throw new TypeError("redirect mode is set to error");
    }
    const text = hooks.tamper === undefined ? result.body : hooks.tamper(url.pathname, result.body);
    const body =
      result.statusCode === 304 || result.statusCode === 204
        ? null
        : result.isBase64Encoded
          ? Buffer.from(text, "base64")
          : text;
    return new Response(body, { status: result.statusCode, headers: result.headers });
  }) as typeof fetch;

/** The browser of the user: the start, Google, the return, and then wherever it says. */
export const browser = (
  api: Api,
  options: { wrongStateFirst?: boolean; confirmReissue?: boolean } = {},
) => {
  const pages: string[] = [];
  const open = (url: string): void => {
    void (async () => {
      const start = new URL(url);
      const first = await api.call("GET", start.pathname, { rawQuery: start.search.slice(1) });
      const back = api.google.authorize(first.headers.location as string, ALLOWED);
      const done = await api.call("GET", "/api/auth/callback", {
        query: { code: back.code, state: back.state },
      });
      pages.push(done.body);
      let target = done.headers.location;
      if (target === undefined && options.confirmReissue === true) {
        target = /<a href="([^"]+)"/.exec(done.body)?.[1]?.replaceAll("&amp;", "&");
      }
      if (target === undefined) {
        return;
      }
      if (options.wrongStateFirst === true) {
        const wrong = new URL(target);
        wrong.searchParams.set("state", "x".repeat(43));
        const refused = await fetch(wrong);
        pages.push(`wrong:${refused.status}`);
      }
      const landed = await fetch(target);
      pages.push(`landed:${landed.status}:${landed.headers.get("referrer-policy")}`);
    })();
  };
  return { open, pages };
};

export const folderTree = async (dir: string): Promise<string[]> =>
  (await readdir(dir, { recursive: true })).map(String).sort();

/** A console under test: its folders, what it said, and the API it talks to. */
export interface ConsoleUnderTest {
  readonly hooks: Hooks;
  readonly api: Api;
  readonly root: string;
  readonly ledger: string;
  readonly config: string;
  readonly credentials: string;
  // biome-ignore lint/suspicious/noExplicitAny: the credentials file as the test reads it back
  readonly readCredentialsFile: () => Promise<any>;
  readonly seen: Seen[];
  readonly out: string[];
  readonly err: string[];
  readonly surf: ReturnType<typeof browser>;
  readonly exec: (argv: string[]) => Promise<number>;
  readonly remote: RemoteEnvironment;
}

export const setupConsole = async (
  options: Parameters<typeof browser>[1] = {},
  /** Another console's API: two consoles over one remote. */
  shared?: Api,
): Promise<ConsoleUnderTest> => {
  const api = shared ?? setup();
  const root = await mkdtemp(join(tmpdir(), "atlas-remote-015-"));
  const ledger = join(root, "libro");
  const config = join(root, "config");
  await mkdir(ledger);
  const seen: Seen[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const surf = browser(api, options);
  const hooks: Hooks = {};
  let hidden = "";
  const remote: RemoteEnvironment = {
    fetch: consoleFetch(api, seen, hooks),
    env: { XDG_CONFIG_HOME: config },
    home: root,
    hostname: "portatil",
    openBrowser: (url) => {
      void (async () => {
        await hooks.onOpen?.();
        surf.open(url);
      })();
    },
    readHidden: async () => {
      // The manual page is open: the user copies the code shown after confirming.
      for (let i = 0; i < 50 && surf.pages.length === 0; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      hidden = String(
        /<\/summary>[\s\S]*<code>([\s\S]+?)<\/code>/.exec(surf.pages[0] as string)?.[1],
      ).replaceAll("<wbr>", "");
      return hidden;
    },
    loopbackTimeoutMs: 5000,
  };
  const io: Io = {
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    confirm: async () => undefined,
  };
  const deps = (): UseCaseDeps => ({
    store: new FileLedgerStore(join(ledger, "ledger.jsonl")),
    clock: { now: () => new Date(api.nowMs()) },
    random: (target) => target.fill(7),
  });
  const exec = (argv: string[]) =>
    run(
      ["--ledger", join(ledger, "ledger.jsonl"), ...argv],
      io,
      deps,
      undefined,
      undefined,
      remote,
    );
  const credentials = join(config, "atlas", "credentials.json");
  const readCredentialsFile = async () => JSON.parse(await readFile(credentials, "utf8"));
  return {
    hooks,
    api,
    root,
    ledger,
    config,
    credentials,
    readCredentialsFile,
    seen,
    out,
    err,
    surf,
    exec,
    remote,
  };
};

export const writeRemoteJson = (ledger: string, deviceId: string) =>
  mkdir(join(ledger, "sync"), { recursive: true }).then(() =>
    writeFile(
      join(ledger, "sync", "remote.json"),
      `{"format":1,"origin":"${SELF}","device_id":"${deviceId}"}\n`,
    ),
  );
