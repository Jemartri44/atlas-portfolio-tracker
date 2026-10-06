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
//    `tests/api-access.test.ts` are the quick warning.
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
 *
 * **Set at 74,0 for the rest of feature 010 by the direction**, after the
 * filing event took the boot to 71,1 with its own validation — the hardest of
 * the schema: nested figures, two shapes by model, no repeated origin and no
 * repeated asset. The reasoning is the invariant, not the kilobytes. A ledger
 * that is appended to and never deleted for twenty years, whose loader accepts
 * in silence a line that does not comply, is a bomb that goes off far from
 * where it was planted; and there is no way around the cost, because if the
 * ledger is parsed at boot then its validator is in the boot by definition.
 *
 * **Tightened to what the feature measures, as the direction asks at the close
 * of every feature**: the whole tax output is in and the boot measures **72,8
 * KB**, which is *lower* than the 72,3 it measured before the fiscal screen
 * existed plus what the screen's shared code adds, and lower than the 74,0 it
 * was allowed. The ceiling comes down to **73,5**. What is inside, gzip: the
 * domain in one chunk without its fiscal half (37,6), Solid, the router, the
 * shell and the first screen (25,2), and the stylesheet (9,9). Nothing of
 * `tax/` or `informative/`, which the shape check below holds.
 *
 * **What is watched is the shape, not the size.** The boot may carry the
 * loader and what the first screen needs, and nothing of the tax output: the
 * check below reads the source maps of the boot chunks and fails the build if
 * anything of `domain/src/tax/` or `domain/src/informative/` is inside, even
 * with room to spare. A boot of 72 KB with the fiscal screen in it is worse
 * than one of 74 without it. And when the feature closes, the ceiling comes
 * back **down** to what is then measured plus a small margin: it is not left
 * slack "just in case".
 *
 * **Trinquete de cierre de la feature 011 (2026-09-23): measured 73,3, and the
 * ceiling stays at 73,5**, which is that plus a small margin. The number alone
 * does not say whether it is a price paid or a drift nobody looked at, so here
 * is the trend: it came into this round at **72,9**, rose to **73,0** with the
 * closed map of measure reasons and the reason of a reading that predates the
 * supported regime, and to **73,3** with the last block — and that last jump
 * is **one decision, not slack**.
 *
 * What it buys: `atlas check` and the verification screen have to say
 * **always** that the fingerprint of a filing was never verified and that the
 * user gave it for good (ADR-0025, decision (d) of prompt 011), so the waiver
 * has to be **projected** — and `project-ledger.ts`, `state.ts` and
 * `integrity.ts` are the boot path. Without projecting it, plain `check` could
 * not say it and the way out would have become a way of cleaning the record.
 * It is the same split feature 010 chose for the warning of a closed year:
 * **the fact up here, the figure in the lazy chunk**. A fact that must be
 * sayable always lives where the projection always runs.
 *
 * The breakdown, gzip: the domain in one chunk without its fiscal half
 * (37,8), Solid, the router, the shell and the first screen (25,2), and the
 * stylesheet (9,9). **Nothing of `tax/` or `informative/`**, which the shape
 * check below holds and which is what really matters: if either of them shows
 * up here, the build fails even with room to spare.
 *
 * **Remeasured after the review of feature 011 (2026-09-23): 73,49 — 75.251
 * bytes against a ceiling of 75.264, thirteen bytes of margin.** The ceiling
 * is **not** moved: raising it is the direction's call, not the
 * implementer's. What the review added to the boot, +227 bytes measured chunk
 * by chunk against the head of the PR: the domain **+197** —the projection
 * refusing to reverse a waiver or to accept one naming no filing, the third
 * reason of the waiver in the validator, and `earliestReached` in
 * `filings/touched.ts`, which already lived in the boot— and the stylesheet
 * **+36**, the rows of the anchor by origin (all the CSS is boot). The first
 * two are of the same kind as the 73,3: a waiver that could be annulled would
 * let plain `check` go silent, so the refusal has to live where the
 * projection always runs. **Nothing of `tax/` or `informative/`**: the shape
 * check passes and `closed-years.ts` is still lazy.
 *
 * **Raised to 73,7 by the direction (2026-09-23)**: thirteen bytes are not a
 * margin but an alarm that goes off with the next unrelated change, and a
 * ceiling that breaks for anything is learnt to be raised without looking. So
 * it goes back to the usual rule, measured plus a small margin.
 *
 * **The trend, not smoothed: 72,9 when feature 011 began, 73,49 when its
 * review closed — six tenths in one round.** The three items are facts that
 * must be said **always**, and that is why they live in the boot: the
 * projection of the waiver (so plain `check` says it), the refusal to reverse
 * a waiver or to accept one naming no filing (so it cannot be made to go
 * silent), and the horizon of what a write reaches (so the warning of a
 * closed year fires when it must and only then). **The next round that wants
 * to put anything here has to justify it against this line.**
 *
 * **Feature 012, block 5 (2026-09-24): measured 73,9 (75.590 bytes plus the
 * registration of the service worker), ceiling 74,0. For the direction to
 * review, and to revert on its own if it says no.** The prompt names the lock
 * and the rule of one live correction as the only things that may grow the
 * boot; this is neither, and it is said here and in `questions.md` §9. Byte
 * by byte against block 4 (75.317): the domain chunk **+31** — the database
 * of the browser goes to version 2 with a store for the drafts, the decision
 * D8 of the direction, and the upgrade can only run where the database is
 * opened, which is the boot; with it, an upgrade blocked by another tab is
 * said apart instead of as «el navegador no permite guardar datos» —; the
 * entry **+228** — the route `/registrar/borradores` (**+109**, what any lazy
 * route costs in the table of its chunks) and the place of the counter of
 * drafts in the frame with its lazy import (**+108**; the prompt allows the
 * frame to keep the place, the counter itself is lazy and plain DOM, because a
 * Solid component there moved Solid into a boot chunk of its own, +0,6 KB) —;
 * and the stylesheet **+14**, the place without a box. **Nothing of the ECB
 * in the boot**: reading the drafts, counting them and painting the count
 * arrive after the first screen, and the shape check holds it. The trend:
 * 72,9 → 73,49 in feature 011, 73,5 → 73,9 in this one.
 *
 * **Brought down after the review of PR #75 (2026-09-24): measured 73,69
 * (75.313 bytes plus 140 of the registration of the service worker), ceiling
 * 73,8.** The reviewer found what the boot did not need: the whole module of
 * folders for the one function that says whether the browser has pickers
 * (−0,17 KB of the domain chunk, `picker.ts` stays), the export and the import
 * of the ledger (now `@atlas/adapters/transfer`), and the route of the list of
 * drafts, which the form route serves (−0,10 of the entry). What stays of the
 * feature in the boot, against block 4: the database in version 2 (D8) and
 * the place of the counter of drafts in the frame. With the rest of the
 * review in (the import refused when the ledger changed, the idempotent
 * confirmation of a draft, the note of a rate not contrasted — all lazy), the
 * final measure is **73,71: 75.483 bytes, 26 above block 4** (75.457), which
 * is the new names in the table of lazy chunks of the entry. The margin is the
 * usual one, a tenth.
 *
 * **Feature 013, the price gate (2026-09-24): measured 75.676 bytes, ceiling
 * 75.829 = 73,8 KB + 258 bytes, exactly what the change measured (decision
 * D-Q7 of the direction: exactly the measure, capped at +0,3 KB, in its own
 * commit).** Byte by byte against `develop` (75.418): the domain chunk
 * **+249** — P2 in `priceAt` and `manualPrices` (the more recent date wins,
 * the manual one on the same date), `unit_value_eur` optional with the reason
 * it is missing, the warning `price_without_eur_value` said by the weights and
 * the bucket, the gap of the index that says why, and the manual leaf the 720
 * reads (`manual-price.ts`, which the gate imports: the valuations are read in
 * one place, decision D-Q8) —; the entry **+9**, the new names in the table of
 * lazy chunks. **Nothing of the download or of the store of prices is in the
 * boot**: `quotes/`, its door and the reader of the web are in LAZY_ONLY from
 * their first commit. The trend: 73,5 → 73,9 → 73,7 in feature 012; 73,7 →
 * 73,9 in this one.
 *
 * **Review of PR #78 (2026-09-25): the figure above was wrong, and the ceiling
 * now holds the cap itself.** At the head of the reviewed branch the review
 * measured the boot at **+303** over `develop` (75.418), not the +294 this
 * comment said: the +258 of the gate, the `external?` of `contributionPlan`,
 * and the entry naming the lazy chunks of the screens of prices. After the
 * review (the price with euros wins over a newer one without them, the note
 * of the approximation said by `contributionPlan` itself, and the screens
 * loading the quotes on demand so that the entry does not preload them):
 * **75.690 bytes, +272** — domain chunk +265, entry +7. The ceiling is set
 * to `develop` plus the cap of decision D-Q7 (+0,3 KB, 307 bytes), 75.725,
 * so that going over the cap stops the build instead of a comment. The trend:
 * 73,7 → 73,9 in this feature.
 *
 * **Feature 014, the raw-line operations (2026-09-25): measured 75.811 bytes,
 * +108 over `develop` (75.703); the ceiling rises exactly that (decision D-Q7
 * of the direction: exactly the measure, capped at +140 bytes for this and the
 * refusal of `acceptInvalid` together, each in its own commit).** They are
 * rules of the domain that live where the boot already is: the port gains two
 * operations (ADR-0026, Part A, amendment), and `BlobLedgerStore`, which the
 * boot opens, has to implement them. Byte by byte: the domain chunk **+110**
 * — `appendLines` and `replaceLines` of `BlobLedgerStore` sharing their body
 * with `append` and `replace`, and `rawLinesText`/`decodeLines` of the domain,
 * which the load of the store now shares too —; the entry **−2**. Nothing of
 * the sync engine is in the boot: its folders are in LAZY_ONLY. The trend:
 * 73,9 → 74,0.
 *
 * **Feature 014, the refusal of `acceptInvalid` on a synced ledger (V7):
 * measured 75.838 bytes, +135 over `develop` altogether, +5 over the ceiling
 * above; the ceiling rises exactly that, inside the cap of +140 of D-Q7.** The
 * refusal lives in `checkInvalid`, which is boot, so that the preview and the
 * record fail alike: one more condition and one more code of
 * `DependentEventsError` (domain chunk +42 over the raw-line operations, the
 * rest of it gzip moving). The read of «is this browser synced?» is lazy: the
 * write path of the web loads it from the store of the sync.
 *
 * **Then +5 more, to 75.843 — the cap of D-Q7 itself (+140 over `develop`).**
 * Measured after the sentence of `raw_line_break` changed (D-Q18): the boot
 * code did not move (domain chunk 41.482, the same bytes); the entry went from
 * 24.068 to 24.073 because the table of lazy chunks names them **by their
 * hash**, and a new hash compresses differently. Noise of the hashes, not
 * code — and it is why the ceiling now sits on the cap: a change of a lazy
 * chunk can move the boot a few bytes either way.
 *
 * **Review of PR #83: measured 75.849, ceiling 75.869 — measured + 20 of
 * noise margin, not growth.** The code of the boot did not move (domain
 * chunk 41.482, the same bytes as above); the entry went from 24.073 to
 * 24.079 only because the table of lazy chunks names new hashes. With the
 * ceiling on the measure itself, any change of a lazy chunk could break the
 * build of the next feature; 20 bytes absorb that noise of the table. The
 * growth cap of D-Q7 still holds: the code of 014 adds +135 to the boot.
 *
 * **Second review of PR #83: the 6 bytes over the cap of +140 are noise of
 * the table of chunks, and the direction accepts them as such** — the domain
 * chunk did not move. The growth cap of the **code** stays +140. The ids a
 * redo seals reach `correctEvent` through its option `ids` (+5 in the domain
 * chunk, 41.487): the code of 014 now adds **+140, the cap itself**. That is
 * why a lone reversal is redone through `recordEvent` with its id and
 * `reverseEvent` takes none: giving it one cost +25 more. Measured 75.837.
 *
 * **Review of PR #96 (feature 015, E3), 2026-09-26: measured 75.885, ceiling
 * 75.905 — measured + 20 of noise margin**, within the authorisation of §7 P13
 * of the prompt of 015 (up to 76.069). Breakdown, measured build by build:
 * 75.836 at the frozen `57ea212`; **+37** for the check of a lone surrogate
 * in `rawLinesText` (security B1: no store may write bytes that are not
 * UTF-8, and the browser store is on the boot path); **+12** of the table of
 * lazy chunks (new hashes of the lazy chunks of 015, no code of the boot).
 * The check inline or shared with the sync weighs the same. Trend: the boot
 * grows only when a rule of the ledger has to live where the ledger is
 * written; everything else of 015 stays lazy.
 *
 * **Feature 015, E4, P2 and P3 (2026-09-27): measured 75.900 (+15), ceiling
 * 75.920 — measured + 20**, raised **before** the commit that needs it (the
 * lesson of E3, `questions.md` §26.5), inside the authorisation of §7 P13 (up
 * to 76.069). The code of the boot does not grow: the +15 is the table of
 * preloads of the entry, which now names the chunk of the domain of the sync
 * shared by the import and the export (the 014 measured +18 for the same).
 *
 * **E4, the card of the sync (2026-09-27): measured 75.999 (+104), ceiling
 * 76.024**, raised before the commit that needs it, inside the authorisation
 * (up to 76.069). No code of the sync on the boot: **+60** is the table of
 * exports of the chunk of the domain, which now also serves the lazy chunk of
 * the sync (12 names more: the decoder of lines, the ids, money); **+44** is
 * `reloadLedger`, which the boot shook off while nothing lazy called it. The
 * trend: 75.836 → 75.885 → 75.900 → 75.999; what is left of the
 * authorisation, 45, is for E4 alone.
 *
 * **E4, P11 (2026-09-27): measured 76.026 (+27), ceiling 76.051**, raised
 * before the commits that need it. No code on the boot: the table of lazy
 * chunks of the entry names one more, `DuplicateDialog`, which the filing
 * screen now shares with the forms. The trend: 75.999 → 76.026; 18 left of
 * the authorisation.
 *
 * **Round 2 of the review of PR #97, N2 (2026-09-27): measured 76.055 (+39
 * over 76.016), ceiling 76.069 — the authorisation itself, not measured +
 * 20**, raised before the commit that needs it. The chip of the header says
 * «falta descargar lo retenido» until what the sync held back at an export is
 * downloaded, and the boot reads it with the date of the export: +39, after
 * trimming it from +133 (`exportState` replaces `lastExportAt` instead of
 * sitting beside it, and the title of the chip keeps its sentence). **What is
 * left of the authorisation is 14 bytes**, for Q12 in E5. The trend: 75.999 →
 * 76.026 → 76.016 → 76.055.
 */
