// `atlas backup` in feature 015, E5 (ADR-0032, layer 4; §7 P5): the local
// `documents/` beside the ledger and, with `--from-bucket`, `documents/` and
// `imports/` of the data bucket with the role of administration — against
// the double of S3, **only reading** there, every file verified and nothing
// ever overwritten on disk.

import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeLine } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { TestOnlyFakeSecrets } from "../../../../packages/adapters/test/aws/test-only-fake-secrets.js";
import { CONFIG, setup } from "../../../api/test/harness.js";
import type { AdminAccess } from "../../src/admin/environment.js";
import { EXIT, type Io } from "../../src/context.js";
import { run } from "../../src/main.js";
import { seed } from "../harness.js";

type Api = ReturnType<typeof setup>;

const adminOf = (api: Api): AdminAccess => ({
  clientsFor: async () => ({
    objects: api.s3,
    parameters: api.ssm,
    secrets: new TestOnlyFakeSecrets(),
    ssmPrefix: CONFIG.ssmPrefix,
  }),
});

/** A folder with a ledger and its `documents/`, and the console over it. */
const folder = async (api?: Api) => {
  const dir = await mkdtemp(join(tmpdir(), "atlas-backup-015-"));
  const ledger = join(dir, "ledger.jsonl");
  await writeFile(
    ledger,
    seed()
      .map((event) => `${encodeLine(event)}\n`)
      .join(""),
  );
  const lines: string[] = [];
  const io: Io = {
    out: (t) => lines.push(t),
    err: (t) => lines.push(t),
    confirm: async () => true,
  };
  const atlas = (...argv: string[]) =>
    run(
      ["--ledger", ledger, ...argv, "--yes"],
      io,
      undefined,
      undefined,
      undefined,
      undefined,
      api && adminOf(api),
    );
  return { dir, lines, atlas, text: () => lines.join("\n") };
};

describe("atlas backup copies the local documents/", () => {
  it("copies every file at any depth, verified, and says when there is none", async () => {
    const f = await folder();
    const empty = join(f.dir, "..", `copies-empty-${Date.now()}`);
    expect(await f.atlas("backup", "--to", empty)).toBe(EXIT.ok);
    expect(f.text()).toContain("documents/ de la carpeta del libro: no hay nada que copiar");
    await mkdir(join(f.dir, "documents", "01ARYZ6S41TSV4RRFFQ69G5FAV"), { recursive: true });
    await writeFile(join(f.dir, "documents", "01ARYZ6S41TSV4RRFFQ69G5FAV", "aviso.pdf"), "pdf");
    await writeFile(join(f.dir, "documents", "nota.txt"), "nota");
    const target = join(f.dir, "..", `copies-${Date.now()}`);
    expect(await f.atlas("backup", "--to", target)).toBe(EXIT.ok);
    expect(
      await readFile(join(target, "documents", "01ARYZ6S41TSV4RRFFQ69G5FAV", "aviso.pdf"), "utf8"),
    ).toBe("pdf");
    expect(await readFile(join(target, "documents", "nota.txt"), "utf8")).toBe("nota");
    expect(f.text()).toContain("2 ficheros copiados y verificados, 0 ya estaban iguales");
  });

  it("leaves a file with the same bytes as it is, and never overwrites one with others", async () => {
    const f = await folder();
    await mkdir(join(f.dir, "documents"), { recursive: true });
    await writeFile(join(f.dir, "documents", "nota.txt"), "nota");
    const target = join(f.dir, "..", `copies-same-${Date.now()}`);
    await mkdir(join(target, "documents"), { recursive: true });
    await writeFile(join(target, "documents", "nota.txt"), "nota");
    expect(await f.atlas("backup", "--to", target)).toBe(EXIT.ok);
    expect(f.text()).toContain("0 ficheros copiados y verificados, 1 ya estaban iguales");
    const other = join(f.dir, "..", `copies-other-${Date.now()}`);
    await mkdir(join(other, "documents"), { recursive: true });
    await writeFile(join(other, "documents", "nota.txt"), "otra");
    expect(await f.atlas("backup", "--to", other)).toBe(EXIT.domain);
    expect(f.text()).toContain("path_exists");
    expect(await readFile(join(other, "documents", "nota.txt"), "utf8")).toBe("otra");
  });
});

describe("atlas backup --from-bucket (§7 P5)", () => {
  it("copies documents/ and imports/ of the bucket, only reading there", async () => {
    const api = setup();
    api.s3.seed("documents/01ARYZ6S41TSV4RRFFQ69G5FAV/aviso.pdf", "pdf del bucket");
    api.s3.seed("documents/01ARYZ6S41TSV4RRFFQ69G5FAV/", "");
    api.s3.seed("imports/ibkr/2026-09.csv", "a,b");
    api.s3.seed("ledger/ledger.jsonl", "no se copia\n");
    const f = await folder(api);
    const target = join(f.dir, "..", `copies-bucket-${Date.now()}`);
    const before = api.s3.keys().map((key) => [key, api.s3.etagOf(key)]);
    expect(await f.atlas("backup", "--to", target, "--from-bucket", "--env", "test")).toBe(EXIT.ok);
    expect(
      await readFile(
        join(target, "bucket", "documents", "01ARYZ6S41TSV4RRFFQ69G5FAV", "aviso.pdf"),
        "utf8",
      ),
    ).toBe("pdf del bucket");
    expect(await readFile(join(target, "bucket", "imports", "ibkr", "2026-09.csv"), "utf8")).toBe(
      "a,b",
    );
    expect(f.text()).toContain("2 ficheros copiados y verificados");
    expect(f.text()).toContain("En el bucket no se ha escrito ni borrado nada.");
    // Only reading: no write reached the bucket, and nothing changed there.
    expect(api.s3.calls.filter((call) => /^put/.test(call))).toEqual([]);
    expect(api.s3.keys().map((key) => [key, api.s3.etagOf(key)])).toEqual(before);
  });

  it("skips a key that would leave the destination, copies the rest, and fails at the end", async () => {
    const api = setup();
    api.s3.seed("documents/../../fuera.txt", "x");
    api.s3.seed("imports/ibkr/2026-09.csv", "a,b");
    const f = await folder(api);
    const target = join(f.dir, "..", `copies-unsafe-${Date.now()}`);
    expect(await f.atlas("backup", "--to", target, "--from-bucket", "--env", "test")).toBe(
      EXIT.domain,
    );
    expect(f.text()).toContain("bucket_key_unsafe");
    expect(f.text()).toContain("documents/../../fuera.txt");
    // The rest is copied all the same, and nothing left the destination.
    expect(await readFile(join(target, "bucket", "imports", "ibkr", "2026-09.csv"), "utf8")).toBe(
      "a,b",
    );
    await expect(readFile(join(target, "..", "fuera.txt"), "utf8")).rejects.toThrow();
    expect(await f.atlas("backup", "--to", `${target}-2`, "--from-bucket")).toBe(EXIT.usage);
    expect(await f.atlas("backup", "--to", `${target}-3`, "--env", "test")).toBe(EXIT.usage);
  });
});
