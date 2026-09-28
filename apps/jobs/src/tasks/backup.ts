// The monthly dump (feature 016, E4; ADR-0032, point 3; plan §8): the ledger
// byte for byte, `positions.json`, the ECB history in force **with its
// manifest** and `prices/` whole, into `backups/<YYYY-MM>/` of the month of
// Madrid. It composes and decides nothing — what to do with each object is
// the domain's (`dumpStep`, `dumpManifestStep`) — and **it sends nothing**
// (§8.2 B2): what fails is a finding in its record, for the mail function.
//
// **A dump is for ever.** Every object is written with `If-None-Match: *`,
// never over another. **Before each write, the object is noted in the record
// of the attempt** (its key and SHA-256, a conditional write on the record;
// review of PR #109, R2-B1). A month left half done by a cut — a thrown error,
// or a run that dies with its record still claimed (a timeout) — is finished
// by the retry, which leaves what an earlier attempt noted and wrote, and says
// so (`kept_from_earlier_attempt`): the positions are always those of the
// ledger **of the dump**, not of the live one. An object there with bytes no
// attempt noted is refused (`backup_object_differs`, N3 of round 1) and
// nothing more is written. A conditional write that meets another writer
// stops the run: only this function writes `backups/`, so it can only be
// another run of it.

import { createHash } from "node:crypto";
import { LEDGER_KEY } from "@atlas/adapters/aws";
import { JobsWriteConflict } from "@atlas/adapters/aws-jobs";
import {
  activeHistoryOf,
  backupFindings,
  DUMP_LEDGER,
  DUMP_POSITIONS,
  type DumpObject,
  dumpablePriceName,
  dumpManifestStep,
  dumpPrefix,
  dumpStep,
  positionsDocument,
  serializePositions,
} from "@atlas/domain/jobs";
import { textOf } from "../ecb-history.js";
import { ledgerOfBytes } from "../ledger.js";
import { errorName } from "../log.js";
import { readReference } from "../reference.js";
import { type TaskContext, TaskInterrupted, type TaskResult, type TaskRunner } from "../run.js";

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** One object of the dump as it ended: its bytes in the dump, and whether it was refused. */
type Put = { readonly kind: "in_dump"; readonly bytes: Uint8Array } | { readonly kind: "differs" };

const ECB_DIR = "reference/ecb/";
const PRICES_DIR = "prices/";