/*
 * **Feature 015, E5, the door `@atlas/domain/tools` (decision of the
 * direction on Q12, §33): measured 73.889 (−2.166), ceiling 73.909 — measured
 * + 20**, lowered in a commit of its own. The draft of a corporate action,
 * the deep check and the simulation of a transfer left the barrel of the
 * domain, which the browser downloads at boot, for a door of their own. The
 * authorisation stays at 76.069: what this frees is for Q12 (b) and for the
 * visual work after the 015. The trend: 76.055 → 73.889.
 */
/*
 * **Q12, option (b) (§29 and §33): measured 74.073 (+184), ceiling 74.093 —
 * measured + 20**, raised before the commit that needs it, inside the
 * authorisation (76.069). A line with a key twice is read and marked on the
 * boot path, where the ledger of the browser is read (`repeatsKey`, 930 B of
 * source until now only in the sync), and the degraded projection marks it
 * invalid. The trend: 76.055 → 73.889 → 74.073; 1.976 left of the
 * authorisation.
 *
 * **Q12, the remedy (review of PR #98, B1; §35): measured 74.114 (+41),
 * ceiling 74.134 — measured + 20**, raised before the commit that needs it,
 * inside the authorisation. A line with a key twice that a live reversal
 * annuls counts as annulled: the projection waits for the reversals before
 * judging it. The trend: 73.889 → 74.073 → 74.114; 1.955 left of the
 * authorisation.
 *
 * **Findings of the live price test (2026-09-27, `fix/prices-live-findings`):
 * measured 74.172 (+47 over the 74.125 of develop), ceiling 74.192 —
 * measured + 20**, set in the merge commit 9e3dfd4 together with the code
 * it measures, inside the authorisation (76.069). **Commits 0df06da to
 * 7461ace exceed the boot ceiling of their base (76.069)**: their web build
 * fails (76.092 at 7461ace, measured); 7a345b6 raised it after the code, to
 * 76.112, and the merge replaced that value. Said here at the request of
 * round 1 of the review of PR #102; the history is not rewritten. `netWorth`
 * is on the boot path: the cash in a foreign currency takes the ECB
 * history's rate when there is one and says a stale rate once per currency
 * (+45 in the chunk of the domain, after moving the shape of that rate to the
 * lazy chunk of the quotes, where it was +68; +2 of the table of chunks). The
 * trend: 74.114 → 74.172; 1.897 left of the authorisation.
 *
 * **Round 1 of the review of PR #102, the more recent of the two ECB rates
 * (2026-09-27): measured 74.194 (+22), ceiling 74.214 — measured + 20**,
 * raised in this commit, before the commit that needs it, inside the
 * authorisation. `netWorth` compares the date of the history's rate with the
 * ledger's and keeps the newer (+21 in the chunk of the domain, +1 of the
 * table of chunks). The trend: 74.114 → 74.172 → 74.194; 1.875 left.
 */
/*
 * **Feature 020, E1, M6 (2026-09-27): measured 74.137 (+12 over 74.125),
 * ceiling 74.157 — measured + 20**, raised before the commit that needs it,
 * inside the authorisation (76.069). Gain and loss leave the red of a problem
 * under their own names, and the contributed spine of M3 gets its grey in
 * the three blocks of the palette: three custom properties more in the one
 * stylesheet of the boot. The trend: 74.114 → 74.125 → 74.137.
 */
