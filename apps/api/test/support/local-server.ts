// TEST ONLY — the API and the web on one local origin, **without AWS and
// without Google** (plan §11), for the captures of the verifier. The handler
// is the real one, composed with the doubles of S3, SSM and Google; the web is
// the real `apps/web/dist`. Nothing of the product reaches this file
// (architecture test). Run from the scratchpad:
//
//   node apps/api/dist-test/apps/api/test/support/local-server.js --port 0 [--account allowed|stranger|unverified]
//
// It prints `http://127.0.0.1:<port>`. The fake provider lives under `/api/`
// (the service worker leaves those navigations alone) and shows three synthetic
// accounts to choose from, or chooses the one of `--account` by itself. Two
// hooks of the test move the world from outside, as an admin would:
// `/__test/forget-this-device?id=` and `/__test/advance?ms=` (the clock).

import { randomBytes } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { base64url } from "@atlas/adapters/access";
import { parameterNames } from "@atlas/adapters/aws";
import { createHandler } from "@atlas/api";
import type { ApiConfig } from "@atlas/domain/access";
import { TestOnlyFakeS3 } from "../../../../packages/adapters/test/aws/test-only-fake-s3.js";
import { TestOnlyFakeSsm } from "../../../../packages/adapters/test/aws/test-only-fake-ssm.js";
import {
  type FakeAccount,
  TestOnlyFakeGoogle,
} from "../../../../packages/adapters/test/identity/test-only-fake-google.js";

const ACCOUNTS: Record<string, FakeAccount> = {
  allowed: { sub: "108000000000000000001", email: "usuario@ejemplo.test" },
  stranger: { sub: "108000000000000000002", email: "otra@ejemplo.test" },
  unverified: {
    sub: "108000000000000000001",
    email: "usuario@ejemplo.test",
    email_verified: false,
  },
};

const argument = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
};

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../..");
const web = argument("web") ?? join(repo, "apps", "web", "dist");
const auto = argument("account");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = createServer();
server.listen(Number(argument("port") ?? 0), "127.0.0.1", () => {
  const { port } = server.address() as { port: number };
  const origin = `http://127.0.0.1:${port}`;
  let now = Date.now();
  const s3 = new TestOnlyFakeS3();
  const ssm = new TestOnlyFakeSsm();
  const names = parameterNames("/atlas/dev/");
  ssm.set(
    names.allowList,
    JSON.stringify({
      allow_list_format: 1,
      entries: [{ sub: ACCOUNTS.allowed?.sub, email: ACCOUNTS.allowed?.email }],
    }),
  );
  ssm.set(names.clientId, "local-client");
  ssm.set(names.clientSecret, "local-secret");
  ssm.set(names.sessionKey, base64url(randomBytes(32)));
  const google = new TestOnlyFakeGoogle(
    "local-secret",
    `${origin}/api/__fake-google/authorize`,
    () => Math.floor(now / 1000),
  );
  // An http origin only here: the parser of the real configuration refuses it.
  const config: ApiConfig = {
    env: "dev",
    ssmPrefix: "/atlas/dev/",
    origin,
    dataBucket: "local",
    sessionTtlSeconds: 28_800,
    loginTtlSeconds: 600,
    consoleCodeTtlSeconds: 300,
    tokenLifetimeDays: 90,
    recentIssueDays: 7,
    clockToleranceSeconds: 600,
    allowListCacheSeconds: 120,
    secretsCacheSeconds: 300,
  };
  const handler = createHandler({
    config,
    objects: s3,
    parameters: ssm,
    identity: google,
    now: () => new Date(now),
    random: (bytes) => randomBytes(bytes),
    log: (line) => process.stderr.write(`${line}\n`),
  });

  server.on("request", (request, response) => {
    const url = new URL(request.url ?? "/", origin);
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      void (async () => {
        if (url.pathname === "/api/__fake-google/authorize") {
          const choose = (name: string) => {
            const back = google.authorize(url.toString(), ACCOUNTS[name] as FakeAccount);
            response
              .writeHead(302, {
                location: `${back.redirectUri}?code=${back.code}&state=${back.state}`,
              })
              .end();
          };
          if (auto !== undefined) {
            return choose(auto);
          }
          const pick = url.searchParams.get("pick");
          if (pick !== null) {
            return choose(pick);
          }
          const links = Object.keys(ACCOUNTS)
            .map(
              (name) => `<li><a href="${url.pathname}${url.search}&pick=${name}">${name}</a></li>`,
            )
            .join("");
          response
            .writeHead(200, { "content-type": "text/html; charset=utf-8" })
            .end(`<h1>Proveedor de identidad falso</h1><ul>${links}</ul>`);
          return;
        }
        if (url.pathname === "/__test/advance") {
          now += Number(url.searchParams.get("ms") ?? 0);
          response.writeHead(204).end();
          return;
        }
        if (url.pathname === "/__test/forget-this-device") {
          const key = `sync/devices/${url.searchParams.get("id")}.json`;
          const current = s3.text(key);
          if (current !== undefined) {
            s3.seed(
              key,
              JSON.stringify({
                ...JSON.parse(current),
                state: "forgotten",
                forgotten_at: new Date(now).toISOString(),
              }),
            );
          }
          response.writeHead(204).end();
          return;
        }
        if (url.pathname.startsWith("/api/")) {
          const headers: Record<string, string> = {};
          for (const [name, value] of Object.entries(request.headers)) {
            if (typeof value === "string") headers[name] = value;
          }
          const result = await handler({
            version: "2.0",
            rawPath: url.pathname,
            rawQueryString: url.search.slice(1),
            headers,
            body: Buffer.concat(chunks).toString("utf8"),
            isBase64Encoded: false,
            requestContext: {
              requestId: `local-${Date.now()}`,
              http: { method: request.method ?? "GET" },
            },
          });
          // Over plain http on 127.0.0.1, Chromium keeps `Secure` cookies (questions.md §2).
          response
            .writeHead(result.statusCode, { ...result.headers, "set-cookie": result.cookies ?? [] })
            .end(result.body);
          return;
        }
        const file = join(web, url.pathname);
        const found =
          file.startsWith(web) && statSync(file, { throwIfNoEntry: false })?.isFile() === true
            ? file
            : join(web, "index.html");
        response
          .writeHead(200, { "content-type": TYPES[extname(found)] ?? "application/octet-stream" })
          .end(readFileSync(found));
      })();
    });
  });
  process.stdout.write(`${origin}\n`);
});
