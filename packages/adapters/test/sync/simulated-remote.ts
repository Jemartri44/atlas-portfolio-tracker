// **Not a production adapter.** Two simulated remotes for the tests of feature
// 014 — one in memory, one in a directory that imitates the bucket
// (`ledger/ledger.jsonl`, `sync/devices/<device>.json`) — that honour the
// semantics of `docs/api.md` §5 without HTTP: the etag is the SHA-256 of the
// bytes, every write is conditional and atomic, `412` writes nothing, a
// request is judged line by line with the **same use case of the domain** the
// Lambda of feature 015 will call (`acceptAppend`, `acceptInit`), and the
// device that publishes is the credential's, never the body's.
//
// Plus the seams the real remote has and a simulation must be able to cause
// on purpose: another writer winning the race, an answer lost after writing,
// a rewritten remote, a failure of the transport, and a hook on every call
// (the console's tests check that the folder lock is never held then).

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CURRENT_LEDGER_SCHEMA, sha256Hex, utf8Encode } from "@atlas/domain";
import {
  type AppendEntry,
  type AppendResult,
  acceptAppend,
  acceptInit,
  type DeviceQueueState,
  EMPTY_ETAG,
  linesOfText,
  parseAppendBody,
  parseInitBody,
  parsePublishBody,
  RemoteError,
  type RemoteLedger,
  type RemoteRules,
  type RemoteSnapshot,
  textOfLines,
} from "@atlas/domain/sync";

/** Where a simulated bucket keeps its bytes. */
interface BucketMedium {
  read(): Promise<string>;
  /** Replaces the ledger only if its etag is still `etag`; answers whether it wrote. */
  writeIf(etag: string, text: string): Promise<boolean>;
  writeDevice(id: string, record: Record<string, unknown>): Promise<void>;
  devices(): Promise<Record<string, unknown>[]>;
}

const etagOf = (text: string): string => sha256Hex(utf8Encode(text));

class MemoryMedium implements BucketMedium {
  text = "";
  readonly records = new Map<string, Record<string, unknown>>();

  async read(): Promise<string> {
    return this.text;
  }

  async writeIf(etag: string, text: string): Promise<boolean> {
    if (etagOf(this.text) !== etag) {
      return false;
    }
    this.text = text;
    return true;
  }

  async writeDevice(id: string, record: Record<string, unknown>): Promise<void> {
    this.records.set(id, record);
  }

  async devices(): Promise<Record<string, unknown>[]> {
    return [...this.records.values()];
  }
}

class DirectoryMedium implements BucketMedium {
  constructor(private readonly root: string) {}

  private get ledger(): string {
    return join(this.root, "ledger", "ledger.jsonl");
  }

  async read(): Promise<string> {
    try {
      return await readFile(this.ledger, "utf8");
    } catch {
      return "";
    }
  }

  // One process drives both devices of a test, and nothing awaits between the
  // comparison and the write but the write itself: conditional as S3 is.
  async writeIf(etag: string, text: string): Promise<boolean> {
    if (etagOf(await this.read()) !== etag) {
      return false;
    }
    await mkdir(join(this.root, "ledger"), { recursive: true });
    await writeFile(this.ledger, text);
    return true;
  }

  async writeDevice(id: string, record: Record<string, unknown>): Promise<void> {
    await mkdir(join(this.root, "sync", "devices"), { recursive: true });
    await writeFile(
      join(this.root, "sync", "devices", `${id}.json`),
      `${JSON.stringify(record)}\n`,
    );
  }

  async devices(): Promise<Record<string, unknown>[]> {
    const dir = join(this.root, "sync", "devices");
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    return Promise.all(
      names.map(
        async (name) =>
          JSON.parse(await readFile(join(dir, name), "utf8")) as Record<string, unknown>,
      ),
    );
  }
}

/** A JSON body as it travels: stringified and parsed, as the API reads it. */
const overTheWire = (body: unknown): unknown => JSON.parse(JSON.stringify(body));

/**
 * A simulated bucket, shared by the devices of a test. `as(device)` is what a
 * device holds: the API reached with its credential.
 */
export class SimulatedBucket {
  /** Runs at every call of any device, before anything else (the lock checks go here). */
  onCall: ((what: string) => Promise<void> | void) | undefined;
  /** Runs after the conditional check of an append and before its write: another writer can win here. */
  beforeWrite: (() => Promise<void>) | undefined;
  /** The next append writes and then its answer is lost. */
  loseNextAnswer = false;
  /** The next call of the given kind fails with this, before touching anything. */
  failNext: { what: string; error: RemoteError } | undefined;