/*
 * **Feature 020, E1, M4, the step of the monitor (2026-09-27): measured
 * 74.188 (+51 over 74.137), ceiling 74.208 — measured + 20**, raised before
 * the commit that needs it, inside the authorisation (76.069). Eight tokens
 * more under a query from 1800px, in the stylesheet of the boot. The trend:
 * 74.125 → 74.137 → 74.188.
 */
/*
 * **Feature 020, E1, M4, the summary in 8+4 (2026-09-27): measured 74.275
 * (+87 over 74.188), ceiling 74.295 — measured + 20**, raised before the
 * commit that needs it, inside the authorisation (76.069). The placement of
 * the five cards of the summary from 1800px (`summary.css`, in the stylesheet
 * of the boot) and the order of the markup by width, which reads the query of
 * the shell. The trend: 74.137 → 74.188 → 74.275.
 */
/*
 * **Feature 020, E1, M11, Registrar in one screenful (2026-09-27): measured
 * 74.366 (+91 over 74.275), ceiling 74.386 — measured + 20**, raised before
 * the commit that needs it, inside the authorisation (76.069). The tiles in
 * three columns of 64px with the icon back from 640px, and the short fields
 * in pairs from 384px: rules of `registrar.css` and `controls.css`, in the
 * stylesheet of the boot. The trend: 74.188 → 74.275 → 74.366.
 */
/*
 * **Feature 020, E1, M13, the polish (2026-09-27): measured 74.413 (+47 over
 * 74.366), ceiling 74.433 — measured + 20**, raised before the commit that
 * needs it, inside the authorisation (76.069). The date of a movement in ink
 * with the whole row as its target, and the list of the tax card without its
 * indent: rules of the stylesheet of the boot. The trend: 74.275 → 74.366 →
 * 74.413.
 */
/*
 * **Feature 020, E1, the anchor under the bar (2026-09-27): measured 74.596
 * (+183 over 74.413), ceiling 74.616 — measured + 20**, raised before the
 * commit that needs it, inside the authorisation (76.069). On the boot on
 * purpose: the frame follows the fragment of every navigation once its target
 * is painted (`shell/anchor.ts` and one effect of `AppShell`), and the
 * document stops an anchor under the bar of each width (`--header-h`). The
 * trend: 74.366 → 74.413 → 74.596.
 */
/*
 * **Feature 020, E1, `develop` with PR #102 merged in (2026-09-27): measured
 * 74.665 (+69 over 74.596), ceiling 74.685 — measured + 20**, set in the
 * merge itself, where the two ceilings met: the prices of #102 and the E1 of
 * 020, each measured on its own branch. The trend: 74.413 → 74.596 → 74.665.
 */
/*
 * **Feature 020, E1, frozen (2026-09-27): measured 74.664 (−1), ceiling
 * 74.684 — measured + 20**, lowered in a commit of its own: writing the new
 * classes where the markup check reads them saved a byte. The trend: 74.596 →
 * 74.665 → 74.664.
 */
/*
 * **Round 1 of the review of PR #105, B1 and N2 (2026-09-27): measured
 * 74.874 (+210 over 74.664), ceiling 74.894 — measured + 20**, raised before
 * the commit that needs it, inside the authorisation (76.069). The fragment
 * is read inside a `try`, the wait stops when the address changes, the back
 * button wins and the focus goes to the title reached: all on the frame, on
 * the boot on purpose. The trend: 74.596 → 74.664 → 74.874.
 */
/*
 * **Round 1 of the review of PR #105, N1 (2026-09-27): measured 74.895 (+21
 * over 74.874), ceiling 74.915 — measured + 20**, raised before the commit
 * that needs it. What a row says besides its link stays above it: one rule of
 * `lists.css`. The trend: 74.664 → 74.874 → 74.895.
 */
/*
 * **Round 1 of the review of PR #105, N2 in Chromium (2026-09-27): measured
 * 75.019 (+132 over the 74.887 of the axis), ceiling 75.039 — measured + 20**,
 * raised before the commit that needs it, inside the authorisation (76.069).
 * The back button, measured in the browser, still won the first version: the
 * router hears `popstate` first, so the frame decides after the event, once
 * per address, behind a gate that a click opens again. The trend: 74.874 →
 * 74.895 → 74.887 → 75.019.
 */
/*
 * **Feature 016, E3, round 1 of the review of PR #108 (2026-09-28): measured
 * 75.057 (+32 over the 75.025 of E3), ceiling 75.077 — measured + 20**,
 * raised in a commit of its own before the one that needs it, inside the
 * authorisation (76.069), as the direction allowed (§18). The neutral door of
 * the answers of the API leaves the domain chunk two exports more (+16), and
 * the names of the chunks move the rest. The trend: 75.012 → 75.025 → 75.057.
 */
/*
 * **Feature 020, E2, `inRentaSeason` in the barrel (2026-09-27): measured
 * 75.059 (+25 over the 75.034 of round 2 of PR #105), ceiling 75.079 —
 * measured + 20**, raised before the commit that needs it, inside the
 * authorisation (76.069). The rule of the income tax season leaves the lazy
 * tax engine for the settings, so the summary places its tax card on the
 * first paint (Q5). The trend: 75.019 → 75.034 → 75.059.
 */
/*
 * **Feature 020, E2, M2, the first screenful by importance (2026-09-27):
 * measured 75.339 (+280 over 75.059), ceiling 75.359 — measured + 20**,
 * raised before the commit that needs it, inside the authorisation (76.069).
 * The summary reads on its first paint whether it is the season and whether
 * the ledger has an account abroad (`inRentaSeason`, `hasForeignAccountsAt`,
 * from the barrel), and the stylesheet of the boot gains the line of the data,
 * the row of the tax card, the row kept in *Atención* and the pending of one
 * line. The trend: 75.034 → 75.059 → 75.339.
 */
/*
 * **Feature 020, E2, measured in Chromium (2026-09-27): 75.361 (+27 over the
 * 75.334 of M8), ceiling 75.381 — measured + 20**, raised before the commit
 * that needs it, inside the authorisation (76.069). The row kept in
 * *Atención* gets the height of the notice that fills it, so nothing in the
 * first screenful jumps. The trend: 75.339 → 75.334 → 75.361.
 */
/*
 * **Feature 020, E2, measured in Chromium (2026-09-28): 75.392 (+14 over the
 * 75.378 of the kept row at its exact height), ceiling 75.412 — measured +
 * 20**, raised before the commit that needs it, inside the authorisation
 * (76.069). The tax card only draws, so it moves to the boot path and is in
 * its place on the first paint of the season: fetched after it, it pushed
 * the summary of a phone down 213px when it came. The trend: 75.361 → 75.378
 * → 75.392.
 */
/*
 * **Feature 020, E2, `develop` (016 E2-E4) merged in (2026-10-03): measured
 * 75.482, ceiling 75.502 — measured + 20**, inside the authorisation (76.069).
 * The two lines of work raised the boot in parallel; this is their sum.
 */
/*
 * **Feature 020, E3, M9 (2026-10-03): measured 75.580 (+98 over the 75.482 of
 * the start of E3), ceiling 75.600 — measured + 20**, raised before the commit
 * that needs it, inside the authorisation (76.069). The table of the screens
 * learns the privacy mode (`components/columns.ts`: the amounts fused into one
 * column); `DataTable` is on the boot path. The trend: 75.482 → 75.580.
 */
/*
 * **Feature 020, E3, M1 of the contribution (2026-10-03): measured 75.620
 * (+40), ceiling 75.640 — measured + 20**, inside the authorisation (76.069).
 * The share of each part and of each asset of the monthly split, in decimal,
 * rounded when shown. The trend: 75.482 → 75.580 → 75.620.
 */
/*
 * **Feature 020, E3, M5 and the chunk of the charts (2026-10-03): measured
 * 75.593, ceiling unchanged at 75.640.** The strip of each class costs boot
 * (+100), and the group `domain` of `vite.config.ts` stops swallowing the
 * door `@atlas/domain/charts`, which `check-bundle.mjs` had found in the boot
 * chunk (−208 net). The trend: 75.620 → 75.701 → 75.593.
 */
/*
 * **Feature 020, E3, M10 (2026-10-03): measured 75.835 (+242 over the 75.593
 * of the strips), ceiling 75.855 — measured + 20**, inside the authorisation
 * (76.069), which leaves 234 bytes for E4 (estimated at +60). All of it is the
 * stylesheet: the three gauges of the bucket and the dumbbells of its theses
 * (`bucket.css`) are on the boot path with the rest of the styles, and the
 * shared rules of strips, gauges and dumbbells are written once. M14 (styles
 * per screen) is the lever if E4 needs more. The trend: 75.593 → 75.835.
 */
/*
 * **Feature 020, E4, M3 (2026-10-03): measured 75.919 (+97 over the 75.822 of
 * the bucket in percent), ceiling 75.939 — measured + 20**, inside the
 * authorisation (76.069). The stylesheet only: the tokens of the heights of
 * the panels and the rules of the stack. The trend: 75.822 → 75.919.
 */
