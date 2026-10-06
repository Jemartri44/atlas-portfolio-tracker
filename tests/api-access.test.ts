// Feature 015, block 1 of E1: the guardians of the API and the access, written
// **before** `apps/api` exists and seen failing against an empty module
// (`specs/015-api-access/questions.md`, E1). Kept apart from
// `architecture.test.ts`, which is already two thousand lines long; the graph
// walk is the same idea: static imports, across packages through `exports`.

import { readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adaptersRoot,
  apiRoot,
  chainText,
  cliSrc,
  domainRoot,
  exportsOf,
  listSources,
  nodesOf,
  packages,
  parse,
  productSources,
  reach,
  repoRoot,
  specifiersOf,
  webReach,
  webSrc,
} from "./support/source-graph.js";

describe("architecture (015): the API is a workspace of its own", () => {
  it("has the files it guards, so no rule below passes by looking at nothing", () => {
    const manifest = JSON.parse(readFileSync(join(apiRoot, "package.json"), "utf8")) as {
      name: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(manifest.name).toBe("@atlas/api");
    expect(statSync(join(apiRoot, "src", "handler.ts"), { throwIfNoEntry: false })?.isFile()).toBe(
      true,
    );
    expect(
      statSync(join(domainRoot, "src", "access.ts"), { throwIfNoEntry: false })?.isFile(),
    ).toBe(true);
  });

  it("depends at runtime only on workspaces, and builds with esbuild pinned (§2 bis, B4; §7 P3)", () => {
    const manifest = JSON.parse(readFileSync(join(apiRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(
      Object.keys(manifest.dependencies ?? {}).filter((name) => !name.startsWith("@atlas/")),
    ).toEqual([]);
    // The one tool the user authorised for the API (§12 of questions.md), at an exact version.
    expect(manifest.devDependencies).toEqual({ esbuild: "0.28.2" });
  });

  // Feature 016, E1 (§8.1 P8): the client of SES v2 joins the two of the 015,
  // authorised by the user and pinned at the same exact version.
  it("gives the adapters the three clients of the SDK the user authorised, pinned, and no other", () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, "packages", "adapters", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(
      Object.fromEntries(
        Object.entries(manifest.dependencies ?? {}).filter(([name]) => !name.startsWith("@atlas/")),
      ),
    ).toEqual({
      "@aws-sdk/client-s3": "3.1141.0",
      "@aws-sdk/client-sesv2": "3.1141.0",
      "@aws-sdk/client-ssm": "3.1141.0",
    });
    expect(manifest.devDependencies ?? {}).toEqual({});
  });

  it("is reached from nothing: not the web, not the console, not a package", () => {
    const offenders = [
      ...listSources(webSrc),
      ...listSources(cliSrc),
      ...listSources(join(domainRoot, "src")),
      ...listSources(join(adaptersRoot, "src")),
    ].filter((file) =>
      specifiersOf(file).some(
        (specifier) =>
          specifier === "@atlas/api" ||
          specifier.startsWith("@atlas/api/") ||
          (specifier.startsWith(".") &&
            !relative(join(apiRoot), resolve(dirname(file), specifier)).startsWith("..")),
      ),
    );
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  /**
   * The doubles of S3, SSM and Google, and the local server of the captures,
   * are test code: nothing the product ships may reach them (plan §11). Read
   * on the whole graph of the API and of every subpath of `exports`.
   */
  it("reaches no test double and nothing under a test folder, from the API or any export", () => {
    const roots = [
      ...listSources(join(apiRoot, "src")),
      ...[...packages().values()].flatMap((subpaths) => [...subpaths.values()]),
    ];
    const violations = [...reach(roots)]
      .filter(
        ([file]) =>
          /[/\\](test|tests)[/\\]/.test(relative(repoRoot, file)) ||
          /test-only-/.test(file) ||
          file.startsWith("<unexported"),
      )
      .map(([, chain]) => chainText(chain));
    expect(violations).toEqual([]);
    // And every product source names no test folder in any specifier.
    const named = productSources().filter((file) =>
      specifiersOf(file).some((specifier) => /(^|\/)(test|tests)\/|test-only-/.test(specifier)),
    );
    expect(named.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  it("keeps the rules of the access out of the barrel, behind a door of its own", () => {
    const barrel = join(domainRoot, "src", "index.ts");
    expect(specifiersOf(barrel).filter((specifier) => /\.\/access[/.]/.test(specifier))).toEqual(
      [],
    );
    expect(exportsOf(domainRoot).get("./access")).toBe(join(domainRoot, "src", "access.ts"));
  });
});

describe("architecture (015): every import can be read", () => {
  /**
   * The graph every guard above and below walks is read off the imports of
   * each source, so an import it cannot read is an import it cannot see. A
   * dynamic `import(…)` whose argument is not a plain string literal in
   * single or double quotes — a template literal, a variable, any expression —
   * is refused **everywhere in the product** (B2 of the review of PR #90: a
   * template literal walked past the guard of P2 and P3 with every test
   * green). Read off the parsed program, so a `//` inside a string before it
   * hides nothing (B2-bis of round 2: the regular expression that stripped
   * comments swallowed the rest of the line).
   */
  it("allows a dynamic import only with a quoted string literal", () => {
    const offenders: string[] = [];
    for (const file of productSources()) {
      const { program, source, dynamicImports } = parse(file);
      if (dynamicImports === 0) {
        continue;
      }
      for (const node of nodesOf(program())) {
        const argument = node.source as { type?: string; value?: unknown } | undefined;
        if (
          node.type === "ImportExpression" &&
          !(argument?.type === "Literal" && typeof argument.value === "string")
        ) {
          const { start, end } = node as unknown as { start: number; end: number };
          offenders.push(`${relative(repoRoot, file)}: ${source.slice(start, end)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * Two more ways in that no guard read (B3 of round 2): `require(…)` — the
   * web compiles with the types of Node, and the bundler follows it — and
   * `import.meta.glob(…)`, which Vite turns into imports at build time. The
   * product is ESM with literal imports only: neither is allowed anywhere,
   * nor `createRequire`, nor `import.meta` read by a computed key. Only the
   * sources that can hold one are walked: an identifier spells `require` as a
   * word of the text or through a `\u` escape, and the parser lists every
   * `import.meta`.
   */
  it("never uses require, createRequire or import.meta.glob", () => {
    const offenders: string[] = [];
    for (const file of productSources()) {
      const { program, source, importMetas } = parse(file);
      if (importMetas === 0 && !/\brequire\b|createRequire|\\u/.test(source)) {
        continue;
      }
      for (const node of nodesOf(program())) {
        const { start, end } = node as unknown as { start: number; end: number };
        const at = `${relative(repoRoot, file)}: ${source.slice(start, end).slice(0, 80)}`;
        if (
          node.type === "Identifier" &&
          ["require", "createRequire"].includes(node.name as string)
        ) {
          offenders.push(at);
        }
        const object = node.object as { type?: string; meta?: { name?: string } } | undefined;
        const property = node.property as { name?: string } | undefined;
        if (
          node.type === "MemberExpression" &&
          object?.type === "MetaProperty" &&
          object.meta?.name === "import" &&
          (node.computed === true || /^glob/.test(property?.name ?? ""))
        ) {
          offenders.push(at);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("architecture (015): credentials travel where ADR-0027 says", () => {
  /**
   * CloudFront overwrites `Authorization` with OAC (ADR-0027, fact 1): every
   * credential goes in the cookie or in `x-atlas-device-token`. Named as a
   * header in any form — a string or a property — in any source of the
   * product, it is a violation; comments are blanked first (by the ranges the
   * parser gives, so a `//` inside a string hides nothing), prose is not code.
   */
  it("never reads nor writes the Authorization header anywhere", () => {
    const offenders = productSources().filter((file) =>
      /["'`]authorization["'`]|\.authorization\b|\bauthorization\s*:/i.test(parse(file).code),
    );
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });
});

describe("architecture (015): AWS and Google only where they belong", () => {
  const googleHosts =
    /["'`][^"'`\n]*(?:accounts\.google\.com|googleapis\.com|oauth2\.google|openid-configuration)/;

  it("imports the AWS SDK nowhere but the thin adapters of src/aws/sdk-*", () => {
    const offenders = productSources().filter(
      (file) =>
        specifiersOf(file).some((specifier) => specifier.startsWith("@aws-sdk/")) &&
        !/[/\\]adapters[/\\]src[/\\]aws[/\\]sdk-[^/\\]+\.ts$/.test(file),
    );
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
    for (const root of [
      domainRoot,
      join(repoRoot, "apps", "web"),
      apiRoot,
      join(repoRoot, "apps", "cli"),
    ]) {
      const manifest = readFileSync(join(root, "package.json"), "utf8");
      expect(manifest.includes("@aws-sdk/")).toBe(false);
    }
  });

  it("names the addresses of Google only in the identity adapter", () => {
    const offenders = productSources()
      .filter((file) => googleHosts.test(readFileSync(file, "utf8")))
      .filter((file) => !/[/\\]adapters[/\\]src[/\\]identity[/\\]/.test(file));
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  /**
   * What the web bundles is **derived** — its own imports resolved through
   * `exports` — so a subpath added tomorrow and imported by the web is looked
   * at without anybody writing it here (§2 bis; mutant 11).
   */
  it("lets neither the SDK, nor Google, nor the Node adapters of the API reach the web", () => {
    const reached = webReach();
    expect(reached.size).toBeGreaterThan(listSources(webSrc).length);
    const violations = [...reached]
      .filter(([file]) => {
        if (file.startsWith("<")) {
          return true;
        }
        const source = readFileSync(file, "utf8");
        return (
          googleHosts.test(source) ||
          specifiersOf(file).some(
            (specifier) => specifier.startsWith("@aws-sdk/") || specifier.startsWith("node:"),
          ) ||
          /[/\\]adapters[/\\]src[/\\](aws|identity|access)[/\\]/.test(file) ||
          /[/\\]domain[/\\]src[/\\]access(\.ts|[/\\])/.test(file) ||
          // The administration (review of PR #98, N7): its rules, its adapter
          // (under `aws/`, above) and its orders, which live in the console.
          /[/\\]domain[/\\]src[/\\]admin\.ts$/.test(file) ||
          /[/\\]apps[/\\]cli[/\\]/.test(file)
        );
      })
      .map(([, chain]) => chainText(chain));
    expect(violations).toEqual([]);
  });
});

describe("architecture (015): the records of the tokens are never deleted nor labelled (T26)", () => {
  /**
   * ADR-0033, point 9: a record is written to create it and to revoke it, and
   * never deleted; a label or a delete is a way to bring a revoked token back
   * (B1). The narrow interface of SSM offers exactly four operations, and no
   * source of the product names the others of the service.
   */
  it("offers get, putNew, overwrite and listByPath, and nothing else", () => {
    const file = join(adaptersRoot, "src", "aws", "parameter-store.ts");
    const members = [...parse(file).code.matchAll(/^\s{2}([a-zA-Z]+)\(/gm)].map(
      (match) => match[1],
    );
    expect(members).toEqual(["get", "putNew", "overwrite", "listByPath"]);
    const offenders = productSources().filter((path) =>
      /DeleteParameters?|LabelParameterVersion|UnlabelParameterVersion|deleteParameter|labelParameter/.test(
        parse(path).code,
      ),
    );
    expect(offenders.map((path) => relative(repoRoot, path))).toEqual([]);
  });
});

describe("architecture (015): the thin adapters of the SDK send only what they are for (E3)", () => {
  /**
   * The API only appends to the bucket and never deletes (ADR-0026, Part A;
   * ADR-0028, row 7), and the records of the tokens are never deleted nor
   * labelled (T26). What the adapters take from the SDK is the closed list of
   * commands they send; a delete, or anything else, is a violation.
   */
  it("takes from the SDK only the clients and the commands of the narrow interfaces", () => {
    const allowed: Record<string, readonly string[]> = {
      "@aws-sdk/client-s3": [
        "S3Client",
        "GetObjectCommand",
        "PutObjectCommand",
        "ListObjectsV2Command",
        "ListObjectsV2CommandOutput",
      ],
      "@aws-sdk/client-ssm": [
        "SSMClient",
        "GetParameterCommand",
        "GetParameterCommandOutput",
        "PutParameterCommand",
        "GetParametersByPathCommand",
        "GetParametersByPathCommandOutput",
        // Feature 017, E4: tags a parameter after a rotation (`SdkSecretStore`, administration only).
        "AddTagsToResourceCommand",
      ],
      // Feature 016 (§8.1 P8): one command, to send a mail, and its client.
      "@aws-sdk/client-sesv2": ["SESv2Client", "SendEmailCommand"],
    };
    const taken = productSources().flatMap((file) =>
      parse(file)
        .bindings.filter((binding) => binding.specifier.startsWith("@aws-sdk/"))
        .map((binding) => `${binding.specifier} ${binding.name}`),
    );
    expect(taken.length).toBeGreaterThan(0);
    expect(
      taken.filter((entry) => {
        const [specifier, name] = entry.split(" ") as [string, string];
        return !(allowed[specifier] ?? []).includes(name);
      }),
    ).toEqual([]);
    const deletes = productSources().filter((path) =>
      /DeleteObjects?|deleteObject|DeleteBucket/.test(parse(path).code),
    );
    expect(deletes.map((path) => relative(repoRoot, path))).toEqual([]);
  });
});

describe("architecture (015): the API only appends, and the domain judges every line (E3)", () => {
  const apiSources = () => listSources(join(apiRoot, "src"));

  /**
   * ADR-0026, Part A: the API never rewrites nor deletes a line. It holds the
   * remote ledger only as `AppendOnlyLedger`, and no source of it names an
   * operation that rewrites or deletes (mutant 31).
   */
  it("names no operation that rewrites or deletes the remote", () => {
    const offenders = apiSources().filter((file) =>
      /\breplaceLines\b|\.replace\(\s*\[|\bBlobLedgerStore\b|\bS3LedgerBlob\b|DeleteObject|deleteObject|deleteOutOfBand|\bputIfMatch\b|\bputIfNoneMatch\b|\bLEDGER_KEY\b|["'`]ledger\//.test(
        parse(file).code,
      ),
    );
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
    const sync = readFileSync(join(apiRoot, "src", "sync.ts"), "utf8");
    expect(sync).toContain("AppendOnlyLedger");
    // The routes get no ObjectStore of their own (review of PR #96, security
    // N1): the reference data through a read-only port of its two prefixes.
    expect(parse(join(apiRoot, "src", "sync.ts")).code).not.toMatch(/\bObjectStore\b|\bobjects\b/);
    expect(sync).toContain("ReferenceReader");
  });

  /**
   * What a line is worth is `acceptAppend` and `acceptInit`, never a copy in
   * the handler: no source of the API names a code of the table of §5.2
   * (mutant 31, «reimplement a rule of acceptAppend»).
   */
  it("reimplements no rule of acceptAppend: the codes of a line live in the domain", () => {
    const codes =
      /["'`](line_unreadable|schema_version_unsupported|line_invalid|recorded_at_in_future|domain_rejected|duplicate_unconfirmed|pair_declaration_invalid|pair_incomplete|pair_not_contiguous|pair_rejected|seal_mismatch|waiver_not_appendable)["'`]/;
    const offenders = apiSources().filter((file) => codes.test(parse(file).code));
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
    const sync = readFileSync(join(apiRoot, "src", "sync.ts"), "utf8");
    expect(sync).toMatch(/acceptAppend\(/);
    expect(sync).toMatch(/acceptInit\(/);
  });
});

describe("architecture (015): the administration is out of reach of the API (E5)", () => {
  const cliSources = (): string[] => listSources(cliSrc);
  const isAdministration = (file: string): boolean =>
    /[/\\]adapters[/\\]src[/\\]aws[/\\]sdk-admin\.ts$/.test(file) ||
    /[/\\]domain[/\\]src[/\\](admin\.ts|access[/\\]admin\.ts)$/.test(file) ||
    /[/\\]apps[/\\]cli[/\\]/.test(file);

  /**
   * ADR-0026, Part A: `compact` and the restore are operations of
   * administration, «fuera del camino que alcanza Internet». Nothing the
   * handler reaches is an order, an adapter or a rule of the administration
   * (mutant 45), and no source of the API names what only the administration
   * has: an old version, a listing at depth, the mark of a forgotten device.
   */
  it("reaches no order, adapter or rule of the administration from apps/api", () => {
    const roots = listSources(join(apiRoot, "src"));
    const reached = reach(roots);
    expect(reached.size).toBeGreaterThan(roots.length);
    expect(
      [...reached].filter(([file]) => isAdministration(file)).map(([, chain]) => chainText(chain)),
    ).toEqual([]);
    const offenders = roots.filter((file) =>
      /\bgetVersion\b|\blistAll\b|\bAdminObjectStore\b|\bVersionId\b|\bforgottenDevice\b|\bremoteRewritePermission\b/.test(
        parse(file).code,
      ),
    );
    expect(offenders.map((file) => relative(repoRoot, file))).toEqual([]);
  });

  /**
   * The administration takes the role of administration from the standard
   * chain of the SDK, **never the token of a device** (mutant 45; §7 P5, mutant
   * 46 ter): nothing it imports is the credentials of the console, the header
   * of the token or the client of the API.
   */
  it("uses no token of a device: it imports neither the credentials nor the client of the API", () => {
    const roots = cliSources().filter((file) =>
      /[/\\](admin[/\\][^/\\]+|commands[/\\](admin|admin-secrets|backup|backup-copies))\.ts$/.test(
        file,
      ),
    );
    // Feature 017, E4: `admin/secrets.ts` and `commands/admin-secrets.ts` join the four.
    expect(roots.length).toBe(6);
    // What they import, by name: never the credentials or the client of the
    // console, and from the barrel of the adapters only the folder's own.
    const imported = roots.flatMap((file) =>
      parse(file).bindings.map((binding) => ({ file, ...binding })),
    );
    expect(imported.length).toBeGreaterThan(0);
    const violations = imported
      .filter(
        ({ specifier, name }) =>
          /(^|\/)remote\//.test(specifier) ||
          /^@atlas\/adapters\/(sync-http|sync-client|sync|identity|access)$/.test(specifier) ||
          (specifier === "@atlas/adapters" &&
            !["FileLedgerStore", "HELD_FILE", "folderSyncPresence"].includes(name)),
      )
      .map(({ file, specifier, name }) => `${relative(repoRoot, file)}: ${name} from ${specifier}`);
    expect(violations).toEqual([]);
    const named = roots.filter((file) =>
      /DEVICE_TOKEN_HEADER|x-atlas-device-token|credentials\.json/.test(parse(file).code),
    );
    expect(named.map((file) => relative(repoRoot, file))).toEqual([]);
  });
});

describe("architecture (015): the exception of the redo is bound to the sealed plan (E3, N1)", () => {
  /**
   * `recordRedo` records with the rule of `correctEvent` (§7 P6, option (a)).
   * Only the orchestration of the redo may reach it — never the ordinary form
   * of recording, where it would be a flag nobody could tell apart (N1;
   * mutant 33 bis). The door of the sync re-exports it; nothing else names it.
   */
  it("is imported only by the orchestration of the redo", () => {
    const users = productSources()
      .filter((file) => parse(file).bindings.some((binding) => binding.name === "recordRedo"))
      .map((file) => relative(repoRoot, file).replaceAll("\\", "/"))
      .sort();
    expect(users).toEqual([
      "packages/adapters/src/sync/held-actions.ts",
      "packages/domain/src/sync.ts",
    ]);
  });
});

describe("architecture (015): the authoritative guard reads the graph of the bundle", () => {
  /**
   * The guards of this file read the sources; the one that decides reads the
   * modules Rolldown put in the bundle (round 2 of the review of PR #90). It
   * runs inside `npm run build`, so this only holds that it is there: the
   * plugin that writes the graph, and each family it refuses.
   */
  it("writes the graph in the build and refuses each family on it", () => {
    const config = readFileSync(join(repoRoot, "apps", "web", "vite.config.ts"), "utf8");
    expect(config).toContain('moduleGraph("main"),');
    // Round 3: the workers are other builds, with the same plugin.
    expect(config).toContain('worker: { plugins: () => [moduleGraph("worker")] }');
    expect(config).toContain('fileName: ".vite/atlas-modules.json"');
    // Review of PR #97, N1: who imports each module, statically or not.
    expect(config).toContain("info?.dynamicImporters");
    expect(config).toContain("realpathSync(path)");
    // Round 4: a source of code is never inlined as a `data:` URL.
    expect(config).toMatch(/assetsInlineLimit: \(filePath: string\)/);
    const script = readFileSync(
      join(repoRoot, "apps", "web", "scripts", "check-bundle.mjs"),
      "utf8",
    );
    for (const family of [
      "las reglas del acceso",
      "un adaptador de Node de la API",
      "el SDK de AWS",
      "la API o la consola",
      "un módulo de Node",
      "un doble o código de test",
      "un paquete del repositorio por node_modules",
      "crea un worker cuyo grafo no se conoce",
      "el bundle lleva un fuente",
      "ningún grafo dice de dónde sale este fichero",
      "lleva código incrustado como URL data:",
      // Review of PR #97, N1 of round 1 and B1 of round 2.
      "un módulo de la sección de la sincronización que no es su puerta",
      "alcanza el motor de la sincronización de la web desde fuera de su sección",
      "el grafo no dice quién importa",
    ]) {
      expect(script).toContain(family);
    }
  });
});

describe("architecture (015): nothing of the access on the boot path", () => {
  it("lists every web module of the feature in LAZY_ONLY from its first commit", () => {
    const script = readFileSync(
      join(repoRoot, "apps", "web", "scripts", "check-bundle.mjs"),
      "utf8",
    );
    for (const path of [
      "/packages/domain/src/access/",
      "/packages/domain/src/access.ts",
      "/packages/adapters/src/ledger-store/browser/web-device.ts",
      "/src/sync/",
      "/src/routes/ajustes/sync/",
    ]) {
      expect(script).toContain(`path: "${path}"`);
    }
  });
});

describe("architecture (015): the service worker leaves the API alone", () => {
  /**
   * Found by looking at the screen (E1): the PWA answered **every** navigation
   * with `index.html` (`navigateFallback`), so `GET /api/auth/login` and the
   * return from Google never reached the Lambda once the service worker was
   * installed — the SPA painted «Aquí no hay nada». A navigation under
   * `/api/` is the API's, always.
   */
  it("never answers a navigation under /api/ with the shell of the SPA", () => {
    const config = readFileSync(join(repoRoot, "apps", "web", "vite.config.ts"), "utf8");
    expect(config).toContain("navigateFallbackDenylist: [/^\\/api\\//]");
    const script = readFileSync(
      join(repoRoot, "apps", "web", "scripts", "check-bundle.mjs"),
      "utf8",
    );
    expect(script).toContain("navigateFallbackDenylist");
  });
});
