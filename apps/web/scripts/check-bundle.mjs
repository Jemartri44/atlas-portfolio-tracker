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
// 4. Size within budget, printed so plan.md can record the measured value.
//    **Two** budgets since feature 007, because the two answer different
//    questions and only one of them is felt on a phone: what the browser has to
//    download **to boot** (what index.html preloads), and the total of
//    everything it may end up downloading. Until then this file said it measured
//    the boot and actually summed all of `dist`, lazily loaded chunks included —
//    so vendoring uPlot, which is only ever loaded by two screens, would have
//    failed the build without the boot path growing by a byte (Q6).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(webRoot, "dist");

/**
 * What the browser downloads before the first screen paints: JS + CSS, gzip.
 *
 * **Lowered from 80 to 69 by the visual redesign (ADR-0023), to what it
 * measured plus a small margin:** Pico left the boot path, and with it 6,9 KB
 * gzip of stylesheet that the screens overrode anyway; our own base weighs
 * 9,1 KB where Pico and its overrides weighed 16,0. Measured on top of the
 * tax engine: **68,5 KB** (72,6 before the redesign), rounded up to 69.
 *
 * **Set to what the third review measured plus 1 KB, as the direction asked:**
 * the fixes of the verifier's review (the tables laid out by the room of their
 * card, the draft that remembers what was typed, the notices gathered, the
 * pending states, the rules said in plain words, the sentence over the effect,
 * the unit inside a field) measured **69,1 KB**; the ceiling is 70,1.
 *
 * **Set again to what was measured plus 1 KB after its second and third
 * passes**, as the direction asked when a ceiling is passed: the preview of a
 * correction as it is written, the stale mark of a row, the singular of one
 * unit, the theme of the browser's bar and the confirmation of a write on the
 * movement it wrote. Measured **69,4 KB**; the ceiling is 70,4.
 *
 * **Raised to 71,5 by the direction (feature 010), because the loader
 * validates.** The eight configured figures of the informative returns and of
 * the tax season took the boot from 69,4 to 69,9, and the question was whether
 * validating settings belongs in the boot path at all. It does, and
 * structurally: `LedgerStore.load()` decodes every line with `decodeLine`,
 * which validates it against today's rules (trap 10 of `CLAUDE.md`, ADR-0018),
 * and the web is local-first (ADR-0019), so **opening the ledger is the boot**.
 * Measured by removing the call: the whole validation of settings is **1,4 KB
 * gzip** of the boot, 0,5 of it the new parameters. The two ways of getting it
 * back are worse than a higher ceiling: not validating lets a ledger with a
 * negative threshold or a category that does not exist **load in silence**,
 * and splitting the validation in two levels breaks one rule across two places
 * that will drift apart, without even closing that hole. At 71,5 the
 * application still boots lighter than before the redesign (72,7 KB): the
 * budget is not relaxed, it is put where the design puts it. **71,5 is a wall,
 * not a target**: passing it is a stop-and-ask, and every commit that moves
 * the bundle records its measurement.
 */
const BOOT_BUDGET_GZIP_BYTES = 71.5 * 1024;