/*
 * **Feature 020, E4, M12 (2026-10-04): measured 76.019 (+84 over the 75.935 of
 * the committed E4), ceiling 76.044 — measured + 25**, inside the
 * authorisation (76.069), which leaves 45 bytes. The first drawing of the
 * calendar took the boot to 76.636, **over** the authorisation, because the
 * card of the summary carried the list, the notes and the strip; what the
 * season says once the engine has answered now lives in a lazy chunk
 * (`SeasonBody`) and the boot keeps the shell that holds its place, so the
 * boot grows only by the stylesheet of the strip and the wiring (+84). The
 * trend: 75.919 → 75.935 → 76.019.
 */
/*
 * **Feature 020, E4, evolution with the cash (2026-10-04): measured 76.035
 * (+14 over the 76.021 of the deadline marks), ceiling 76.055 — measured +
 * 20**, inside the authorisation (76.069), which leaves 14 bytes. The net
 * worth is the core, the bucket and the cash of the investment accounts
 * (ADR-0004), so the summary draws each book with its own cash instead of a
 * panel of cash that counted it twice: the wiring of the view-model and the
 * card (two labels fewer, one panel fewer). The trend: 76.021 → 76.035.
 */
const BOOT_BUDGET_GZIP_BYTES = 76_055;

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
 *
 * **Raised as feature 010 lands, step by step and always to what is measured
 * plus a margin**, so that every rise carries its own reason instead of one
 * allowance made up front. The prompt of the feature authorises moving this
 * ceiling (not the boot one) to what the tax output measures.
 *
 *  - `tax_return_filed` (ADR-0020): the event, its validation —nested figures,
 *    two shapes by model, no repeated origin and no repeated asset— and the
 *    Spanish of its five refusals in both interfaces. The validation is on the
 *    **read** path, like every other one (see the boot budget above), so the
 *    boot carries most of it. Measured **193,2 KB**, of which the boot is
 *    71,1; the ceiling is 194,2.
 *  - The projection of the filings with their chain, the fingerprint of the
 *    ledger before each one —a canonical digest that `compact` verifies and
 *    seals again— and the two findings of the verification, in both
 *    interfaces. Measured **194,2 KB**, of which the boot is 71,9; the ceiling
 *    is 195,5.
 *  - **The fiscal screen** (block 4), which brings the tax engine into the web
 *    for the first time. Two lazily loaded chunks, measured one by one:
 *    **20,9 KB** the engine itself —the chain of years, the offsetting, the
 *    wash-sale rule, the layout by box with the table of 2025 word for word
 *    from the BOE, and the two informative returns— and **9,1 KB** the screen
 *    and its view-models. Neither is on the boot path: `@atlas/domain/fiscal`
 *    is a door of its own precisely so that the barrel the first screen
 *    imports does not carry them, and the shape check below holds it. The boot
 *    went from 72,2 to **72,8 KB**, which is the shared code the screen uses
 *    (the card, the table, the disclosure), and stays under its ceiling.
 *    Measured total **226,5 KB**; the ceiling is 227,5.
 *  - **Recording what was filed** from the web (block 4): the proposal of a
 *    return in the domain —which figures it declares, how they are named and
 *    what event comes out of them, shared with the console so the two record
 *    the same filing—, the form with a field per figure, and the card of the
 *    summary that leads to the screen and knows when to go first. The card
 *    loads what it needs from the engine **after** the first paint, so the
 *    boot carries none of it: it measures 72,7 KB, lower than before the
 *    screen existed, because the domain now travels in one chunk
 *    (`vite.config.ts`). Measured total **231,5 KB**; the ceiling is 232,5.
 *  - The warning of a year already filed in the four places the web writes —
 *    Registrar, Corregir, Anular and Configuración— with the figures it moves,
 *    and the way into the fiscal screen from Ajustes. The warning asks the
 *    engine from the write layer, which is lazily loaded like the screen, so
 *    the boot does not move: 72,8 KB. Measured total **233,0 KB**; the ceiling
 *    is 234,0.
 *
 * **Trinquete de cierre (2026-09-23)**: measured **233,0 KB** with everything
 * in, and the ceiling stays at 234,0, which is that plus one. The breakdown,
 * checked against the source maps of the 58 chunks —**no module appears in
 * more than one**, so none of this is repetition—: 37,6 the domain without its
 * fiscal half, 25,2 Solid with the router and the shell, 24,6 uPlot (lazy,
 * two screens), **22,3 the tax engine** (of which 17,6 is the table of the
 * boxes of 2025 with their literal labels), 9,9 the stylesheet, **10,5 the
 * fiscal screens and their view-models**, 6,8 the service worker, and the rest
 * the other eleven screens.
 *
 * **Second review of the same day: 234,9 KB, ceiling 236,0.** The 1,9 KB are
 * three things and all three were asked for: the Spanish name of every
 * concept of the return moved into the domain, so the console and the screen
 * cannot call the same figure two different things (**+0,6** on the tax
 * engine chunk, `concepts.ts`); the citation of the official image and the
 * certainty of each box, plus the operations that tell two entries of the
 * same criterion apart (**+0,3** on the fiscal screens); and the rest, spread
 * over the screens that now say more. Checked again on the source maps of the
 * 59 chunks: **zero modules in more than one**. The boot moves 72,8 → **72,9**
 * for `Money.centsText()`, which lives in the core because it replaced six
 * copies of the same two-decimal rule.
 *
 * **Raised to 236,7 by the direction (feature 011), and the reason matters
 * more than the number.** The gaps of the fail-safe took the total from 235,0
 * to **236,0 KB** — 236.022 exactly, which is **23 bytes** over the old
 * ceiling — and the last thing in is the one the user most needs: the screen
 * saying that the pending losses it shows are **not** the ones the engine
 * computed but the ones a filed return declared (block 6). What grew, in
 * order: the empty state of the settled criteria in both interfaces (+0,2),
 * the reason of a reading that predates the supported regime and the closing
 * of the map of reasons (+0,3), the third outcome of the closed-year warning
 * with its three causes in two interfaces (+0,4), and the anchor beside the
 * figure it affects (+0,1).
 *
 * **This ceiling is a ratchet against growth nobody has looked at, not a limit
 * that comes from outside**: nobody charges by the byte, the application is
 * served from its own origin and the total is small for what it does. What
 * protects the user is the other two, and **neither is touched**: the ceiling
 * of the **boot**, which still has half a kilobyte of margin, and the check of
 * **shape**, which forbids the tax engine from travelling in a boot chunk.
 * Giving up telling the user that the figure in front of him is not the one
 * the engine computed, to save twenty-three bytes of a lazily loaded chunk,
 * would be the inversion that decision is there to prevent.
 *
 * The 0,7 is **measured plus what block 8 needs** and no more: its messages —
 * the finding of a fingerprint that could not be verified and the note of the
 * comparison over an unverified prefix— reach both interfaces, and three such
 * texts in two interfaces measured 0,4 in block 5. If block 8 does not fit,
 * the implementer stops again rather than spend a cushion nobody sized.
 * Checked again on the source maps of the 59 chunks: **zero modules in more
 * than one** (296 modules), so none of this is repetition.
 *
 * *Noted for later, deliberately not done here: **17,6 of the 22,3 KB of the
 * tax engine are the literal table of the boxes of 2025**, a datum only needed
 * when the card of the boxes is opened, which could travel in a chunk of its
 * own.*
 *
 * **Trinquete de cierre de la feature 011 (2026-09-23): measured 236,9, and
 * the ceiling comes to 237,9**, which is that plus one, as every time. The
 * 0,7 of the provisional raise was an estimate of what the last block would
 * need and it fell short: it counted the texts and not the new event type with
 * its shape, its label and those of its three fields, nor the projection of
 * the waiver. Measured, block 8 cost **0,9**: the finding and the error in the
 * web (+0,2), the note of the report with its translation (+0,2), the event
 * type (+0,2) and the projection (+0,3).
 *
 * Checked again on the source maps of the 59 chunks: **zero modules in more
 * than one, out of 296**. That datum is worth more than the ceiling: a high
 * ceiling with hidden duplication under it is a real problem, and a ceiling
 * that only rises with things somebody decided to put in is not.
 *
 * **Remeasured after the review of feature 011 (2026-09-23): 237,7**, under
 * the 237,9, so the ceiling stays, with 0,2 of margin. The review cost
 * **0,8** in all (236,8 → 237,7, chunk by chunk against the head of the PR):
 * the boot's 0,2 above; the three fiscal chunks **+0,4**, the anchor by origin
 * and the horizon of the informative returns in `closed-years.ts`; the
 * translations of the two new errors **+0,1**; and the rest, a few bytes
 * spread over chunks that import the domain barrel. Checked again on the
 * source maps: **zero modules in more than one, out of 297** — the extra
 * module is `view-models/fiscal/anchor.ts`, split out of `year.ts` to keep it
 * under the 250 lines of the web; it travels in an existing chunk.
 *
 * **Feature 012, block 0 (2026-09-24): measured 238,9, ceiling 239,9** —
 * measured plus one, as every time. The trend, chunk by chunk against
 * `develop` (237,8): the import of a ledger now asks before replacing one and
 * can read the console's folder, **+1,6** in a lazy chunk of its own
 * (`ImportControls`, with the export and the folder reader it pulls), of
 * which **−1,1** comes back out of the screens that used to carry the export,
 * the folder writer and the choice of storage (`libro`, `ajustes`, `export`,
 * `guard`, `verificacion`); the broker's euros beside the ECB figure in the
 * detail of a movement **+0,4**; the Spanish of the new codes **+0,3**; the
 * field in the forms and its label **+0,2**; and the domain **+0,3** — which
 * is **boot**, see below. The boot itself went **down**, 73,5 → 73,4: the web
 * no longer writes in the folder, and the writer left the boot chunk
 * (**−0,4**), while the domain took **+108 bytes** for the rule of one live
 * correction and **+208 bytes** for the validation of `broker_settled_eur`
 * (measured by taking each out and building again). The direction named the
 * lock and the rule as the only things that may grow the boot; the
 * validation of the new field is said here apart, as it asked. Nothing of the
 * ECB is in the boot, and the shape check below now holds that too.
 *
 * **Feature 012, block 3 (2026-09-24): measured 246,8, ceiling 247,8.** The
 * ECB reaches the web, and all of it lazily: the reading, the resolution, the
 * proposal and the check of the rates, in a chunk of their own (**+3,0**,
 * `ecb`); where the web finds the history — the folder of the console, or a
 * copy imported by hand, the ZIP read with the platform's
 * `DecompressionStream` — (**+1,6**, `history`); the proposal and the
 * confirmation in the form (**+1,8**, `EventForm`); the card «Tipos del BCE»
 * in Ajustes (**+1,4**); and the rest, a few tenths across the chunks that
 * import them. Chunk by chunk against block 2, with **zero modules in more
 * than one chunk out of 313**. The boot moves 73,4 → **73,6** without a byte
 * of the ECB in it (the shape check holds it): the store of the browser, now
 * shared with the lazy screens, had to be kept in the boot chunk by hand
 * (`vite.config.ts`), and what is left is compression across the new border.
 *
 * **Feature 012, block 4 (2026-09-24): measured 251,2, ceiling 252,2.** The
 * rates of the ledger checked against the history, in both interfaces and in
 * the tax report, all of it lazy. Chunk by chunk against block 3: the check
 * itself and its findings with their facts (**+1,6**, `ecb`); the section
 * «Tipos del BCE» of the verification, which says «sin contrastar» and never
 * «sin hallazgos» without a history (**+0,9**); the seven findings of the ECB
 * in the Spanish catalogue of the web (**+0,5**, `attention`); the notes of
 * the report on a line whose rate is in doubt, and their Spanish (**+0,6**,
 * the fiscal chunks and `warnings`); the findings fetched for the fiscal
 * screen (**+0,4**); and the runtime chunk the bundler adds for the new
 * dynamic imports (**+0,2**, lazy). The boot moves 73,6 → **73,7**: 41 bytes
 * of the entry, the table of the new lazy chunks; nothing of the ECB.
 *
 * **Feature 012, block 5 (2026-09-24): measured 256,8, ceiling 257,8.** The
 * drafts of operations whose ECB rate is not published yet, all of it lazy.
 * Chunk by chunk against block 4: the list «Borradores» (**+2,1**); saving a
 * draft from the form and recording it from its values (**+0,4** `EventForm`,
 * **+0,4** the form route); the store of the drafts, the counter of the frame
 * and the saving, three chunks of their own (**+0,6**, **+0,6**, **+0,3**);
 * the names of the list, split out of the chunks that shared them (**+0,6**,
 * with **−0,4** in `prose`); the Spanish of the new errors (**+0,1**); and a
 * few tenths across the chunks that import them.
 *
 * **Feature 012, block 6 (2026-09-24): measured 259,7, ceiling 260,7.** What a
 * change of `fiscal_date_rule` does to the ECB rates (criterion 25), all of it
 * lazy. Chunk by chunk against block 5: the question before saving in
 * «Configuración» and its dialog (**+1,0**, `configuracion`); the proposal of
 * the correction chain in «Verificación», shown whole with the filed returns
 * it reaches (**+1,0**, `verificacion`); the rule itself — the lines a change
 * leaves, the lines to correct and the chain — in the chunk of the ECB
 * (**+0,7**, `ecb`); the write of the chain (**+0,4**, `rate-corrections`);
 * and the two chunks of Spanish errors, now one (**−0,2**). The boot does not
 * move: nothing of it is in the boot, and the shape check holds it.
 *
 * **Review of PR #75 (2026-09-24): measured 261,0, ceiling 262,0.** What the
 * boot sheds does not vanish, it moves to chunks of its own: the folder of
 * the disk and the export and import of the ledger (`folder`, `transfer`), and
 * the list of drafts behind the form route instead of a route of its own —
 * each a few hundred bytes of chunk frame and preload table (**+0,3**) —, and
 * the new note of a rate not contrasted and the import refused when the
 * ledger changed under it (**+0,1**). Final measure with the whole review in:
 * **261,7** (the idempotent confirmation of a draft and the mutants' seams,
 * +0,7 across `EventForm`, `borradores` and `write-step`). The direction accepted the growth of
 * the feature (22,9 KB of new screens and ECB domain, no module in two
 * chunks), with the breakdown written here and the ratchet at the close.
 *
 * **Third pass of the review of PR #75 (2026-09-24): measured 262,1, ceiling
 * 263,0.** Confirming a draft through the domain with the id stamped before
 * writing, conditionally, and refusing a draft that vanished instead of
 * recording it as new (+0,4 across `drafts`, the store of drafts and the
 * Spanish of `draft_changed`), all lazy. The boot does not move (73,7).
 *
 * **Feature 013, block 2 (2026-09-24): measured 263,03 (269.344 bytes),
 * ceiling 263,2.** Only the Spanish of the new codes of the domain of prices
 * (the files of prices that do not read, the configuration, the status, the
 * symbols, the weights that rest on an approximation and the quote without a
 * value in euros), which the messages test demands in both interfaces from the
 * commit that adds the codes: **+0,9** over the 262,1 of `develop` across the
 * two catalogues and the boot of the gate (that one measured apart, in the
 * boot). The screens of the prices come in block 5 and will be measured then;
 * this is not the final measure of the feature.
 *
 * **Feature 013, block 5 (2026-09-25): measured 267,19 (273.607 bytes),
 * ceiling 267,5** — the rule of always (decision P10): the measure plus a
 * small margin, in a commit of its own. Chunk by chunk against `develop`
 * (262,1): the door of the automatic prices and its reader, a chunk of its
 * own (`quotes`, **+2,1**: the lines, the close in force, the ECB conversion,
 * the approximation, the import by hand); the card «Precios automáticos» of
 * Ajustes (**+0,9**, `ajustes`); the Spanish of the codes of prices
 * (**+0,5** across `warnings` and `errors`); the charts chunk, which carries
 * the price marks of the shared components (**+0,5**); the gate in the domain
 * (**+0,3**, the boot, measured apart); and the three screens that pass the
 * quotes to the gate and say their problems (**+0,5** across `cartera`,
 * `PageHeader`, `core`, `history` and `EventForm`). The boot stays in its own
 * ceiling. The trend: 237,9 → 262,1 in feature 012; 262,1 → 267,2 in this one.
 *
 * **Feature 013, after looking at the screens (2026-09-25): measured 267,47
 * (273.891 bytes), ceiling 267,8.** What the screenshots found missing, all
 * lazy: the notices of a quote without its value in euros and of a weight
 * resting on an approximation in the card of the weights, which said
 * «falta el precio» of an asset that had one, and the column «Origen» of the
 * tables of assets on a wide screen, where the source of a price was not said
 * (+0,3 across `cartera`, `cubo` and the price components).
 *
 * **Review of PR #78 (2026-09-25): measured 267,79 (274.219 bytes), ceiling
 * 268,1.** Deleting the prices imported by hand, the other files of `prices/`
 * set aside on import, the newer quote without euros said beside a price, and
 * the note of the approximation in the card of the contribution (+0,3), less
 * what the screens stopped preloading.
 *
 * **Review of PR #80 (2026-09-25): measured 268,74 (275.194 bytes), ceiling
 * 269,0.** The web reads `prices/symbols.json` to leave out the closes stored
 * in a currency their source no longer declares, and says so beside the
 * prices (+0,95, lazy with the quotes).
 *
 * **Second pass of the review of PR #80 (2026-09-25): measured 269,61
 * (276.081 bytes), ceiling 270,0.** The correspondence imported with the
 * prices, the notice of a correspondence missing or that does not read, the
 * closes 013 stored wrong under format 1 and the days a purge owes (+0,87,
 * lazy with the quotes and Ajustes).
 *
 * **Feature 014, the core of the sync (2026-09-25): measured 272,17 (278.700
 * bytes), ceiling 272,3.** All of it lazy: the Spanish sentences of every
 * reason the sync holds a line back, stops or refuses (about fifty codes, and
 * the eighteen failures of the remote one by one) in the catalogue of errors
 * (+2,5). The domain of the sync is not in the bundle yet: nothing of the web
 * imports it until feature 015 gives it a button. The trend: 269,6 → 272,2.
 *
 * **Feature 014, V7 (2026-09-25): measured 272,80 (279.345 bytes), ceiling
 * 273,0.** The web reads whether it is synced before an `acceptInvalid`, from
 * the store of the sync, lazily (+0,6 with the sentence of the refusal).
 *
 * **Review of PR #83 (2026-09-25): measured 273,34 (279.905 bytes), ceiling
 * 273,5.** All of it lazy: the sentences of the new codes (the sync not
 * configured or deactivated, the empty remote, the deactivation refused
 * without a marker) and the new wording of `raw_line_break` in `errors`
 * (+248 bytes), and the write path of the store of the sync — the check of
 * the name of an archive and the shared reader of the marker — in `write`
 * (+293); the rest is hash noise across the lazy chunks.
 *
 * **Feature 015, E1 (2026-09-25): measured 275,55 (282.165 bytes, +2.126),
 * ceiling 276,0.** All of it lazy, inside the authorisation of the direction
 * for the whole feature (+24 KB over 280.064, up to 304.640; Q1 of
 * `specs/015-api-access/questions.md`): the card «Sincronización» of Ajustes
 * with the client of the session (`ajustes` +1.603), the device id this
 * browser keeps (`web-device`, new, 411) and the sentences of
 * `device_forgotten`, `remote_unavailable` and `body_too_large` (`errors`
 * +109); the rest is hash noise. The boot did not move (75.834, −9). The
 * trend: 272,2 → 273,3 → 275,6.
 *
 * **Feature 015, E2 (2026-09-26): measured 276,48 (283.119 bytes, +839 over
 * the 282.280 of E1 closed), ceiling 277,0.** Raised **before** the commit
 * that needs it (the lesson of E1, `questions.md` §10.4), inside the
 * authorisation of Q1 (up to 304.640). All of it lazy: the card «Dispositivos
 * de la consola» of Ajustes with its client (`ajustes` +859); the rest is
 * hash noise (`ecb` +29, `index` +9). The boot: 75.852 against 75.869, +9 of
 * the table of preloads. The trend: 272,2 → 273,3 → 275,6 → 276,5.
 *
 * **Feature 015, E4, P2 and P3 (2026-09-27): measured 284.240 (+811 over the
 * 283.429 of E3 closed, with a prototype built and undone), ceiling 284.496
 * — measured + 256.** Raised **before** the commit that needs it, inside the
 * authorisation of Q1 (up to 304.640). All of it lazy: the refusal to import
 * while synced reads the state of the sync in the same transaction, and the
 * export gives what is held apart — the shared chunk of the domain of the
 * sync, reached now from two lazy chunks. The trend: 272,2 → 273,3 → 275,6 →
 * 276,5 → 277,6.
 *
 * **E4, the device of the web (2026-09-27): measured 284.533 (+293), ceiling
 * 284.789 — measured + 256**, raised before the commit that needs it. Lazy:
 * the sentences of `sync_device_changed`, `sync_device_unknown` and
 * `sync_already_configured` (`errors`), and the key of the device in the
 * store of the sync.
 *
 * **E4, the card of the sync (2026-09-27): measured 297.515 (+13.019 over
 * 284.496), ceiling 297.771 — measured + 256**, raised before the commit that
 * needs it, inside the authorisation of Q1 (up to 304.640). All of it lazy but
 * 104 bytes: `ajustes` +6.783 (the card, the engine of the web and the client
 * of the sync), `sync` +4.884 (the engine of the domain: join, held, resolve),
 * `sync-store` +1.240 (a chunk of its own now, shared by the card and the
 * writer: `write` −254), `ImportControls` +156, the boot +104; the rest is
 * hash noise. The trend: 276,5 → 277,6 → 290,5.
 *
 * **E4, P11 and the card split in three files (2026-09-27): measured 298.392
 * (+711 over 297.681), ceiling 298.648 — measured + 256**, raised before the
 * commits that need it, inside the authorisation (up to 304.640). All lazy
 * but 27: the duplicate question of the filing screen (`presentar` +126 and
 * `DuplicateDialog` +734 as a chunk of its own, against `FormNotices` −448),
 * the closed-year notice of the corporate form (`form` +98), the card of the
 * sync in three files (`ajustes` +221) and the sentences of N11 (`errors`
 * +17). The trend: 277,6 → 290,5 → 291,6.
 *
 * **Review of PR #97, security B1 (2026-09-27): measured 298.730 (+338 over
 * the 298.392 of P11), ceiling 298.986 — measured + 256**, raised before the
 * commit that needs it, inside the authorisation (up to 304.640). All lazy:
 * the engine reads the session before every order and names the device on
 * every request (`ajustes` +325), and the sentences of `sync_device_changed`
 * and `expected_device_required` as failures of the remote (`errors` +67).
 *
 * **Review of PR #97, security B2 and N3 (2026-09-27): measured 299.058
 * (+328), ceiling 299.314 — measured + 256**, raised before the commits that
 * need it. Lazy: the export names what is held back and how many operations
 * it carries, and downloads it from a button of its own (`ImportControls`
 * +357, the chunk of the export). The trend: 291,6 → 291,7 → 292,0.
 *
 * **Review of PR #97, correctness B2 (2026-09-27): measured 299.331 (+273
 * over 299.058), ceiling 299.587 — measured + 256**, raised before the
 * commit that needs it. Lazy: what is held shows its asset, quantity, price
 * and amount through `Amount` (`ajustes` +196); the rest is hash noise.
 *
 * **Review of PR #97, correctness B1 and security N4 and N5 (2026-09-27):
 * measured 300.180 (+849 over 299.331), ceiling 300.436 — measured + 256**,
 * raised before the commit that needs it. Lazy, all of it: the notice of an
 * invalid ledger asks the store of the sync, only when it is painted, whether
 * something is held back (`guard` +397, `sync-store` +167); discarding asks
 * first (`ajustes` +191); a duplicate is confirmed only for the draft it was
 * asked about (`warned` 783, a chunk of its own now with `DuplicateDialog`,
 * −732). A lazy component instead of the inline read split `solid` out of
 * the entry (+606 on the boot) and was dropped. The trend: 292,0 → 292,3 →
 * 293,1.
 */
