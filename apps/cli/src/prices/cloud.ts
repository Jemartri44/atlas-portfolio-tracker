// The console of a synced folder takes the prices from the cloud (feature
// 016, E3, block 1; ADR-0031, «Una sola clave, un solo presupuesto diario»;
// §8.1 P7 and P11): the API's index, and each file of closes whose version the
// folder does not hold yet, with the token of the folder — **all of it before
// the lock** — and then, **under the lock**, the lines added with the rules of
// the 013 and `prices/_cloud.json` written. No source is called: the cloud
// already spent the day's calls of the plans the console shares with it.

import { FilePriceStore, folderSyncPresence } from "@atlas/adapters";
import { httpReference } from "@atlas/adapters/reference-http";
import { type AssetId, todayInMadrid } from "@atlas/domain";
import { entryToSync, folderSyncState } from "@atlas/domain/access";
import {
  assetOfPriceFile,
  changedPriceFiles,
  cloudLinesToAppend,
  encodeCloseLine,
  parseCloudPull,
  parsePriceConfig,
  parseSymbols,
  readCloseFile,
  serializeCloudPull,
} from "@atlas/domain/quotes";
import type { Context } from "../context.js";
import { describeEntryRefusal } from "../output/sync.js";
import { systemRemote } from "../remote/environment.js";
import { where } from "../remote/where.js";
import { folderOf } from "./load.js";

/** Where the prices of a folder come from. */
export type PriceOrigin =
  /** Never synced: the sources, with the whole plans. */
  | { readonly kind: "unsynced" }
  /** Synced once, not now (half started, deactivated, with no remote.json): the sources, sharing the plans. */
  | { readonly kind: "shared" }
  | { readonly kind: "cloud"; readonly origin: string; readonly token: string }
  /** Synced, and its session cannot be used: said, never falling to the sources. */
  | { readonly kind: "refused"; readonly message: string };

export const priceOriginOf = async (ctx: Context): Promise<PriceOrigin> => {
  const { presence } = await folderSyncPresence(folderOf(ctx));
  if (!presence.present) {
    return { kind: "unsynced" };
  }
  const at = await where(ctx, ctx.remote ?? systemRemote());
  const state = folderSyncState(presence, at.remote);
  if (state.state !== "synced" || !state.enabled) {
    return { kind: "shared" };
  }
  const choice = entryToSync(state, at.credentials);
  if ("refused" in choice) {
    return {
      kind: "refused",
      message: `(${choice.refused}) ${describeEntryRefusal(choice, at.remote ?? {})}`,
    };
  }
  return { kind: "cloud", origin: choice.entry.origin, token: choice.entry.token };
};

export interface PulledFile {
  readonly asset_id: AssetId;
  readonly added: number;
  /** Why nothing was added from it: a file that does not read, here or in the cloud. */
  readonly problem?: "local_unreadable" | "cloud_unreadable";
}

export type PullOutcome =
  | { readonly kind: "no_prices" }
  | {
      readonly kind: "pulled";
      readonly pulled_at: string;
      readonly files: readonly PulledFile[];
      /** Lines left out, by why (review of PR #108, B1 and N5). */
      readonly discarded: { readonly future: number; readonly currency_mismatch: number };
    };

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Pulls the closes of the cloud into the folder: the network first, then the lock. */
export const pullFromCloud = async (
  ctx: Context,
  cloud: Extract<PriceOrigin, { kind: "cloud" }>,
): Promise<PullOutcome> => {
  const env = ctx.remote ?? systemRemote();
  const reference = httpReference({ origin: cloud.origin, fetch: env.fetch, token: cloud.token });
  const store = new FilePriceStore(folderOf(ctx));
  const pull = parseCloudPull(await store.cloudPull());
  // 1. The network, with the lock free.
  const index = await reference.index();
  const closesInCloud = index.prices.filter((entry) => assetOfPriceFile(entry.name) !== undefined);
  if (closesInCloud.length === 0) {
    return { kind: "no_prices" };
  }
  const held = pull?.origin === cloud.origin ? pull.versions : {};
  const fetched: {
    name: string;
    asset_id: AssetId;
    /** Absent: not modified. `null`: bytes that are not UTF-8 (N2). */
    text?: string | null;
    version: string;
  }[] = [];
  for (const entry of changedPriceFiles(closesInCloud, pull, cloud.origin)) {
    const read = await reference.get(
      "prices",
      entry.name,
      Object.hasOwn(held, entry.name) ? held[entry.name] : undefined,
    );
    if (read.kind === "missing") {
      continue;
    }
    const asset_id = assetOfPriceFile(entry.name) as AssetId;
    if (read.kind === "not_modified") {
      fetched.push({ name: entry.name, asset_id, version: entry.version });
      continue;
    }
    let text: string | null;
    try {
      text = utf8.decode(read.bytes);
    } catch {
      // Bytes that are not UTF-8 are a file that does not read, never an
      // empty one taken as held (review of PR #108, N2).
      text = null;
    }
    fetched.push({ name: entry.name, asset_id, text, version: read.version });
  }
  const pulled_at = ctx.deps.clock.now().toISOString();
  // Never the day in course, as the 013 never asks a source for it (B1).
  const today = todayInMadrid(ctx.deps.clock);
  // 2. Compare and write, under the lock.
  const files = await store.transact(async (tx) => {
    const config = parsePriceConfig(await tx.config(), { sharedWithCloud: true });
    // The currency the folder declares for each source is the only one taken (N5).
    const symbols = parseSymbols(await tx.symbols());
    const versions: Record<string, string> = { ...held };
    const done: PulledFile[] = [];
    const discarded = { future: 0, currency_mismatch: 0 };
    for (const file of fetched) {
      if (file.text === undefined) {
        // Not modified: what the folder holds is that version.
        versions[file.name] = file.version;
        continue;
      }
      let cloudLines: ReturnType<typeof readCloseFile>;
      try {
        if (file.text === null) {
          throw new RangeError("not UTF-8");
        }
        cloudLines = readCloseFile(file.asset_id, file.text);
      } catch {
        // Not recorded as held: asked again next time.
        done.push({ asset_id: file.asset_id, added: 0, problem: "cloud_unreadable" });
        continue;
      }
      const localText = await tx.closes(file.asset_id);
      let localLines: ReturnType<typeof readCloseFile>;
      try {
        localLines = localText === undefined ? [] : readCloseFile(file.asset_id, localText);
      } catch {
        // A local file that does not read is never touched (the 013's rule).
        done.push({ asset_id: file.asset_id, added: 0, problem: "local_unreadable" });
        continue;
      }
      const entry = Object.hasOwn(symbols.assets, file.asset_id)
        ? symbols.assets[file.asset_id]
        : undefined;
      const merge = cloudLinesToAppend(localLines, cloudLines, config.source_order, {
        today,
        ...(entry === undefined ? {} : { declared: entry.currencies }),
      });
      if (merge.added.length > 0) {
        await tx.appendCloses(file.asset_id, merge.added.map(encodeCloseLine));
      }
      discarded.future += merge.future;
      discarded.currency_mismatch += merge.mismatched;
      versions[file.name] = file.version;
      done.push({ asset_id: file.asset_id, added: merge.added.length });
    }
    await tx.writeCloudPull(
      serializeCloudPull({
        cloud_format: 1,
        origin: cloud.origin,
        pulled_at,
        versions,
        discarded,
      }),
    );
    return { done, discarded };
  });
  return { kind: "pulled", pulled_at, files: files.done, discarded: files.discarded };
};
