// Cloud folder or local folder (ADR-0035, §4; feature 024). **Never both**:
//
// - **cloud**: `sync/remote.json` (origin and device) and **no** `ledger.jsonl`.
//   The ledger is the one in S3, read and written through the API with the
//   device token of ADR-0033; nothing of it stays in the folder.
// - **local**: no remote identity. The ledger is a file (development with
//   synthetic data, the yearly restore test, a copy opened, working on when the
//   cloud is gone).
// - a folder with both is refused (`folder_mode_ambiguous`) before anything is
//   read or written: no path synchronises one with the other.

import { dirname } from "node:path";
import { ApiLedgerStore } from "@atlas/adapters";
import { ApiDraftStore } from "@atlas/adapters/drafts-http";
import { httpRemote } from "@atlas/adapters/sync-http";
import {
  CURRENT_LEDGER_SCHEMA,
  DomainError,
  type LedgerEvent,
  type LedgerSchema,
  type LedgerStore,
  type LoadedLedger,
} from "@atlas/domain";
import { entryForRemote, type RemoteJson } from "@atlas/domain/access";
import type { PendingDraftStore } from "@atlas/domain/ecb";
import type { RemoteLedger } from "@atlas/domain/sync";
import { pathExists } from "./commands/synth.js";
import type { Context } from "./context.js";
import { readRemoteJson } from "./remote/credentials-file.js";
import { systemRemote } from "./remote/environment.js";
import { where } from "./remote/where.js";

export type FolderMode =
  | { readonly kind: "local" }
  | { readonly kind: "cloud"; readonly remote: RemoteJson };

const MODE_BLIND = new Set(["help", "synth", "remote", "admin", "lock"]);

/**
 * Whether an order looks at the mode of the folder. Not those that do not read
 * or write the ledger of the folder: `synth`, `remote` (but its `upload`, which
 * runs in a cloud folder), `admin` (the S3 itself) and `lock`.
 */
export const looksAtMode = (positionals: readonly string[]): boolean =>
  !MODE_BLIND.has(positionals[0] ?? "") ||
  (positionals[0] === "remote" && positionals[1] === "upload");

export const resolveFolderMode = async (ledgerPath: string): Promise<FolderMode> => {
  const remote = await readRemoteJson(dirname(ledgerPath));
  if (remote === undefined) {
    return { kind: "local" };
  }
  if (await pathExists(ledgerPath)) {
    throw new DomainError(
      "folder_mode_ambiguous",
      "the folder has a local ledger and the identity of a cloud",
      { ledger: ledgerPath, origin: remote.origin },
    );
  }
  return { kind: "cloud", remote };
};

/** The session of a cloud folder cannot be used; said before any request. */
export class CloudSessionError extends Error {
  constructor(
    readonly code: "session_missing" | "session_expired",
    readonly details: {
      readonly origin: string;
      readonly device_id: string;
      readonly expires_at?: string;
    },
  ) {
    super(code);
    this.name = "CloudSessionError";
  }
}

/**
 * The ledger of a cloud folder as a `LedgerStore`: the session is looked up the
 * first time the ledger is needed, never before (`atlas fx status` or `atlas
 * prices status` need no session and no network). One `ApiLedgerStore`, so
 * the load a write is judged against is the one the use case made.
 */
export class CloudLedgerStore implements LedgerStore {
  private api:
    | Promise<{ store: ApiLedgerStore; remote: RemoteLedger; drafts: PendingDraftStore }>
    | undefined;

  constructor(
    private readonly ctx: () => Context,
    private readonly cloud: RemoteJson,
    readonly schema: LedgerSchema = CURRENT_LEDGER_SCHEMA,
  ) {}

  private open(): Promise<{
    store: ApiLedgerStore;
    remote: RemoteLedger;
    drafts: PendingDraftStore;
  }> {
    this.api ??= (async () => {
      const ctx = this.ctx();
      const env = ctx.remote ?? systemRemote();
      const at = await where(ctx, env);
      const entry = entryForRemote(at.credentials, this.cloud);
      const identity = { origin: this.cloud.origin, device_id: this.cloud.device_id };
      if (entry === undefined) {
        throw new CloudSessionError("session_missing", identity);
      }
      if (Date.parse(entry.expires_at) <= ctx.deps.clock.now().getTime()) {
        throw new CloudSessionError("session_expired", {
          ...identity,
          expires_at: entry.expires_at,
        });
      }
      const remote = httpRemote({ origin: entry.origin, fetch: env.fetch, token: entry.token });
      // The drafts of the cloud (ADR-0035, E6): the same token, nothing kept on this computer.
      const drafts = new ApiDraftStore({
        origin: entry.origin,
        fetch: env.fetch,
        token: entry.token,
      });
      return { store: new ApiLedgerStore(remote, this.schema), remote, drafts };
    })();
    // A failed lookup is not remembered: the next use asks again.
    this.api.catch(() => {
      this.api = undefined;
    });
    return this.api;
  }

  /** The drafts of the cloud, with the same session as the ledger. */
  async drafts(): Promise<PendingDraftStore> {
    return (await this.open()).drafts;
  }

  /** The remote itself, for what needs the bytes (`backup`, `export`, `remote upload`). */
  async remote(): Promise<RemoteLedger> {
    return (await this.open()).remote;
  }

  async load(): Promise<LoadedLedger> {
    return (await this.open()).store.load();
  }

  async append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }> {
    return (await this.open()).store.append(events, etag);
  }

  async findOutcome(ids: readonly string[]) {
    return (await this.open()).store.findOutcome(ids);
  }

  async replace(): Promise<{ etag: string }> {
    return (await this.open()).store.replace();
  }

  async appendLines(): Promise<{ etag: string }> {
    return (await this.open()).store.appendLines();
  }

  async replaceLines(): Promise<{ etag: string }> {
    return (await this.open()).store.replaceLines();
  }
}

/** The cloud store of a context, or undefined in a local folder. */
export const cloudStoreOf = (ctx: Context): CloudLedgerStore | undefined =>
  ctx.deps.store instanceof CloudLedgerStore ? ctx.deps.store : undefined;