/*
 * **Feature 015, E5, the door `@atlas/domain/tools` (2026-09-27): measured
 * 301.240 (+941 over 300.299), ceiling 301.496 — measured + 256**, raised
 * before the commit that needs it, inside the authorisation (up to 304.640).
 * The draft of a corporate action, the deep check and the simulation of a
 * transfer leave the boot (−2.166 on it) for a lazy chunk of their own
 * (`tools`), and a chunk more costs its plumbing and its compression apart.
 *
 * **Findings of the live price test (2026-09-27, `fix/prices-live-findings`):
 * measured 301.845 (+406 over the 301.439 of develop, measured the same way),
 * ceiling 302.101 — measured + 256**, set in the merge commit 9e3dfd4
 * together with the code it measures, inside the authorisation (up to
 * 304.640); commits 0df06da to 7461ace were built against the total ceiling
 * of their base, and their boot ceiling is the one they exceed (note of the
 * boot, above). Lazy but 47 (the boot, above): the remedy of a stale rate by its
 * origin (`warnings` +97), the ECB rates of the cash without closes
 * (`quotes` +105), and the hashes of the tables.
 */
/*
 * **Feature 020, E1, the colour of a result only on results (2026-09-27):
 * measured 301.545 (+106 over 301.439), ceiling 301.801 — measured + 256**,
 * raised before the commit that needs it, inside the authorisation (310.500).
 * Two `coloured` flags leave the fiscal criteria and the bucket card: the
 * lazy chunks that name them change their hashes, and every chunk importing
 * them compresses a few bytes worse. No code on the boot. The trend: 301.240
 * → 301.370 → 301.439 → 301.545.
 */
