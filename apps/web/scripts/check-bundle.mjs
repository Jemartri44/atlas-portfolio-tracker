// Runs inside `npm run build -w @atlas/web`. Four things the bundle must never
// do, checked on the real output instead of trusted (prompt §3.2 and §3.10):
//
// 1. No `node:` builtin: importing the browser store must not drag in node:fs
//    through the adapters barrel (ADR-0019).
// 2. No request to a foreign origin: no remote font, icon, script or analytics
//    (constitution, security).
// 3. No inline style: production serves `style-src 'self'` with no
//    unsafe-inline, and CSP 3 governs a `style=` attribute through
//    `style-src-attr`, which falls back to it. Chromium blocked twenty-two of
//    them in the review, and the only visible symptom was an icon painted at
//    the wrong size — so it is checked here and not left to the eye. Solid
//    compiles a static `style={{…}}` into the HTML of its templates, which live
//    inside the `.js`, so the `.js` is scanned too.
// 4. Nothing the web must not reach, read on the **real graph** of the bundle
//    (round 2 of the review of PR #90): the modules Rolldown put in each
//    chunk, which `vite.config.ts` writes to `dist/.vite/atlas-modules.json`.
//    This is the authoritative guard; the static ones of
//    `tests/architecture/api.test.ts` are the quick warning.
// 5. Size within budget, printed so plan.md can record the measured value.
//    **Two** budgets since feature 007, because the two answer different
//    questions and only one of them is felt on a phone: what the browser has to
//    download **to boot** (what index.html preloads), and the total of
//    everything it may end up downloading. Until then this file said it measured
//    the boot and actually summed all of `dist`, lazily loaded chunks included —
//    so vendoring uPlot, which is only ever loaded by two screens, would have
//    failed the build without the boot path growing by a byte (Q6).

import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(webRoot, "dist");

/**
 * Ceiling of what the browser downloads before the first screen paints (the
 * assets `index.html` pulls): JS + CSS, gzip. It follows what is measured plus
 * a margin of a few tens of bytes, so a growth shows up in the diff that
 * causes it; raise it only with the commit that needs it.
 */
const BOOT_BUDGET_GZIP_BYTES = 70_600;

/**
 * Ceilings of what the browser downloads **on demand**, one per area (JS + CSS,
 * gzip), with the same discipline as the boot ceiling. They used to be one
 * line for the whole lazy part, and every pull request that touched the web
 * or the domain edited that same number, so each one collided with the rest;
 * now a change edits the line of the area it grew, and the failure says which
 * area did.
 *
 * A lazy chunk belongs to the first area, in this order, that owns one of the
 * modules its source map names; `resto` owns whatever is left, the stylesheets
 * included. The boot assets are the boot ceiling's, not these.
 */
const LAZY_AREAS = [
  {
    name: "fiscal",
    what: "la declaración y los modelos informativos",
    owns: [
      "/packages/domain/src/tax/",
      "/packages/domain/src/informative/",
      "/packages/domain/src/filings/",
      "/src/routes/fiscal/",
      "/src/view-models/fiscal/",
      "/src/format/criteria",
    ],
    budget: 41_550,
  },
  {
    name: "formularios",
    what: "los formularios de registro",
    owns: ["/src/routes/registrar/", "/src/view-models/forms/", "/src/view-models/preview"],
    budget: 25_610,
  },
  { name: "resto", what: "todo lo demás que se carga en diferido", owns: [], budget: 169_270 },
];

/**
 * Walls set by the direction that no ceiling above may pass: a ceiling raised
 * over its wall does not build green, and raising a wall is the direction's
 * decision, not a commit of an improvement. The total wall limits the **sum**
 * of the boot ceiling and the ceilings of the areas.
 */
const BOOT_AUTHORISED_GZIP_BYTES = 76_069;
const TOTAL_AUTHORISED_GZIP_BYTES = 500_000;

/**
 * Absolute URLs allowed in the output, one by one and with their reason. None
 * of them is ever requested: they are identifiers or text inside a message.
 * Anything else fails the build, which is the point — a new foreign URL has to
 * be looked at, not waved through by a wildcard.
 */
