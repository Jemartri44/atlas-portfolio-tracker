// Feature 016, block 1 of E1: the guardians of the scheduled jobs, written
// **before** the jobs exist and seen failing against empty modules
// (`specs/016-scheduled-jobs/questions.md`, E1). They walk the real import
// graph (`tests/support/source-graph.ts`: static imports, re-exports and
// literal `import()`, across packages through `exports`), never a list of
// names; the authoritative check of the web is still the graph of its bundle
// (`apps/web/scripts/check-bundle.mjs`, `FORBIDDEN_IN_WEB`).

import { statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adaptersRoot,
  apiRoot,
  chainText,
  cliSrc,
  domainRoot,
  jobsRoot,
  listSources,
  parse,
  productSources,
  reach,
  repoRoot,
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

  it("keeps the keys of the sources out of the mail task (B2)", () => {
    const mail = reach([join(jobsSrc, "tasks", "mail.ts")]);
    expect(mail.size).toBeGreaterThan(1);
    expect(violationsOf(mail, PRICE_KEYS)).toEqual([]);
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
   * and a test that did would fail one day a year. The files of the feature
   * are the folders it creates and the files it adds elsewhere, named here.
   */
  const ADDED_FILES = [
    "packages/domain/src/jobs.ts",
    "packages/domain/src/ports/notifier.ts",
    "packages/domain/src/settings/job-frequencies.ts",
    "packages/domain/src/access/web-sign-in.ts",
    "packages/adapters/src/aws/mail.ts",
    "packages/adapters/src/aws/sdk-ses.ts",
    "packages/adapters/src/aws/jobs-store.ts",
    "packages/adapters/src/aws/web-sign-in.ts",
    "packages/adapters/test/aws/mail.test.ts",
    "packages/adapters/test/aws/jobs-store.test.ts",
    "packages/adapters/test/aws/test-only-fake-ses.ts",
    "packages/adapters/test/jobs/test-only-file-notifier.ts",
  ];
  const FOLDERS = [
    "apps/jobs/src",
    "apps/jobs/test",
    "apps/jobs/scripts",
    "packages/domain/src/jobs",
    "packages/domain/test/jobs",
    "packages/adapters/test/jobs",
  ];

  it("reads the real time only in the adapter of the clock", () => {
    const files = [
      ...FOLDERS.flatMap((folder) => listSources(join(repoRoot, folder))),
      ...ADDED_FILES.map((file) => join(repoRoot, file)).filter(exists),
    ];
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((file) =>
      /\bnew\s+Date\s*\(\s*\)|\bDate\s*\.\s*now\s*\(/.test(parse(file).code),
    );
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });
});