/*
 * **Feature 020, E1, up to M13 (2026-09-27): measured 301.980 (+435 over
 * 301.545), ceiling 302.236 — measured + 256**, raised before the commit that
 * needs it, inside the authorisation (310.500). The boot of M6, M4, M11 and
 * M13 (+288, counted above) and, lazy, the summary in its order by width, the
 * movements without the empty column and the axis with its unit. The trend:
 * 301.545 → 301.518 → 301.692 → 301.768 → 301.980.
 */
/*
 * **Feature 020, E1, `develop` with PR #102 merged in (2026-09-27): measured
 * 302.418 (+352 over the 302.066 of the anchor), ceiling 302.674 — measured +
 * 256**, set in the merge, inside the authorisation (310.500, raised by the
 * direction precisely for #102). The trend: 301.980 → 302.066 → 302.418.
 */
/*
 * **Feature 020, E1, frozen (2026-09-27): measured 302.379 (−39), ceiling
 * 302.635 — measured + 256**, lowered in a commit of its own. The trend:
 * 302.066 → 302.418 → 302.379.
 */
/*
 * **Round 1 of the review of PR #105, N1 (2026-09-27): measured 302.638 (+125
 * over the 302.513 of B1 and N2, +259 over 302.379), ceiling 302.894 —
 * measured + 256**, raised before the commit that needs it, inside the
 * authorisation (310.500). The trend: 302.379 → 302.513 → 302.638.
 */