  private constructor(
    private readonly medium: BucketMedium,
    private readonly rules: () => RemoteRules,
  ) {}

  static inMemory(rules: () => RemoteRules = defaultRules): SimulatedBucket {
    return new SimulatedBucket(new MemoryMedium(), rules);
  }

  static inDirectory(root: string, rules: () => RemoteRules = defaultRules): SimulatedBucket {
    return new SimulatedBucket(new DirectoryMedium(root), rules);
  }

  /** The exact text of the remote ledger. */
  text(): Promise<string> {
    return this.medium.read();
  }

  devices(): Promise<Record<string, unknown>[]> {
    return this.medium.devices();
  }

  /** An administration rewrite (compact, restore), outside the API. */
  async rewrite(text: string): Promise<void> {
    await this.medium.writeIf(etagOf(await this.medium.read()), text);
  }

  /** Another writer appends lines, exactly, as a device of another test would. */
  async appendRaw(lines: readonly string[]): Promise<void> {
    const text = await this.medium.read();
    await this.medium.writeIf(etagOf(text), text + textOfLines(lines));
  }

  private async enter(what: string): Promise<void> {
    await this.onCall?.(what);
    const failure = this.failNext;
    if (failure !== undefined && failure.what === what) {
      this.failNext = undefined;
      throw failure.error;
    }
  }

  as(device: string): RemoteLedger & { publishBody(body: unknown): Promise<unknown> } {
    const bucket = this;
    return {
      async read(): Promise<RemoteSnapshot> {
        await bucket.enter("read");
        const text = await bucket.medium.read();
        return { text, etag: etagOf(text) };
      },
      async append(entries: readonly AppendEntry[], ifMatch: string): Promise<AppendResult> {
        await bucket.enter("append");
        if (ifMatch === "") {
          throw new RemoteError("precondition_required", 428);
        }
        const parsed = parseAppendBody(overTheWire({ lines: entries }));
        const text = await bucket.medium.read();
        if (etagOf(text) !== ifMatch) {
          throw new RemoteError("precondition_failed", 412);
        }
        const judged = acceptAppend(linesOfText(text), parsed, bucket.rules());
        const next = text + textOfLines(judged.lines);
        await bucket.beforeWrite?.();
        if (judged.accepted > 0 && !(await bucket.medium.writeIf(ifMatch, next))) {
          throw new RemoteError("precondition_failed", 412);
        }
        if (bucket.loseNextAnswer) {
          bucket.loseNextAnswer = false;
          throw new RemoteError("network_failed", undefined);
        }
        const written = judged.accepted > 0 ? next : text;
        return {
          etag: etagOf(written),
          lines: linesOfText(written).length,
          accepted: judged.accepted,
          ...(judged.rejected === undefined ? {} : { rejected: judged.rejected }),
        };
      },
      async init(content: string, ids: readonly string[], ifMatch: string) {
        await bucket.enter("init");
        const body = parseInitBody(overTheWire({ content, confirm_duplicate_ids: ids }));
        const text = await bucket.medium.read();
        if (ifMatch !== EMPTY_ETAG || text !== "") {
          throw new RemoteError("precondition_failed", 412);
        }
        const lines = acceptInit(body.content, body.confirm_duplicate_ids, bucket.rules());
        const next = textOfLines(lines);
        await bucket.medium.writeIf(EMPTY_ETAG, next);
        return { etag: etagOf(next), lines: lines.length };
      },
      async publish(state: DeviceQueueState) {
        return this.publishBody(state) as Promise<{ device_id: string; published_at: string }>;
      },
      /** The body exactly as a client would send it: a `device_id` in it is `body_invalid`. */
      async publishBody(body: unknown) {
        await bucket.enter("publish");
        const state = parsePublishBody(overTheWire(body));
        const published_at = bucket.rules().now.toISOString();
        await bucket.medium.writeDevice(device, {
          device_format: 1,
          device_id: device,
          ...state,
          published_at,
        });
        return { device_id: device, published_at };
      },
    };
  }
}

export const defaultRules = (): RemoteRules => ({
  schema: CURRENT_LEDGER_SCHEMA,
  now: new Date("2027-08-30T10:00:00.000Z"),
  clockToleranceMs: 5 * 60 * 1000,
});
