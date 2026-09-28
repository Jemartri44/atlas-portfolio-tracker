// Feature 016, block 1 of E1: the guardians of the scheduled jobs, written
// **before** the jobs exist and seen failing against empty modules
// (`specs/016-scheduled-jobs/questions.md`, E1). They walk the real import
// graph (`tests/support/source-graph.ts`: static imports, re-exports and
// literal `import()`, across packages through `exports`), never a list of
// names; the authoritative check of the web is still the graph of its bundle
// (`apps/web/scripts/check-bundle.mjs`, `FORBIDDEN_IN_WEB`).

import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adaptersRoot,
  apiRoot,
  chainText,
  cliSrc,
  domainRoot,
  exportsOf,
  jobsRoot,
  listSources,
  packages,
  parse,
  productSources,
  reach,
  repoRoot,
  resolveAcross,
  webReach,
} from "./support/source-graph.js";

const jobsSrc = join(jobsRoot, "src");
const sep = String.raw`[/\\]`;

/** The code of the tasks: the application, and the rules of the jobs in the domain. */
const TASK_CODE = new RegExp(
  `${sep}apps${sep}jobs${sep}|${sep}domain${sep}src${sep}jobs(\\.ts$|${sep})`,
);
/** What sends mail, and the port that says what a mail is. */
const MAIL = new RegExp(
  `${sep}adapters${sep}src${sep}aws${sep}(sdk-ses|mail)\\.ts$|${sep}domain${sep}src${sep}ports${sep}notifier\\.ts$`,
);
/** What reads the keys of the price sources in the cloud (E2), and the sources themselves. */
const PRICE_KEYS = new RegExp(
  `${sep}adapters${sep}src${sep}aws${sep}price-keys\\.ts$|${sep}adapters${sep}src${sep}prices${sep}(eodhd|alpha-vantage|secrets)\\.ts$`,
);

/**
 * What writes the history of the ECB and the closes in the bucket, and the
 * simulated source of `dev` (E2): only the daily tasks of the jobs use them.
 */
const DAILY_WRITERS = new RegExp(
  `${sep}adapters${sep}src${sep}aws${sep}(daily|s3-ecb-store|s3-price-store|simulated-prices)\\.ts$`,
);

const exists = (file: string): boolean =>
  statSync(file, { throwIfNoEntry: false })?.isFile() === true;

const violationsOf = (reached: Map<string, string[]>, rule: RegExp): string[] =>
  [...reached]
    .filter(([file]) => file.startsWith("<") || rule.test(file))
    .map(([, chain]) => chainText(chain));