/*
 * **Feature 016, E2, round 1 of the review of PR #106, with `develop` (PR
 * #105) merged in (2026-09-28): measured 302.935 (+297 over the 302.638 of
 * PR #105), ceiling 303.191 — measured + 256**, raised in the commit after the
 * merge, inside the authorisation (310.500). All of it lazy: the stricter
 * reader of `prices/symbols.json` (no key of its own, no prototype) and the
 * sentence of `symbols_file_unknown_key`. The boot does not move (75.011,
 * under 75.039). The trend: 302.379 → 302.638 → 302.935.
 */
/*
 * **Feature 016, E2, round 2 of the review of PR #106 (2026-09-28): measured
 * 303.195 (+260 over the 302.935 of round 1), ceiling 303.451 — measured +
 * 256**, raised in a commit of its own, inside the authorisation (310.500).
 * All of it lazy: the refusal of a key twice in every JSON of `prices/`
 * (`json_key_repeated`, kept off the boot in `quotes/repeated-key.ts`) and its
 * sentence. The boot moves by 1 byte (75.012, under 75.039). The trend:
 * 302.638 → 302.935 → 303.195.
 */
/*
 * **Feature 016, E3, block 2 (2026-09-28): measured 304.746 (+1.551 over the
 * 303.195 of E2), ceiling 305.002 — measured + 256**, raised in a commit of
 * its own before the one that needs it, inside the authorisation (310.500).
 * All of it lazy: the download of the ECB history from the cloud in the
 * section of Ajustes (+1.090, with the client of the reference data), the
 * store of the imported copy in a chunk of its own (+251) and the strict
 * reading of the manifest in the chunk of the ECB (+208). The boot moves +21
 * (75.033, under 75.039): `mergeSettings` leaving `notification_email` out
 * (+14, P12) and the hashes of the chunk names (+7). The mobile prices do not
 * fit what is left of §8.1 P13 for the feature, and are not built (Q8). The
 * trend: 302.935 → 303.195 → 304.746.
 */
/*
 * **Feature 016, E3, round 1 of the review of PR #108 (2026-09-28): measured
 * 305.394 (+558 over the 304.836 of E3), ceiling 305.650 — measured + 256**,
 * raised in a commit of its own before the one that needs it, inside the
 * authorisation (312.000). All of it lazy: erasing the copy of the ECB of this
 * browser with its confirmation (+463 in the section of Ajustes, with the cap
 * of 20 MB of the client), and the neutral door of the answers of the API.
 * The trend: 303.195 → 304.836 → 305.394.
 */
/*
 * **Feature 020, E2, M2 (2026-09-27): measured 303.708 (+935 over the
 * 302.773 of round 2 of PR #105), ceiling 303.964 — measured + 256**, raised
 * before the commit that needs it, inside the authorisation (310.500). The
 * boot above (+305), and lazy: the summary in its order by the season, the
 * tax card in its two shapes and the slot of the 720 in *Atención*. The
 * trend: 302.785 → 302.773 → 303.708.
 */
/*
 * **Feature 020, E2, M8 (2026-09-27): measured 304.198 (+490 over 303.708),
 * ceiling 304.454 — measured + 256**, raised before the commit that needs it,
 * inside the authorisation (310.500). Lazy, all of it: the list of a phone by
 * month, the valuations of a day gathered into one row that unfolds, and the
 * recent movements of the summary made a chunk at a time. The trend: 302.773
 * → 303.708 → 304.198.
 */
/*
 * **Feature 020, E2 (2026-09-28): measured 303.708 (−537), ceiling lowered to
 * 303.964 — measured + 256.** The tax card of the summary is no longer a chunk
 * of its own: it went to the boot path, and its wrapper and its load went
 * with it. The trend: 304.198 → 304.245 → 303.708.
 */
/*
 * **Feature 020, E2, `develop` (016 E2-E4) merged in (2026-10-03): measured
 * 306.434, ceiling 306.690 — measured + 256**, inside the authorisation
 * (312.000). The two lines of work raised the total in parallel; this is
 * their sum.
 */
/*
 * **Feature 020, E3, M9 (2026-10-03): measured 306.952 (+518 over the 306.434
 * of the start of E3), ceiling 307.208 — measured + 256**, inside the
 * authorisation (312.000). Of those, +98 are the boot (above); the rest is the
 * door `@atlas/domain/charts` with its two functions, the columns of the
 * theses, the positions and the costs, and their percentages. The trend:
 * 306.434 → 306.952.
 */
/*
 * **Feature 020, E3, M1 of the contribution (2026-10-03): measured 307.271
 * (+319), ceiling 307.527 — measured + 256**, inside the authorisation
 * (312.000). Of those, +40 are the boot (above). The trend: 306.434 → 306.952
 * → 307.271.
 */
/*
 * **Feature 020, E3, M5 and the chunk of the charts (2026-10-03): measured
 * 307.720 (+449 over the 307.271 of the shares), ceiling 307.976 — measured +
 * 256**, inside the authorisation (312.000). The trend: 307.271 → 307.720.
 */
/*
 * **Feature 020, E3, M10 (2026-10-03): measured 309.810 (+2.090 over the
 * 307.720 of the strips), ceiling 310.066 — measured + 256**, inside the
 * authorisation (312.000), which leaves 2.190 bytes for E4 (estimated at
 * +3.150: **it does not fit as estimated**, plan §6.3 has the order of cuts).
 * Of those, +242 are the boot (above); the lazy chunk of the Cubo carries the
 * gauges, the dumbbells and their view-model (+1,8 KB gzip). The trend:
 * 307.720 → 309.810.
 */
/*
 * **Feature 020, E4, «Este año» (2026-10-03): measured 310.152 (+321 over the
 * 309.831 of the start of E4), ceiling 310.408 — measured + 256**, inside the
 * authorisation (312.000), which is **not** raised. Of those, about +200 are
 * the filing deadlines and the calendar of the domain (commit before), which
 * the chunk of the fiscal screen already carries; the boot is −4. The trend:
 * 309.831 → 310.152.
 */
/*
 * **Feature 020, E4, M7 (2026-10-03): measured 310.725 (+573 over the 310.152
 * of «Este año»), ceiling 310.981 — measured + 256**, inside the authorisation
 * (312.000), which leaves 1.275 bytes for M3 and M12 (estimated at +2.500: the
 * cuts of plan §6.3 come first). The boot is −4 (above). The trend: 310.152 →
 * 310.725.
 */
/*
 * **Feature 020, E4, M3 (2026-10-03): measured 311.983 (+1.258 over the
 * 310.725 of the bucket in percent), ceiling 312.000 — the authorisation, not
 * measured + 256**: there are 17 bytes left, and M12 does not fit in them
 * (the cuts of plan §6.3 come before it). Of those, the stack of three charts
 * and its step (`Chart`, `SeriesCard`), the contributions of the domain in a
 * chunk of the charts that the summary and the bucket share, and the column of
 * the table. The trend: 310.725 → 311.983.
 */
/*
 * **Feature 020, E4, M12 (2026-10-04): measured 314.661 (+2.714 over the
 * 311.947 of the committed E4), ceiling 314.951 — measured + 256**, inside the
 * authorisation (500.000, «decisión de la persona, 04/10»). Chunk by chunk,
 * gzip: the strip and its short version (1.340, lazy, shared by `/fiscal` and
 * the summary), the card of the list with the route (+0,6 KB), the lazy body
 * of the season card (+0,9 KB) and the boot (+84). The trend: 311.947 →
 * 314.661.
 */
/*
 * **Feature 020, E4, deadlines (2026-10-04): measured 314.917 (+256 over the
 * 314.661 of the calendar), ceiling 315.173 — measured + 256**, inside the
 * authorisation (500.000). All of it is the lazy chunk of the fiscal screen:
 * the table of deadlines with its `verified` mark and the notes that say why
 * three years are not (domain commit before) and the «sin verificar» of the
 * row. The boot is +2 (76.021). The trend: 314.661 → 314.917.
 */
/*
 * **Feature 020, E4, evolution with the cash (2026-10-04): measured 315.154
 * (+237 over the 314.917 of the deadline marks), ceiling 315.410 — measured +
 * 256**, inside the authorisation (500.000). The book value with its own cash
 * (`bookCashSeries`, lazy, in the chunk of the charts) and the view-model that
 * puts it in place of the three blocks; the boot is +14 (above). The trend:
 * 314.917 → 315.154.
 */
/*
 * **Feature 020, E4, the bucket with nothing to compare (2026-10-04): measured
 * 315.489 (+335 over the 315.154 of the evolution), ceiling 315.745 — measured
 * + 256**, inside the authorisation (500.000). The reason a point has no
 * percentage (domain commit before) and the card of the bucket that says it
 * instead of a band of «sin precios»: all lazy, in the chunk of the Cubo. The
 * boot is −11 (76.024, ceiling unchanged). The trend: 315.154 → 315.489.
 */
/*
 * **Feature 022 (ADR-0035, E2a), by decision of the direction (2026-10-06):
 * measured 320.215, ceiling 320.500 — measured + 285**, inside the
 * authorisation (500.000). The cloud boot (`ledger/cloud.ts` with
 * `ApiLedgerStore` and the HTTP client, 1,8 KB gzip), the gate screen
 * (`CloudGate`, 0,9 KB) and the chunks the lazy local path splits into are all
 * lazy; the boot is not touched (75.949, ceiling 76.055). **E2b and E5 give the
 * room back** (they retire the local ledger and the queue); the ceiling comes
 * back down then. The trend: 315.489 → 320.215.
 */