/**
 * Everything it may download across the whole application: JS + CSS, gzip.
 *
 * The direction set 150 KB in the answers to feature 007, from an estimate that
 * turned out to be short, and then approved 175 KB with one instruction: fix
 * the ceiling at **what was actually measured**, not at what was allowed.
 * Measured at the end of the feature, with every fix of the two reviews in:
 * **163,1 KB**. Where it goes, all of it gzip:
 *
 *   ~34 KB  `@atlas/domain` — the projections, the FIFO engine and the money
 *           types. It is the application; it is on the boot path because the
 *           first screen projects the ledger.
 *   ~22 KB  uPlot, vendored, in a lazily loaded chunk that only Núcleo and Cubo
 *           pull (ADR-0017 quotes 23 KB **minified**, not gzip).
 *   ~16 KB  the stylesheet, mostly vendored Pico (9 KB of our own base since
 *           the redesign, ADR-0023).
 *   ~12 KB  `@solidjs/router`.
 *    ~8 KB  Solid itself plus the boot.
 *   the rest is our eleven screens, ~2 KB gzip each.
 *
 * The number that is felt on a phone is the **boot** one, and that one went
 * down over the feature: 74,5 KB against a budget of 80.
 *
 * The ceiling below is the measured total rounded up to the next whole KB. It
 * is not a target to grow into: the next feature that needs more has to say why
 * and move it on purpose, which is the whole point of measuring at the end
 * instead of leaving the allowance in place.
 *
 * **Moved from 164 to 166 by feature 008, on purpose and for one reason:** the
 * schema grew. A twenty-fourth event type with its projection (`swap`), four
 * new optional fields, a new per-asset-type setting and the Spanish names of
 * all of them add ~1,1 KB gzip, and the web bundles the whole domain because
 * every calculation lives there (ADR-0007). The boot figure, which is the one
 * felt on a phone, did not move: 75,6 KB against a budget of 80.
 *
 * **Moved from 166 to 177 by the round of web defects of 2026-09-18, on
 * purpose:** that round replaced what the screens used to print raw with
 * readable text, and text weighs. The effects of a corporate action and a
 * configuration change told as sentences instead of JSON (~1,5 KB), the error
 * and warning catalogues naming fields, types and settings by their Spanish
 * labels (~2 KB), the reader of Spanish numbers and the errors put on their
 * field (~2 KB), events named by type and date instead of by identifier, the
 * preview reduced to what changes. In exchange the **boot** went down, from
 * 76,4 to 71,6 KB: the catalogue of messages is now fetched only when an error
 * has to be explained.
 *
 * **Moved from 177 to 179 by feature 009 (the tax engine), on purpose:** the
 * lot journal of the projection, three new fiscal settings with their
 * validation, the refusal of a second asset with the same ISIN, and the
 * Spanish of the codes of the tax engine that the drift test demands in both
 * interfaces. The tax engine itself does not enter the bundle. Measured on top
 * of the round of defects: 178,6 KB total; the boot, 72,6 KB against 80.
 *
 * **Moved from 179 to 184 by the visual redesign (ADR-0023), measured and
 * not allowed:** the stylesheet went down by 6,9 KB, and the JavaScript went up
 * by about 10 KB — one icon set drawn in SVG, the notice, the fold and the
 * states as components, the first steps of an empty ledger, the sentence that
 * opens a movement, the filters in two shapes, the effect beside the form, the
 * deviation gauge and the proportion of the patrimony. Measured on top of the
 * tax engine: **183,4 KB**, of which the boot is 68,5.
 *
 * **Set to what the third review measured plus 2 KB, as the direction asked:**
 * the same fixes, plus the result of a sale in its detail, the gap of a chart
 * in one line with its list folded, the bucket's notices in their cards, the
 * first run with the folder in one line and the weights asked only of live
 * assets, measured **187,4 KB**; the ceiling is 189,4.
 *
 * **Passed by the second and third passes of the review, and set again to
 * what was measured plus 2 KB:** every sale of a movement with its total, the
 * lists without assets converted away, the rectified movement reached with its
 * confirmation, the page that refuses to correct a reversed one and the closed
 * theses folded. Measured **189,8 KB**; the ceiling is 191,8.
 */
const TOTAL_BUDGET_GZIP_BYTES = 191.8 * 1024;

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

const files = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

const isText = (path) => [".js", ".css", ".html", ".webmanifest", ".json"].includes(extname(path));

const problems = [];
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

const kb = (value) => `${(value / 1024).toFixed(1)} KB`;

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
console.log(
  `  TOTAL     ${kb(gzipTotal)} gzip  (presupuesto ${kb(TOTAL_BUDGET_GZIP_BYTES)})  — todo lo que puede llegar a descargarse`,
);

if (gzipBoot > BOOT_BUDGET_GZIP_BYTES) {
  problems.push(
    `el arranque pesa ${kb(gzipBoot)} gzip y el presupuesto es ${kb(BOOT_BUDGET_GZIP_BYTES)}`,
  );
}
if (gzipTotal > TOTAL_BUDGET_GZIP_BYTES) {
  problems.push(
    `el bundle entero pesa ${kb(gzipTotal)} gzip y el presupuesto es ${kb(TOTAL_BUDGET_GZIP_BYTES)}`,
  );
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

console.log("Sin node: builtins, sin orígenes ajenos, dentro del presupuesto.");