describe("architecture (016): the jobs are reached by nothing that faces a user", () => {
  it("has the files it guards, so no rule below passes by looking at nothing", () => {
    for (const file of [
      join(jobsSrc, "lambda.ts"),
      join(jobsSrc, "compose.ts"),
      join(jobsSrc, "handler.ts"),
      join(jobsSrc, "tasks", "mail.ts"),
      join(domainRoot, "src", "jobs.ts"),
      join(domainRoot, "src", "ports", "notifier.ts"),
      join(adaptersRoot, "src", "aws", "mail.ts"),
      join(adaptersRoot, "src", "aws", "sdk-ses.ts"),
    ]) {
      expect(exists(file), relative(repoRoot, file)).toBe(true);
    }
  });

  it("keeps the code of the tasks out of the web, the console and the API", () => {
    const roots = [
      ...listSources(join(repoRoot, "apps", "web", "src")),
      ...listSources(cliSrc),
      ...listSources(join(apiRoot, "src")),
    ];
    expect(violationsOf(reach(roots), TASK_CODE)).toEqual([]);
  });

  it("keeps the mail and the keys of the sources out of the API and the web (B2)", () => {
    const api = reach([join(apiRoot, "src", "lambda.ts"), ...listSources(join(apiRoot, "src"))]);
    expect(violationsOf(api, MAIL)).toEqual([]);
    expect(violationsOf(api, PRICE_KEYS)).toEqual([]);
    const web = webReach();
    expect(violationsOf(web, MAIL)).toEqual([]);
    expect(violationsOf(web, PRICE_KEYS)).toEqual([]);
    const sesv2 = productSources().filter(
      (file) =>
        parse(file).specifiers.some((specifier) => specifier.startsWith("@aws-sdk/client-sesv2")) &&
        !/[/\\]adapters[/\\]src[/\\]aws[/\\]sdk-ses\.ts$/.test(file),
    );
    expect(sesv2.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  it("keeps the daily writers and the simulated source out of the API, the web and the console (E2)", () => {
    const roots = [
      join(apiRoot, "src", "lambda.ts"),
      ...listSources(join(apiRoot, "src")),
      ...listSources(cliSrc),
    ];
    expect(violationsOf(reach(roots), DAILY_WRITERS)).toEqual([]);
    expect(violationsOf(webReach(), DAILY_WRITERS)).toEqual([]);
  });

  it("keeps the daily writers out of the mail task (E2)", () => {
    const mail = reach([join(jobsSrc, "tasks", "mail.ts")]);
    expect(violationsOf(mail, DAILY_WRITERS)).toEqual([]);
  });

  it("keeps the keys of the sources out of the mail task (B2)", () => {
    const mail = reach([join(jobsSrc, "tasks", "mail.ts")]);
    expect(mail.size).toBeGreaterThan(1);
    expect(violationsOf(mail, PRICE_KEYS)).toEqual([]);
  });
});

describe("architecture (016): the warnings of January reach no price (E4, mutant 31)", () => {
  /**
   * No price reaches the fiscal path, not even a warning (§0 of the prompt;
   * ADR-0031, second amendment). The income tax and the thresholds of the 720
   * and 721 are decided in the domain by functions that take the ledger and
   * the day, and reach nothing price-aware — the same rule that closes the
   * 720 (`tests/architecture.test.ts`). The task composes them in a module of
   * its own that reads no close: not `reference.ts`, not the door of the
   * quotes, not a projection that takes the external prices.
   */
  const PRICE_AWARE = new RegExp(
    `${sep}domain${sep}src${sep}(projections${sep}prices\\.ts$|quotes(\\.ts$|${sep}))`,
  );
  const fiscal = join(jobsSrc, "tasks", "fiscal.ts");

  it("decides the income tax and the 720 in the domain with nothing price-aware", () => {
    for (const file of ["informative.ts", "tax-return.ts"]) {
      const reached = reach([join(domainRoot, "src", "jobs", file)]);
      expect(reached.size, file).toBeGreaterThan(5);
      expect(violationsOf(reached, PRICE_AWARE), file).toEqual([]);
    }
    // Not vacuous: the weekly review, which values with the closes, does reach them.
    expect(
      violationsOf(reach([join(domainRoot, "src", "jobs", "review.ts")]), PRICE_AWARE).length,
    ).toBeGreaterThan(0);
  });

  /**
   * **The graph of the fiscal task, name by name** (review of PR #109, avisos
   * N3): a list of forbidden names is dodged by one more name of a barrel that
   * values with the closes (`reviewFacts`, `positionsDocument`…). So every
   * module of the application the task reaches is listed, and every **value**
   * each of them takes from a package is listed too: a new one fails here
   * until somebody looks at it. Types run nothing and are left alone. And the
   * store of the bucket reaches the task only through its scope (`ledger/`
   * and `reference/ecb/`), which the behaviour test holds.
   */
  it("composes them in a module whose graph takes from the packages only what it lists", () => {
    expect(exists(fiscal)).toBe(true);
    const reached = [...reach([fiscal]).keys()].filter((file) => file.startsWith(jobsSrc));
    expect(reached.map((file) => relative(repoRoot, file)).sort()).toEqual([
      "apps/jobs/src/ecb-history.ts",
      "apps/jobs/src/ledger.ts",
      "apps/jobs/src/log.ts",
      "apps/jobs/src/run.ts",
      "apps/jobs/src/scoped-objects.ts",
      "apps/jobs/src/tasks/fiscal.ts",
      "apps/jobs/src/tasks/send.ts",
    ]);
    const values = reached
      .flatMap((file) =>
        parse(file)
          .bindings.filter((binding) => binding.specifier.startsWith("@atlas/") && !binding.isType)
          .map((binding) => `${relative(repoRoot, file)} ${binding.specifier} ${binding.name}`),
      )
      .sort();
    expect(values).toEqual(
      [
        "apps/jobs/src/ecb-history.ts @atlas/adapters/aws referenceReader",
        "apps/jobs/src/ecb-history.ts @atlas/domain/ecb DEFAULT_LOCAL_CONFIG",
        "apps/jobs/src/ecb-history.ts @atlas/domain/ecb readEcbHistory",
        "apps/jobs/src/ecb-history.ts @atlas/domain/jobs activeHistoryOf",
        "apps/jobs/src/ledger.ts @atlas/adapters/aws DependencyUnavailable",
        "apps/jobs/src/ledger.ts @atlas/adapters/aws appendOnlyLedger",
        "apps/jobs/src/ledger.ts @atlas/domain CURRENT_LEDGER_SCHEMA",
        "apps/jobs/src/ledger.ts @atlas/domain DomainError",
        "apps/jobs/src/ledger.ts @atlas/domain decodeLines",
        "apps/jobs/src/ledger.ts @atlas/domain projectLedger",
        "apps/jobs/src/ledger.ts @atlas/domain settingsAt",
        "apps/jobs/src/ledger.ts @atlas/domain/sync linesOfText",
        "apps/jobs/src/run.ts @atlas/adapters/aws-jobs JobsStore",
        "apps/jobs/src/run.ts @atlas/adapters/aws-jobs JobsWriteConflict",
        "apps/jobs/src/run.ts @atlas/domain/jobs JOB_TASKS",
        "apps/jobs/src/run.ts @atlas/domain/jobs claimRecord",
        "apps/jobs/src/run.ts @atlas/domain/jobs nextStep",
        "apps/jobs/src/run.ts @atlas/domain/jobs recordIn",
        "apps/jobs/src/tasks/fiscal.ts @atlas/domain/ecb checkLedgerRates",
        "apps/jobs/src/tasks/fiscal.ts @atlas/domain/jobs frequencyOf",
        "apps/jobs/src/tasks/fiscal.ts @atlas/domain/jobs informativeFacts",
        "apps/jobs/src/tasks/fiscal.ts @atlas/domain/jobs informativeMail",
        "apps/jobs/src/tasks/fiscal.ts @atlas/domain/jobs lastDayOfWindow",
        "apps/jobs/src/tasks/fiscal.ts @atlas/domain/jobs ledgerFailureKind",
        "apps/jobs/src/tasks/fiscal.ts @atlas/domain/jobs taxReturnFacts",
        "apps/jobs/src/tasks/fiscal.ts @atlas/domain/jobs taxReturnMail",
      ].sort(),
    );
    // The store of the bucket: scoped, and then read only inside the scope.
    expect(
      parse(fiscal)
        .code.split("\n")
        .filter((line) => /\bdeps\.objects\b/.test(line))
        .map((line) => line.trim()),
    ).toEqual([
      "deps: { ...context.deps, objects: scopedObjects(context.deps.objects, FISCAL_SCOPE) },",
      "history = await readCloudEcbHistory(context.deps.objects);",
    ]);
  });
});

describe("architecture (016): one writer per object in prices/ (P18, M5)", () => {
  /**
   * The code of the cloud — the application of the jobs and the adapters of
   * AWS it reaches — never writes `prices/symbols.json`, whose one writer is
   * `atlas admin prices push`, and never names `prices/config.json`, which
   * does not exist in the cloud: the budgets, the order of the sources and the
   * threshold are configuration of the function. The domain is shared with
   * the console and is not looked at here.
   */
  const cloudCode = (): string[] =>
    [...reach([join(jobsSrc, "lambda.ts")]).keys()].filter((file) =>
      new RegExp(`${sep}apps${sep}jobs${sep}src${sep}|${sep}adapters${sep}src${sep}aws${sep}`).test(
        file,
      ),
    );

  it("finds the code it looks at, the store of the prices included", () => {
    const files = cloudCode().map((file) => relative(repoRoot, file));
    expect(files).toContain("apps/jobs/src/tasks/prices.ts");
    expect(files).toContain("packages/adapters/src/aws/s3-price-store.ts");
  });

  it("never names the file of the budget of the console", () => {
    const offenders = cloudCode().filter((file) =>
      /config\.json|PRICE_CONFIG_FILE/.test(parse(file).code),
    );
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  it("only reads the correspondence of symbols, never writes it", () => {
    const offenders = cloudCode().flatMap((file) =>
      parse(file)
        .code.split("\n")
        .filter((line) => /symbols\.json|\bSYMBOLS\b/.test(line) && /put|write/i.test(line))
        .map((line) => `${relative(repoRoot, file)}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("architecture (016): no alias of `imports` escapes the graph (review of PR #106, N1)", () => {
  /**
   * A specifier that starts with `#` is an alias of the `imports` field of a
   * `package.json`: the graph cannot follow it, and a guard that resolved it
   * to nothing would pass looking at nothing. It fails closed, and the
   * product has no such field at all.
   */
  it("takes a # alias for something it cannot see, never for nothing", () => {
    expect(resolveAcross(packages(), join(apiRoot, "src", "handler.ts"), "#daily")).toBe(
      "<unresolved #daily>",
    );
  });

  it("finds no `imports` in any package.json of the product", () => {
    const manifests = [
      join(repoRoot, "package.json"),
      ...["apps", "packages"].flatMap((folder) =>
        readdirSync(join(repoRoot, folder)).map((name) =>
          join(repoRoot, folder, name, "package.json"),
        ),
      ),
    ].filter(exists);
    expect(manifests.length).toBeGreaterThanOrEqual(7);
    const withImports = manifests.filter((file) =>
      Object.hasOwn(JSON.parse(readFileSync(file, "utf8")) as object, "imports"),
    );
    expect(withImports.map((file) => relative(repoRoot, file))).toEqual([]);
  });
});

describe("architecture (016): one module per export (round 2 of the review of PR #106, R2-N3)", () => {
  /**
   * `exports` can name one module for `types` — what the graph read — and
   * another for `import` — what the bundler takes. The graph now resolves
   * every condition and fails when they differ, and the product has no such
   * export at all.
   */
  const manifests = (): string[] =>
    [
      join(repoRoot, "package.json"),
      ...["apps", "packages"].flatMap((folder) =>
        readdirSync(join(repoRoot, folder)).map((name) =>
          join(repoRoot, folder, name, "package.json"),
        ),
      ),
    ].filter(exists);

  /** Every target a condition names, at any depth. */
  const targets = (value: unknown): string[] =>
    typeof value === "string"
      ? [value]
      : typeof value === "object" && value !== null
        ? Object.values(value).flatMap(targets)
        : [];

  /** The module a target names: its source, whatever its extension. */
  const moduleOf = (target: string): string =>
    target.replace(/^\.\/dist\//, "./").replace(/\.d\.ts$|\.js$|\.ts$/, "");

  it("finds no export whose conditions name different modules in the product", () => {
    const mixed = manifests().flatMap((file) => {
      const exported = (JSON.parse(readFileSync(file, "utf8")) as { exports?: unknown }).exports;
      if (typeof exported !== "object" || exported === null) {
        return [];
      }
      return Object.entries(exported)
        .filter(([, target]) => new Set(targets(target).map(moduleOf)).size > 1)
        .map(([subpath]) => `${relative(repoRoot, file)} ${subpath}`);
    });
    expect(manifests().length).toBeGreaterThanOrEqual(7);
    expect(mixed).toEqual([]);
  });

  it("refuses to read a package whose conditions name different modules", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-exports-"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        exports: {
          "./innocent": { types: "./dist/clock/system.d.ts", import: "./dist/aws/daily.js" },
        },
      }),
    );
    expect(() => exportsOf(root)).toThrow(/\.\/innocent/);
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        exports: {
          "./same": { types: "./dist/a/b.d.ts", import: "./dist/a/b.js", default: "./dist/a/b.js" },
        },
      }),
    );
    expect(exportsOf(root).get("./same")).toBe(join(root, "src", "a", "b.ts"));
  });
});

describe("architecture (016): one reader of the switch of amounts (M2)", () => {
  /**
   * The switch lives in SSM (`/atlas/<env>/mail/amounts`, ADR-0028, row 18).
   * Only the composition of the mail task reads it, with the rule of the
   * domain (`amountsSwitch`), and hands the redaction the value already
   * understood: a second reader could read it with another rule («present =
   * on») and the mail would leave with amounts.
   */
  it("names the parameter of the switch only in the composition of the mail task", () => {
    const readers = productSources().filter((file) => /mail\/amounts/.test(parse(file).code));
    expect(readers.map((file) => relative(repoRoot, file))).toEqual([
      "apps/jobs/src/tasks/mail.ts",
    ]);
  });
});

describe("architecture (016): the clock is injected", () => {
  /**
   * Nothing of this feature reads the real time outside the adapter of the
   * clock (§2 bis): a job that did would take its period from the machine,
   * and a test that did would fail one day a year. **Whole folders**, not a
   * list of files (review of PR #104, idempotence N2): the application of the
   * jobs, the rules of the jobs, every `jobs*` adapter of AWS, and every file
   * the feature adds or touches elsewhere — the API included. And not only
   * `new Date()` and `Date.now()`: `globalThis.Date`, `Reflect.construct(Date`
   * and taking `Date` apart or aside reach the same clock.
   */
  const FOLDERS = [
    "apps/jobs/src",
    "apps/jobs/test",
    "apps/jobs/scripts",
    "packages/domain/src/jobs",
    "packages/domain/test/jobs",
    "packages/adapters/test/jobs",
  ];
  const ADDED_FILES = [
    "scripts/lambda-package.mjs",
    "packages/domain/src/jobs.ts",
    "packages/domain/src/access.ts",
    "packages/domain/src/ports/notifier.ts",
    "packages/domain/src/settings/job-frequencies.ts",
    "packages/domain/src/access/web-sign-in.ts",
    "packages/adapters/src/aws/mail.ts",
    "packages/adapters/src/aws/sdk-ses.ts",
    "packages/adapters/src/aws/web-sign-in.ts",
    "packages/adapters/src/aws/index.ts",
    "packages/adapters/test/aws/mail.test.ts",
    "packages/adapters/test/aws/test-only-fake-ses.ts",
    "apps/api/src/handler.ts",
    "apps/api/test/sign-in.test.ts",
    "packages/domain/src/access/sync-routes.ts",
    "packages/domain/src/quotes/cascade.ts",
    "packages/adapters/src/aws/daily.ts",
    "packages/adapters/src/aws/price-keys.ts",
    "packages/adapters/src/aws/s3-ecb-store.ts",
    "packages/adapters/src/aws/s3-price-store.ts",
    "packages/adapters/src/aws/simulated-prices.ts",
    "packages/adapters/test/aws/s3-daily.test.ts",
    "packages/domain/src/ecb/manifest.ts",
  ];
  /** Every source of a folder, the `.mjs` of the scripts too. */
  const sourcesOf = (folder: string): string[] =>
    statSync(folder, { throwIfNoEntry: false })?.isDirectory() === true
      ? readdirSync(folder).flatMap((entry) => {
          const path = join(folder, entry);
          if (statSync(path).isDirectory()) {
            return sourcesOf(path);
          }
          return /\.(ts|tsx|mjs)$/.test(path) && !path.endsWith(".d.ts") ? [path] : [];
        })
      : [];
  /** Every `jobs*` adapter of AWS, and its tests (round 2 of the review, R2-N1). */
  const awsJobsTests = (): string[] =>
    sourcesOf(join(adaptersRoot, "test", "aws")).filter((file) =>
      /[/\\]jobs[^/\\]*\.ts$/.test(file),
    );
  const awsJobs = (): string[] =>
    sourcesOf(join(adaptersRoot, "src", "aws")).filter((file) =>
      /[/\\]jobs[^/\\]*\.ts$/.test(file),
    );
  const REAL_TIME =
    /\bnew\s+(?:globalThis\s*\.\s*)?Date\s*\(\s*\)|\bDate\s*\.\s*now\b|\bglobalThis\s*\.\s*Date\b|\bReflect\s*\.\s*construct\s*\(\s*(?:globalThis\s*\.\s*)?Date\b|=\s*Date\s*[;,)]|\}\s*=\s*Date\b/;

  it("reads the real time only in the adapter of the clock", () => {
    const files = [
      ...FOLDERS.flatMap((folder) => sourcesOf(join(repoRoot, folder))),
      ...awsJobs(),
      ...awsJobsTests(),
      ...ADDED_FILES.map((file) => join(repoRoot, file)).filter(exists),
    ];
    expect(files.length).toBeGreaterThan(40);
    expect(
      awsJobs()
        .map((file) => relative(repoRoot, file))
        .sort(),
    ).toEqual(["packages/adapters/src/aws/jobs-store.ts", "packages/adapters/src/aws/jobs.ts"]);
    expect(awsJobsTests().map((file) => relative(repoRoot, file))).toEqual([
      "packages/adapters/test/aws/jobs-store.test.ts",
    ]);
    const offenders = files.filter((file) => REAL_TIME.test(parse(file).code));
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  it("catches every way of reaching the clock it names", () => {
    for (const code of [
      "const at = new Date();",
      "const at = new globalThis.Date();",
      "const ms = Date.now();",
      "const D = globalThis.Date;",
      "const at = Reflect.construct(Date, []);",
      "const { now } = Date;",
      "const Clock = Date;",
    ]) {
      expect(REAL_TIME.test(code), code).toBe(true);
    }
    for (const code of [
      "new Date(now)",
      "Date.parse(text)",
      "Date.UTC(2026, 0, 1)",
      "new Date(ms).toISOString()",
    ]) {
      expect(REAL_TIME.test(code), code).toBe(false);
    }
  });
});