/*
 * **Feature 023, E2b (2026-10-06): the local ledger, import, folder, sync card
 * and drafts leave the product; measured ≈ 289.4 KB (−25 KB against the 320.215
 * of E2a), ceiling 296.500 (rejection messages by reason, the session notice
 * and the pending-write notice came after the first figure).** The boot ceiling
 * is not touched; E5 lowers the total to what is measured.
 */
const TOTAL_BUDGET_GZIP_BYTES = 296_500;

/**
 * What the direction authorised, which **no ceiling may pass** (feature 020,
 * E1, block 1; prompt 020 §8.1, the accepted preference). The ceilings above
 * follow what is measured, twenty bytes at a time; these two do not move with
 * any improvement. Raising one is a decision of the direction, written in the
 * prompt of the feature, never a commit of an improvement: a ceiling raised
 * over its authorisation does not build green.
 *
 *   - Boot: 76.069, prompt 015 §7 P13, still standing (prompt 020 §5).
 *   - Total: 500.000, raised by the person on 2026-10-04 («decisión de la
 *     persona, 04/10»): feature 020 E4 stopped at 313.523 against 312.000
 *     (`specs/020-visual-refresh/questions.md` §13.3) and the person chose to
 *     give the web room instead of cutting merged improvements. It replaces
 *     the 312.000 below. The discipline of the ceilings does not change: each
 *     one stays at what is measured plus a small margin (plan §6.4), and this
 *     is a wall, not a target.
 *   - Before: 312.000, raised by the direction on 2026-09-28 for the whole web,
 *     because features 016 and 020 grow at the same time
 *     (`specs/016-scheduled-jobs/questions.md` §18, Q19); before, 310.500,
 *     raised on 2026-09-27 over the 309.500 of prompt 020 §8 P1, for the
 *     prices of PR #102 (`specs/020-visual-refresh/questions.md` §4.1).
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
if (TOTAL_BUDGET_GZIP_BYTES > TOTAL_AUTHORISED_GZIP_BYTES) {
  problems.push(
    `el techo del total (${TOTAL_BUDGET_GZIP_BYTES}) pasa de lo autorizado (${TOTAL_AUTHORISED_GZIP_BYTES}): subir una autorización es cosa de la dirección`,
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
  { path: "/packages/adapters/src/ledger-store/browser/drafts.ts", what: "los borradores" },
  { path: "/src/ledger/draft-store.ts", what: "los borradores" },
  { path: "/src/ledger/drafts.ts", what: "los borradores" },
  { path: "/src/shell/draft-counter.ts", what: "el contador de borradores" },
  { path: "/src/routes/registrar/borradores.tsx", what: "la lista de borradores" },
  // Review of PR #75: a folder of the disk and the export and import of the
  // ledger are not the boot's either.
  {
    path: "/packages/adapters/src/ledger-store/browser/folder.ts",
    what: "el acceso a una carpeta",
  },
  { path: "/packages/adapters/src/ledger-store/browser/transfer.ts", what: "exportar e importar" },
  // Block 6: the correction chain of the rates after a change of rule.
  { path: "/src/ledger/rate-corrections.ts", what: "la corrección de los tipos del BCE" },
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
  // Feature 015: **nothing of the access on the boot path**, from its first
  // commit. The rules of the access are the API's and never the web's (the
  // architecture test keeps the web from reaching them at all); the session,
  // the devices and the screens of the sync are a lazy section of Ajustes.
  { path: "/packages/domain/src/access/", what: "las reglas del acceso" },
  { path: "/packages/domain/src/access.ts", what: "la puerta del acceso" },
  {
    path: "/packages/adapters/src/ledger-store/browser/web-device.ts",
    what: "el identificador del dispositivo de la web",
  },
  { path: "/src/sync/", what: "la sesión y la sincronización de la web" },
  { path: "/src/routes/ajustes/sync/", what: "la sección de sincronización de Ajustes" },
  { path: "/packages/domain/src/sync.ts", what: "la puerta de la sincronización" },
  { path: "/packages/domain/src/ports/remote-ledger.ts", what: "el puerto del remoto" },
  {
    path: "/packages/domain/src/ports/sync-state-store.ts",
    what: "el puerto del estado de la sincronización",
  },
  { path: "/packages/adapters/src/sync/", what: "la orquestación de la sincronización" },
  {
    path: "/packages/adapters/src/ledger-store/browser/sync-store.ts",
    what: "el estado de la sincronización en el navegador",
  },
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
  // Feature 014 (D-Q17) kept the client of the sync, its orchestration, the
  // engine of the domain and the writer of the store out of the web until
  // P2 and P3 were in. They are (feature 015, E4), and the web configures the
  // sync from one lazy module, `src/sync/engine.ts`: LAZY_ONLY keeps all of it
  // off the boot, and `tests/api-access.test.ts` keeps it to that module.
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
 * **Who may start an order of the sync of the web** (review of PR #97, N1 of
 * round 1 and B1 of round 2, blocking by decision of the direction), read on
 * the real graph, with who imports each module, statically or with
 * `import()`:
 *
 * - the section of the sync in Ajustes has **one door**, its card
 *   `SessionCard`, and only the page of Ajustes goes through it: any other
 *   importer of a module of the section — the controller, a relay of it, a
 *   root-absolute path — is refused;
 * - the **reverse closure** of the engine — every module that reaches it, by
 *   any path, walked whole — is the section, the engine, the page of Ajustes
 *   and the lazy load of that page (`App.tsx`, `main.tsx` and the
 *   `index.html` that loads it), and those three **only as ancestors through
 *   the page** (round 3, O1).
 *
 * Any other importer could sync at boot, on a timer or when the connection
 * comes back. A graph that does not say who imports is refused as such.
 */
const WEB_ENGINE = /(^|\/)apps\/web\/src\/sync\/engine(-held)?\.[jt]s$/;
const SECTION = /(^|\/)apps\/web\/src\/routes\/ajustes\/sync\/[^/]+\.[jt]sx?$/;
const SECTION_DOOR = /(^|\/)apps\/web\/src\/routes\/ajustes\/sync\/SessionCard\.[jt]sx$/;
const AJUSTES_PAGE = /(^|\/)apps\/web\/src\/routes\/ajustes\/index\.[jt]sx$/;
const AJUSTES_LOADERS = /(^|\/)apps\/web\/(src\/(App|main)\.[jt]sx?|index\.html)$/;
const importersOf = new Map();
for (const build of builds) {
  for (const chunk of build.chunks ?? []) {
    for (const module of chunk.modules) {
      if (!Array.isArray(module.importers)) {
        problems.push(`${build.label}${chunk.file}: el grafo no dice quién importa ${module.id}`);
        continue;
      }
      importersOf.set(module.id, [...(importersOf.get(module.id) ?? []), ...module.importers]);
    }
  }
}
for (const [id, importers] of importersOf) {
  if (!SECTION.test(id)) {
    continue;
  }
  for (const importer of importers.filter((each) => !SECTION.test(each))) {
    if (!(SECTION_DOOR.test(id) && AJUSTES_PAGE.test(importer))) {
      problems.push(
        `${importer} importa ${id}, un módulo de la sección de la sincronización que no es su puerta`,
      );
    }
  }
}
/** Every module that reaches the engine through its importers, the page not walked past when told. */
const closureOfEngine = (barrier) => {
  const reached = new Set();
  const pending = [...importersOf.keys()].filter((id) => WEB_ENGINE.test(id));
  while (pending.length > 0) {
    const id = pending.shift();
    if (reached.has(id)) {
      continue;
    }
    reached.add(id);
    if (!(barrier && AJUSTES_PAGE.test(id))) {
      pending.push(...(importersOf.get(id) ?? []));
    }
  }
  return reached;
};
// The whole reverse closure, walked past the loaders too (review of PR #97,
// round 3, O1): whatever imports a loader to reach the engine is in it.
for (const id of closureOfEngine(false)) {
  const allowed =
    WEB_ENGINE.test(id) || SECTION.test(id) || AJUSTES_PAGE.test(id) || AJUSTES_LOADERS.test(id);
  if (!allowed) {
    problems.push(
      `${id} alcanza el motor de la sincronización de la web desde fuera de su sección`,
    );
  }
}
// And the loaders are admitted **only as ancestors through the page**: with
// the page as a barrier, none of them reaches the engine.
for (const id of closureOfEngine(true)) {
  if (AJUSTES_LOADERS.test(id)) {
    problems.push(
      `${id} alcanza el motor de la sincronización de la web desde fuera de su sección, sin pasar por la página de Ajustes`,
    );
  }
}
// And the engine itself is imported only by the section and by itself: a
// loader that imported it straight would not be caught by the closure above.
for (const [id, importers] of importersOf) {
  if (!WEB_ENGINE.test(id)) {
    continue;
  }
  for (const importer of importers.filter(
    (each) => !SECTION.test(each) && !WEB_ENGINE.test(each),
  )) {
    problems.push(
      `${importer} alcanza el motor de la sincronización de la web desde fuera de su sección (${id})`,
    );
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