const ALLOWED_URLS = [
  { url: "http://www.w3.org", reason: "namespace de SVG/XML, un identificador, no se descarga" },
  { url: "https://www.w3.org", reason: "idem, en su forma https" },
  {
    url: "https://bit.ly",
    reason:
      "cadena dentro de un console.warn de Workbox (“Learn more at…”); no hay ninguna petición",
  },
  {
    url: "http://sr",
    reason: "centinela inerte de @solidjs/router: base de un new URL(), nunca se pide",
  },
  {
    url: "https://action",
    reason: "centinela inerte de @solidjs/router para las server actions; no hay servidor",
  },
  {
    url: "https://www.boe.es",
    reason:
      "la fuente de las casillas del Modelo 100: el BOE donde se comprobó cada número y cada rótulo (feature 010, bloque 2). Es una **cita**, no una petición: `BoxesCard` la imprime como texto bajo el título de cada bloque —nunca como enlace, así que el navegador no pide nada a ese origen— y `apps/web/test/fiscal-boxes.test.ts` comprueba que se enseña",
  },
];

/**
 * An inline style, in either of its two forms: the attribute on an element and
 * the `<style>` element. Both need `unsafe-inline` to work, which production
 * does not grant.
 */
const INLINE_STYLES = [
  { pattern: /<[a-zA-Z][^<>]*\sstyle\s*=/g, what: "un atributo style=" },
  { pattern: /<style[\s>]/g, what: "un elemento <style>" },
];

/**
 * A `data:` URL whose MIME type is code: `video/mp2t` is what `.ts` gets (the
 * MPEG transport stream shares the extension), and every JavaScript,
 * ECMAScript, TypeScript or JSX type, with or without `x-`.
 */
const CODE_MIME =
  /^(?:video\/mp2t|(?:text|application)\/(?:x-)?(?:javascript|ecmascript|typescript|jsx|tsx|babel)|text\/jsx|application\/node)$/;

/** Every `data:` URL with its MIME type; which of them is code is decided with the graph. */
const DATA_URL = /data:([a-z]+\/[a-z0-9.+-]+)[;,]/gi;

/** A source of code, by its extension, and a query that makes a module an asset (round 5). */
const CODE_SOURCE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const AS_ASSET = /(^|&)(?:inline|url|raw)(&|=|$)/;

const dataUrls = [];

const files = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

const isText = (path) => [".js", ".css", ".html", ".webmanifest", ".json"].includes(extname(path));

const problems = [];

if (BOOT_BUDGET_GZIP_BYTES > BOOT_AUTHORISED_GZIP_BYTES) {
  problems.push(
    `el techo del arranque (${BOOT_BUDGET_GZIP_BYTES}) pasa de lo autorizado (${BOOT_AUTHORISED_GZIP_BYTES}): subir una autorización es cosa de la dirección`,
  );
}
const ceilings = LAZY_AREAS.reduce((sum, area) => sum + area.budget, BOOT_BUDGET_GZIP_BYTES);
if (ceilings > TOTAL_AUTHORISED_GZIP_BYTES) {
  problems.push(
    `la suma de los techos (${ceilings}) pasa de lo autorizado para el total (${TOTAL_AUTHORISED_GZIP_BYTES}): subir una autorización es cosa de la dirección`,
  );
}
let gzipTotal = 0;
const sizes = [];