export const monthlyBackup: TaskRunner = async (context: TaskContext): Promise<TaskResult> => {
  const { deps } = context;
  const prefix = dumpPrefix(context.period);
  // What earlier attempts of the month say they wrote, byte for byte (copias N3).
  const earlier = new Map<string, string[]>();
  for (const object of context.earlier) {
    earlier.set(object.key, [...(earlier.get(object.key) ?? []), object.sha256]);
  }
  const objects: DumpObject[] = [];
  /** The objects of this attempt, and those of earlier ones it did not reach again. */
  const withEarlier = (): DumpObject[] => [
    ...objects,
    ...context.earlier.filter((object) => !objects.some((seen) => seen.key === object.key)),
  ];
  const counts = {
    written: 0,
    same: 0,
    kept: 0,
    prices: 0,
    prices_skipped: 0,
    ecb: 0,
    positions: 0,
  };

  /** Puts `bytes` at `relative` in the dump, or leaves what is there: never over it. */
  const put = async (relative: string, bytes: Uint8Array): Promise<Put> => {
    const key = `${prefix}${relative}`;
    const existing = await deps.objects.get(key);
    const next = sha256(bytes);
    const step = dumpStep({
      existing: existing === undefined ? undefined : sha256(existing.body),
      next,
      earlier: earlier.get(key) ?? [],
    });
    switch (step) {
      case "write":
        // Said before it is written: a run that dies after this write still left it said (R2-B1).
        await context.note([{ key, sha256: next }]);
        if ((await deps.objects.putIfNoneMatch(key, bytes)) === "exists") {
          throw new JobsWriteConflict();
        }
        counts.written += 1;
        objects.push({ key, sha256: next });
        return { kind: "in_dump", bytes };
      case "same":
        counts.same += 1;
        objects.push({ key, sha256: next });
        return { kind: "in_dump", bytes };
      case "kept": {
        const body = (existing as { body: Uint8Array }).body;
        counts.kept += 1;
        objects.push({ key, sha256: sha256(body), kept_from_earlier_attempt: true });
        return { kind: "in_dump", bytes: body };
      }
      case "differs":
        return { kind: "differs" };
    }
  };

  const done = (extra: {
    differs?: number;
    ecbInconsistent?: boolean;
    positionsMissing?: boolean;
    ecbMissing?: boolean;
  }): TaskResult => ({
    state: "done",
    outcome: { code: "backup_done", counts: { ...counts, differs: extra.differs ?? 0 } },
    findings: backupFindings({
      differs: extra.differs ?? 0,
      ecbInconsistent: extra.ecbInconsistent === true,
      positionsMissing: extra.positionsMissing === true,
      ecbMissing: extra.ecbMissing === true,
    }),
    objects: withEarlier(),
  });

  try {
    // 1. The ledger, byte for byte.
    const live = await deps.objects.get(LEDGER_KEY);
    if (live === undefined || live.body.length === 0) {
      return { state: "failed", outcome: { code: "ledger_absent" } };
    }
    const ledger = await put(DUMP_LEDGER, live.body);
    if (ledger.kind === "differs") {
      return done({ differs: 1 });
    }

    // 2. positions.json, of the ledger of the dump — the earlier attempt's, if it left one.
    const read = ledgerOfBytes(ledger.bytes, context.today);
    let positionsMissing = false;
    if (read.ok) {
      const reference = await readReference(deps.objects, read.state).catch(() => ({}));
      const document = positionsDocument({
        state: read.state,
        settings: read.settings,
        date: context.today,
        ...("external" in reference && reference.external !== undefined
          ? { external: reference.external }
          : {}),
        generatedAt: deps.now().toISOString(),
        ledger: { sha256: sha256(ledger.bytes), lines: read.events.length },
      });
      const positions = await put(
        DUMP_POSITIONS,
        new TextEncoder().encode(serializePositions(document)),
      );
      if (positions.kind === "differs") {
        return done({ differs: 1 });
      }
      counts.positions = 1;
    } else {
      positionsMissing = true;
    }

    // 3. The ECB history in force, then its manifest — only over the very file it names.
    // None in force that matches its manifest: the dump goes without, and says so (copias N1).
    let ecbInconsistent = false;
    let ecbMissing = false;
    const manifest = await deps.objects.get(`${ECB_DIR}manifest.json`);
    const active =
      manifest === undefined ? undefined : activeHistoryOf(textOf(manifest.body) ?? "");
    const file =
      active === undefined ? undefined : await deps.objects.get(`${ECB_DIR}${active.file}`);
    if (active !== undefined && file !== undefined && sha256(file.body) === active.sha256) {
      const history = await put(`${ECB_DIR}${active.file}`, file.body);
      if (history.kind === "differs") {
        return done({ differs: 1, positionsMissing });
      }
      // An earlier attempt that wrote the manifest wrote the pair: both stay as they are.
      const finished = (await deps.objects.get(`${prefix}${ECB_DIR}manifest.json`)) !== undefined;
      const step = finished
        ? "write"
        : dumpManifestStep({ fileInDump: sha256(history.bytes), manifestSha256: active.sha256 });
      if (step === "write") {
        const kept = await put(`${ECB_DIR}manifest.json`, (manifest as { body: Uint8Array }).body);
        if (kept.kind === "differs") {
          return done({ differs: 1, positionsMissing });
        }
        counts.ecb = 1;
      } else {
        ecbInconsistent = true;
      }
    } else {
      ecbMissing = true;
    }

    // 4. prices/, every object of its first level with a plain name.
    for (const listed of await deps.objects.list(PRICES_DIR)) {
      const name = listed.key.slice(PRICES_DIR.length);
      if (!dumpablePriceName(name)) {
        counts.prices_skipped += 1;
        continue;
      }
      const stored = await deps.objects.get(listed.key);
      if (stored === undefined) {
        continue;
      }
      const price = await put(`${PRICES_DIR}${name}`, stored.body);
      if (price.kind === "differs") {
        return done({ differs: 1, ecbInconsistent, positionsMissing, ecbMissing });
      }
      counts.prices += 1;
    }
    return done({ ecbInconsistent, positionsMissing, ecbMissing });
  } catch (error) {
    if (error instanceof JobsWriteConflict) {
      throw error;
    }
    // Cut halfway: the record keeps what this attempt and the earlier ones wrote.
    throw new TaskInterrupted(withEarlier(), errorName(error));
  }
};