for (const path of files(dist)) {
  const name = relative(dist, path);
  const extension = extname(path);
  if (extension === ".map") {
    continue;
  }
  const bytes = readFileSync(path);
  if ([".js", ".css"].includes(extension)) {
    const gzip = gzipSync(bytes).length;
    gzipTotal += gzip;
    sizes.push({ name, raw: bytes.length, gzip });
  }
  if (!isText(path)) {
    continue;
  }
  const text = bytes.toString("utf8");
  for (const match of text.matchAll(/["'`(](node:[a-z_/]+)/g)) {
    problems.push(`${name}: importa ${match[1]}`);
  }
  // Scheme plus host, **without** requiring a dotted host: demanding the dot
  // used to skip the inert sentinels of @solidjs/router for free, and with them
  // any `http://localhost:9999/beacon` somebody injected. The two sentinels are
  // named in ALLOWED_URLS instead, one by one.
  for (const match of text.matchAll(/https?:\/\/[\w.-]+/g)) {
    if (!ALLOWED_URLS.some((allowed) => allowed.url === match[0])) {
      problems.push(`${name}: referencia a un origen ajeno ${match[0]}`);
    }
  }
  // Round 4 of the review of PR #90 (V3-inline): code inlined as a `data:`
  // URL — a source under the inline limit, reached by `new URL(…)` — is text
  // of a module out of every graph. Whatever its MIME type says it is code,
  // it stops the build; `vite.config.ts` never inlines one to begin with.
  // Judged once the graph is read, to name the module that was inlined.
  for (const match of text.matchAll(DATA_URL)) {
    dataUrls.push({ name, url: match[0], mime: match[1].toLowerCase() });
  }
  if ([".js", ".html"].includes(extension)) {
    for (const { pattern, what } of INLINE_STYLES) {
      for (const match of text.matchAll(pattern)) {
        problems.push(`${name}: el HTML lleva ${what} (${match[0].trim()})`);
      }
    }
  }
}

/**
 * The assets `index.html` itself pulls: the entry script, its `modulepreload`
 * siblings and the stylesheet. Everything else arrives when a route is opened.
 */
const bootAssets = () => {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const referenced = new Set();
  for (const match of html.matchAll(/(?:src|href)="\/?([^"]+\.(?:js|css))"/g)) {
    referenced.add(match[1]);
  }
  return referenced;
};

/**
 * Modules that must never be in the boot path, however much room is left. The
 * whole fiscal output is lazy by design: the screen, the boxes and the
 * informative returns are opened a few times a year and must not be paid for
 * on every start. Checked on the **source maps** of the chunks `index.html`
 * pulls, which name the original module of every byte, so a lazy import that
 * stops being lazy fails the build instead of being noticed by eye.
 */
const LAZY_ONLY = [
  { path: "/packages/domain/src/tax/", what: "el motor fiscal" },
  { path: "/packages/domain/src/informative/", what: "los modelos informativos" },
  // Feature 012, decision (r): **nothing of the ECB on the boot path**, the
  // history, its reading, the proposal, the findings, the drafts, the note and
  // the local configuration. If any of it shows up here, the build stops.
  { path: "/packages/domain/src/ecb/", what: "los tipos del BCE" },
  { path: "/packages/domain/src/ecb.ts", what: "la puerta del BCE" },
  // Feature 016, E3, block 2: the download of the ECB history from the cloud
  // is never the boot's (its reading of the manifest is in `ecb/`, above).
  { path: "/src/ecb/", what: "el histórico del BCE de la web" },
  { path: "/packages/adapters/src/reference/", what: "el cliente de los datos de referencia" },
  {
    path: "/packages/domain/src/remote/",
    what: "las respuestas del API que no son de la sincronización",
  },
  { path: "/packages/domain/src/remote-answers.ts", what: "la puerta de las respuestas del API" },
  {
    path: "/packages/domain/src/schema/strict-json.ts",
    what: "la lectura estricta del manifiesto",
  },
  { path: "/packages/domain/src/config/", what: "la configuración local" },
  // Block 5: the drafts, their store and their counter. The frame keeps only
  // the place of the counter; reading and painting it arrive later.
  { path: "/src/drafts/", what: "los borradores y su contador" },
  { path: "/src/routes/registrar/borradores.tsx", what: "la lista de borradores" },
  // Feature 013: **nothing of the automatic prices on the boot path**, from its
  // first commit. The door, the folder of the domain and the reader of the web.
  { path: "/packages/domain/src/quotes/", what: "los precios automáticos" },
  { path: "/packages/domain/src/quotes.ts", what: "la puerta de los precios automáticos" },
  {
    path: "/packages/adapters/src/ledger-store/browser/prices.ts",
    what: "la lectura de los precios",
  },
  { path: "/src/prices/", what: "los precios automáticos de la web" },
  // Feature 014: **nothing of the sync on the boot path**, from its first
  // commit: the domain of the sync and its door, the shared orchestration and
  // the web's own store of sync state. The sync is explicit and lazily loaded.
  { path: "/packages/domain/src/sync/", what: "la sincronización del libro" },
  // Feature 015, E5 (Q12, §33): the tools of the screens opened on demand.
  { path: "/packages/domain/src/tools.ts", what: "la puerta de las herramientas de las pantallas" },
  {
    path: "/packages/domain/src/projections/corporate-action-draft.ts",
    what: "el borrador de un evento corporativo",
  },
  { path: "/packages/domain/src/projections/deep-check.ts", what: "la verificación a fondo" },
  {
    path: "/packages/domain/src/projections/simulate-transfer.ts",
    what: "la simulación de un traspaso",
  },
  // Feature 020, E3: the gauges and the percentages of the Cubo, behind
  // `@atlas/domain/charts` from their first commit.
  { path: "/packages/domain/src/charts.ts", what: "la puerta de los indicadores de las pantallas" },
  { path: "/packages/domain/src/charts/", what: "los indicadores y las series de las pantallas" },
  // The analysis of the Cartera and the Cubo, behind `@atlas/domain/portfolio`.
  {
    path: "/packages/domain/src/portfolio.ts",
    what: "la puerta del análisis de la Cartera y el Cubo",
  },
  { path: "/packages/domain/src/projections/bucket-theses.ts", what: "las tesis frente al índice" },
  { path: "/packages/domain/src/projections/bucket-stats.ts", what: "las estadísticas del cubo" },
  { path: "/packages/domain/src/projections/costs.ts", what: "los costes de la cartera" },
  { path: "/packages/domain/src/projections/contribution.ts", what: "el reparto de la aportación" },
  { path: "/packages/domain/src/projections/platform-plan.ts", what: "el reparto por plataforma" },
  // Feature 028: the rebalance reads the tax engine, so it has a door of its own and is
  // loaded when the button is pressed.
  { path: "/packages/domain/src/rebalance.ts", what: "la puerta del rebalanceo" },
  { path: "/packages/domain/src/projections/rebalance.ts", what: "la propuesta de rebalanceo" },
  {
    path: "/packages/domain/src/projections/sale-tax.ts",
    what: "el impuesto aproximado de una venta",
  },
  // Feature 015: **nothing of the access on the boot path**, from its first
  // commit. The rules of the access are the API's and never the web's (the
  // architecture test keeps the web from reaching them at all); the session
  // and the devices are a lazy section of Ajustes.
  { path: "/packages/domain/src/access/", what: "las reglas del acceso" },
  { path: "/packages/domain/src/access.ts", what: "la puerta del acceso" },
  { path: "/src/auth/", what: "la sesión y los dispositivos de la web" },
  { path: "/packages/domain/src/sync.ts", what: "la puerta de la sincronización" },
  { path: "/packages/domain/src/ports/remote-ledger.ts", what: "el puerto del remoto" },
  { path: "/packages/adapters/src/sync/", what: "la orquestación de la sincronización" },
];

/** The modules a chunk is made of, from its source map; empty when it has none. */
const modulesOf = (name) => {
  const map = join(dist, `${name}.map`);
  if (!statSync(map, { throwIfNoEntry: false })) {
    return [];
  }
  return JSON.parse(readFileSync(map, "utf8")).sources.map((source) =>
    source.replaceAll("\\", "/").replace(/^(\.\.\/)+/, "/"),
  );
};

const kb = (value) => `${(value / 1024).toFixed(1)} KB`;

/**
 * **What the web must never bundle**, read on the real graph of the build
 * (round 2 of the review of PR #90, B2-bis and B3). The static guards read
 * the sources, and a `//` inside a string, a relay that re-exports, a
 * relative path into `packages/`, `require` and `import.meta.glob` each
 * walked past them with every test green; only the ceiling of the bundle
 * noticed, and the ceiling is not a guard. Whatever the path, a module in
 * this list is in the graph or it is not in the bundle.
 *
 * `anywhere`: the module may not even be **loaded** into the graph — rendered
 * or shaken off, reaching it is already the defect. `rendering`: loaded
 * through a door that also serves the web is tolerated, **rendering a byte**
 * is not. Every path is relative to the repository, and `dist/` is named
 * with `src/`: a subpath without an alias resolves through `exports` to the
 * compiled package.
 */
const FORBIDDEN_IN_WEB = [
  // The rules of the access are the API's, never the web's.
  {
    anywhere: /(^|\/)packages\/domain\/(src|dist)\/access(\.[jt]s$|\/)/,
    what: "las reglas del acceso",
  },
  // The administration of the remote (feature 015, E5; review of PR #98,
  // N7): its rules behind their door; its adapter is under `aws/` and its
  // orders in the console, both refused below.
  {
    anywhere: /(^|\/)packages\/domain\/(src|dist)\/admin\.[jt]s$/,
    what: "las reglas de la administración",
  },
  // The Node adapters of the API, the SDK of AWS and the API itself.
  {
    anywhere: /(^|\/)packages\/adapters\/(src|dist)\/(aws|access|identity)\//,
    what: "un adaptador de Node de la API (AWS, acceso o Google)",
  },
  { anywhere: /(^|\/)node_modules\/@(aws-sdk|smithy|aws-crypto)\//, what: "el SDK de AWS" },
  { anywhere: /(^|\/)apps\/(api|cli)\//, what: "la API o la consola" },
  // Feature 016: the scheduled jobs, their rules in the domain and the port
  // that sends mail. Nothing of the web may reach what holds the keys of the
  // sources or the permission of SES (§8.2 B2).
  { anywhere: /(^|\/)apps\/jobs\//, what: "las tareas programadas" },
  {
    anywhere: /(^|\/)packages\/domain\/(src|dist)\/(jobs(\.[jt]s$|\/)|ports\/notifier\.[jt]s$)/,
    what: "las reglas de las tareas o el puerto del correo",
  },
  // A builtin of Node, however Vite names it once it stubs it for the browser.
  { anywhere: /(^|\0)node:|__vite-browser-external/, what: "un módulo de Node" },
  // The doubles of S3, SSM and Google, the local server of the captures, and
  // anything under a folder of tests.
  { anywhere: /(^|\/)(test|tests)\/|test-only-/, what: "un doble o código de test" },
  // Round 3 of the review of PR #90: the ids arrive **after `realpath`**, so
  // a package of the repository can never be named through `node_modules`
  // — an alias or `preserveSymlinks` that did it is refused as such — nor
  // can a module live outside the repository.
  {
    anywhere: /(^|\/)node_modules\/@atlas\//,
    what: "un paquete del repositorio por node_modules (un alias o preserveSymlinks)",
  },
  { anywhere: /^\.\.\//, what: "un módulo de fuera del repositorio" },
];

const repoRoot = realpathSync(resolve(webRoot, "..", ".."));
const graphFile = join(dist, ".vite", "atlas-modules.json");
const graph = statSync(graphFile, { throwIfNoEntry: false })
  ? JSON.parse(readFileSync(graphFile, "utf8"))
  : { chunks: [], assets: [], workers: [] };

/**
 * Every build of the output: the main one and **each worker**, which Vite
 * builds apart (`worker.plugins` carries the same plugin; round 3 of the
 * review of PR #90). The rules run over all of them.
 */
const builds = [
  { label: "", ...graph },
  ...(graph.workers ?? []).map((worker, index) => ({ label: `worker ${index + 1}: `, ...worker })),
];
const shown = (module) =>
  `${module.id.replace("\0", "\\0")}${module.query ? `?${module.query}` : ""}`;
const refuse = (where, id, bytes) => {
  for (const rule of FORBIDDEN_IN_WEB) {
    const loaded = rule.anywhere?.test(id) === true;
    const rendered = rule.rendering?.test(id) === true && bytes > 0;
    if (loaded || rendered) {
      problems.push(`${where} trae ${rule.what}: ${id}${rendered ? ` (${bytes} bytes)` : ""}`);
    }
  }
};
for (const build of builds) {
  for (const chunk of build.chunks ?? []) {
    for (const module of chunk.modules) {
      // Compared **without the query**: `?raw` and `?url` of a vetoed module
      // are that module (round 3).
      refuse(`${build.label}${chunk.file}`, module.id, module.bytes);
    }
  }
  // An asset is a file too: whatever it was emitted from falls under the rules.
  for (const asset of build.assets ?? []) {
    for (const source of asset.sources) {
      refuse(`${build.label}${asset.file}`, source, 1);
    }
  }
}

/*
 * **Code inlined as a `data:` URL** (rounds 4 and 5 of the review of PR #90).
 * A source under the inline limit reached by `new URL(…)` — which
 * `vite.config.ts` no longer inlines — or imported with `?inline` or
 * `?url&inline`, which Vite inlines **before** asking `assetsInlineLimit`. Its
 * MIME type is `video/mp2t` for `.ts` and `.mts`, a JavaScript type for `.js`,
 * and `application/octet-stream` for the extensions Vite does not know
 * (`.tsx`, `.cts`): that last one is refused **when the chunk holds a source
 * of code imported as an asset**, and the module is named whenever the graph
 * has it.
 */
const graphedChunks = new Map(
  builds.flatMap((build) => (build.chunks ?? []).map((chunk) => [chunk.file, chunk])),
);
for (const { name, url, mime } of dataUrls) {
  const inlined = (graphedChunks.get(name)?.modules ?? []).filter(
    (module) => CODE_SOURCE.test(module.id) && AS_ASSET.test(module.query),
  );
  const which = inlined.length > 0 ? `: ${inlined.map((module) => shown(module)).join(", ")}` : "";
  if (CODE_MIME.test(mime) || (mime === "application/octet-stream" && inlined.length > 0)) {
    problems.push(`${name}: lleva código incrustado como URL data: (${url})${which}`);
  }
}

/*
 * **A worker whose graph the guard does not know** stops the build: an import
 * `?worker` or `?sharedworker` in the graph of the main build with no worker
 * graph whose entry is that file. With `inline` there is no loose file for the
 * check below to notice, so this is what stands between it and the bundle.
 */
const workerEntries = new Set(
  (graph.workers ?? []).flatMap((worker) =>
    (worker.chunks ?? []).map((chunk) => chunk.entry).filter((entry) => entry !== null),
  ),
);
for (const chunk of graph.chunks) {
  for (const module of chunk.modules) {
    if (/(^|&)(worker|sharedworker)(&|=|$)/.test(module.query) && !workerEntries.has(module.id)) {
      problems.push(
        `${chunk.file} crea un worker cuyo grafo no se conoce: ${shown(module)} (falta el plugin en worker.plugins)`,
      );
    }
  }
}

/*
 * Guards on the guard: the graph exists, covers **every** chunk of the output,
 * holds the entry and the domain, and names every module the source maps say
 * a chunk is made of — so a plugin that stopped seeing a chunk, or a chunk the
 * graph does not describe, stops the build instead of passing by looking at
 * nothing.
 */
const graphed = new Map(
  builds.flatMap((build) => (build.chunks ?? []).map((chunk) => [chunk.file, chunk])),
);
const everyModule = graph.chunks.flatMap((chunk) => chunk.modules.map((module) => module.id));
if (graph.chunks.length === 0) {
  problems.push(
    `no se ha podido leer el grafo de módulos del bundle (${relative(repoRoot, graphFile)})`,
  );
}
if (
  !everyModule.includes("apps/web/src/main.tsx") ||
  !everyModule.some((id) => id.startsWith("packages/domain/src/"))
) {
  problems.push(
    "el grafo de módulos no tiene la entrada de la web o el dominio: no describe este bundle",
  );
}
for (const path of files(dist).filter((path) => extname(path) === ".js")) {
  const name = relative(dist, path).replaceAll("\\", "/");
  const map = `${path}.map`;
  const chunk = graphed.get(name);
  if (!statSync(map, { throwIfNoEntry: false })) {
    // Without a map, only a chunk of the graph (the runtime of Rolldown) or
    // the one-line registration of the service worker the plugin writes.
    if (chunk === undefined && name !== "registerSW.js") {
      problems.push(`${name}: el grafo de módulos no describe este chunk`);
    }
    continue;
  }
  const sources = JSON.parse(readFileSync(map, "utf8")).sources;
  if (chunk === undefined && /^(sw|workbox-[\w-]+)\.js$/.test(name)) {
    // The service worker is built by Workbox, not by Rolldown, so it is not in
    // the graph: it may hold Workbox and the file Workbox generates, nothing else.
    for (const source of sources) {
      if (!/(^|\/)node_modules\/workbox-[a-z-]+\/|\/sw\.js$/.test(source)) {
        problems.push(`${name}: el service worker trae ${source}, que no es de Workbox`);
      }
    }
    continue;
  }
  if (chunk === undefined) {
    problems.push(`${name}: el grafo de módulos no describe este chunk`);
    continue;
  }
  const ids = new Set(chunk.modules.map((module) => module.id));
  for (const source of sources) {
    const id = relative(repoRoot, resolve(dirname(path), source.replace(/\?.*$/, ""))).replaceAll(
      "\\",
      "/",
    );
    if (!ids.has(id)) {
      problems.push(`${name}: su source map nombra ${id} y el grafo de módulos no`);
    }
  }
}

/*
 * **Every emitted file**, not only the `.js` (round 3 of the review of PR #90:
 * `new URL("…/client.ts", import.meta.url)` emits the source itself as an
 * asset, out of the graph of modules). A source of TypeScript or JSX is never
 * shipped; and every file has to be accounted for: a chunk or an asset of a
 * graph (whose sources went through the rules above), a source map, a file of
 * `public/`, or one of the few the build writes after the graph (the page,
 * the manifest and the service worker, named one by one).
 */
const publicDir = join(webRoot, "public");
const published = new Set(
  statSync(publicDir, { throwIfNoEntry: false })
    ? files(publicDir).map((path) => relative(publicDir, path).replaceAll("\\", "/"))
    : [],
);
const emitted = new Set(
  builds.flatMap((build) => [
    ...(build.chunks ?? []).map((chunk) => chunk.file),
    ...(build.assets ?? []).map((asset) => asset.file),
  ]),
);
const WRITTEN_AFTER =
  /^(index\.html|manifest\.webmanifest|registerSW\.js|sw\.js|workbox-[\w-]+\.js)(\.map)?$/;
for (const path of files(dist)) {
  const name = relative(dist, path).replaceAll("\\", "/");
  if (name.startsWith(".vite/")) {
    continue;
  }
  if (/\.(ts|tsx|mts|cts|jsx)$/.test(name)) {
    problems.push(`${name}: el bundle lleva un fuente, que no se sirve nunca`);
    continue;
  }
  const accounted =
    emitted.has(name) ||
    published.has(name) ||
    WRITTEN_AFTER.test(name) ||
    (name.endsWith(".map") && emitted.has(name.slice(0, -".map".length)));
  if (!accounted) {
    problems.push(`${name}: ningún grafo dice de dónde sale este fichero`);
  }
}

/**
 * Feature 015: the service worker answers every navigation with the shell of
 * the SPA (`navigateFallback`) **except under `/api/`**, which is the API's:
 * the start of a sign-in and the return from Google. Checked on the output,
 * so a change of the plugin that drops `navigateFallbackDenylist` stops the
 * build instead of breaking the sign-in of an installed PWA.
 */
const serviceWorker = readFileSync(join(dist, "sw.js"), "utf8");
if (
  !/NavigationRoute\([^)]*\),\s*\{\s*denylist:\s*\[\s*\/\^\\\/api\\\/\/\s*\]/.test(serviceWorker)
) {
  problems.push("sw.js: la navegación a /api/ no está excluida del navigateFallback de la SPA");
}

const boot = bootAssets();
const gzipBoot = sizes
  .filter((entry) => boot.has(entry.name))
  .reduce((sum, entry) => sum + entry.gzip, 0);

console.log("Bundle (JS + CSS):");
for (const entry of sizes.sort((a, b) => b.gzip - a.gzip)) {
  const mark = boot.has(entry.name) ? "arranque" : "perezoso";
  console.log(`  ${entry.name}  ${kb(entry.raw)} sin comprimir  ${kb(entry.gzip)} gzip  ${mark}`);
}
console.log(
  `  ARRANQUE  ${kb(gzipBoot)} gzip  (presupuesto ${kb(BOOT_BUDGET_GZIP_BYTES)})  — lo que se descarga antes de la primera pantalla`,
);
/** The area of a lazy chunk: the first that owns one of its modules, else the last. */
const areaOf = (name) => {
  const modules = modulesOf(name);
  return (
    LAZY_AREAS.find((area) =>
      modules.some((module) => area.owns.some((p) => module.includes(p))),
    ) ?? LAZY_AREAS[LAZY_AREAS.length - 1]
  );
};
const gzipByArea = new Map(LAZY_AREAS.map((area) => [area.name, 0]));
for (const entry of sizes.filter((entry) => !boot.has(entry.name))) {
  const { name } = areaOf(entry.name);
  gzipByArea.set(name, gzipByArea.get(name) + entry.gzip);
}
for (const area of LAZY_AREAS) {
  console.log(
    `  ${area.name.toUpperCase().padEnd(12)} ${kb(gzipByArea.get(area.name))} gzip  (presupuesto ${kb(area.budget)}, ${gzipByArea.get(area.name)} B)  — ${area.what}`,
  );
}
console.log(`  TOTAL     ${kb(gzipTotal)} gzip  — todo lo que puede llegar a descargarse`);

if (gzipBoot > BOOT_BUDGET_GZIP_BYTES) {
  problems.push(
    `el arranque pesa ${kb(gzipBoot)} gzip y el presupuesto es ${kb(BOOT_BUDGET_GZIP_BYTES)}`,
  );
}
for (const area of LAZY_AREAS) {
  const gzip = gzipByArea.get(area.name);
  if (gzip > area.budget) {
    problems.push(
      `${area.what} (${area.name}) pesa ${gzip} B gzip y su presupuesto es ${area.budget} B`,
    );
  }
}
let bootModules = 0;
for (const name of boot) {
  if (extname(name) !== ".js") {
    continue;
  }
  const modules = modulesOf(name);
  bootModules += modules.length;
  for (const { path, what } of LAZY_ONLY) {
    const inside = modules.filter((module) => module.includes(path));
    if (inside.length > 0) {
      problems.push(
        `${name} es de arranque y trae ${what}: ${inside.join(", ")} (tiene que cargarse en diferido)`,
      );
    }
  }
}
if (bootModules === 0) {
  // A guard on the guard: without source maps the rule above would pass by
  // looking at nothing.
  problems.push("no se ha podido leer el contenido de ningún chunk de arranque");
}
if (gzipBoot === 0) {
  // A guard on the guard: if the parsing of index.html ever stops matching, the
  // boot budget would pass by measuring nothing.
  problems.push("no se ha reconocido ningún asset de arranque en index.html");
}

if (problems.length > 0) {
  console.error("\nEl bundle no cumple las reglas de ADR-0017/ADR-0019:");
  for (const problem of [...new Set(problems)]) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(
  "Sin node: builtins, sin módulos vetados para la web, sin orígenes ajenos, dentro del presupuesto.",
);
