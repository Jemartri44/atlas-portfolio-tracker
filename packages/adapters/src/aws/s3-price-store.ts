// `prices/` in the bucket (feature 016, E2; ADR-0031; plan §7.2), written by
// **the prices job only**. In the folder, `transact` holds the lock of the
// folder around what it reads and writes; S3 has no lock and no transaction,
// so here each write is conditional on **what that same transaction read** —
// `If-Match` on its ETag, `If-None-Match: *` when nothing was there — and is
// made at once. A write whose condition fails is `PriceStoreConflict`, and the
// run stops **without retrying** (§8.1 P11): the calls already reserved in
// `_status.json` stay counted — never fewer than were made — and a file of
// closes is written whole or not at all (one `PutObject`).
//
// Two refusals, the second lock of Q1: the cloud never writes
// `prices/symbols.json`, whose one writer is `atlas admin prices push`
// (§8.1 P18), and never purges a file. And `prices/config.json` does not
// exist in the cloud (§8.2 M5): `config()` gives the configuration of the
// function, and never reads the bucket.

import type { AssetId } from "@atlas/domain";
import { type PriceStore, type PriceTransaction, priceFileName } from "@atlas/domain/quotes";
import type { ObjectStore } from "./object-store.js";

const PREFIX = "prices/";
const SYMBOLS = `${PREFIX}symbols.json`;
const STATUS = `${PREFIX}_status.json`;

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const encoder = new TextEncoder();

/** A write of `prices/` that did not happen: another run, or the administration, wrote first. */
export class PriceStoreConflict extends Error {
  override readonly name = "PriceStoreConflict";
  constructor() {
    super("prices/ changed while it was being written");
  }
}

/** A write the cloud never makes: `symbols.json` or a purge (Q1). */
export class PriceStoreRefused extends Error {
  override readonly name = "PriceStoreRefused";
  constructor(readonly code: "cloud_symbols_read_only" | "cloud_purge_refused") {
    super(code);
  }
}

export class S3PriceStore implements PriceStore {
  constructor(
    private readonly objects: ObjectStore,
    /** The configuration of the function, as the text of a `prices/config.json`. */
    private readonly configText: string,
  ) {}

  private async text(key: string): Promise<{ text: string; etag: string } | undefined> {
    const stored = await this.objects.get(key);
    return stored === undefined ? undefined : { text: utf8.decode(stored.body), etag: stored.etag };
  }

  config(): Promise<string | undefined> {
    return Promise.resolve(this.configText);
  }

  async symbols(): Promise<string | undefined> {
    return (await this.text(SYMBOLS))?.text;
  }

  async status(): Promise<string | undefined> {
    return (await this.text(STATUS))?.text;
  }

  async closes(assetId: AssetId): Promise<string | undefined> {
    return (await this.text(`${PREFIX}${priceFileName(assetId)}`))?.text;
  }

  async transact<T>(work: (tx: PriceTransaction) => Promise<T>): Promise<T> {
    /** What this transaction read: the ETag of each key, or `null` when it was absent. */
    const read = new Map<string, { text: string; etag: string } | null>();
    const readOnce = async (key: string) => {
      if (!read.has(key)) {
        read.set(key, (await this.text(key)) ?? null);
      }
      return read.get(key) ?? undefined;
    };
    /** What this transaction wrote at each key: a later write there must find exactly it. */
    const written = new Map<string, string>();
    const write = async (key: string, text: string): Promise<void> => {
      let was = await readOnce(key);
      if (written.has(key)) {
        // `putIfMatch` does not answer the new ETag: read it back, and it has
        // to be what this transaction wrote, or someone else wrote in between.
        was = (await this.text(key)) ?? undefined;
        if (was?.text !== written.get(key)) {
          throw new PriceStoreConflict();
        }
      }
      const body = encoder.encode(text);
      const done =
        was === undefined
          ? (await this.objects.putIfNoneMatch(key, body)) === "created"
          : (await this.objects.putIfMatch(key, body, was.etag)) === "written";
      if (!done) {
        throw new PriceStoreConflict();
      }
      written.set(key, text);
      read.set(key, { text, etag: "" });
    };
    const tx: PriceTransaction = {
      config: () => this.config(),
      symbols: async () => (await readOnce(SYMBOLS))?.text,
      status: async () => (await readOnce(STATUS))?.text,
      closes: async (assetId) => (await readOnce(`${PREFIX}${priceFileName(assetId)}`))?.text,
      appendCloses: async (assetId, lines) => {
        const key = `${PREFIX}${priceFileName(assetId)}`;
        const was = await readOnce(key);
        const before = was?.text ?? "";
        const separator = before === "" || before.endsWith("\n") ? "" : "\n";
        await write(key, `${before}${separator}${lines.map((line) => `${line}\n`).join("")}`);
      },
      rewriteCloses: () => Promise.reject(new PriceStoreRefused("cloud_purge_refused")),
      writeStatus: (text) => write(STATUS, text),
      writeSymbols: () => Promise.reject(new PriceStoreRefused("cloud_symbols_read_only")),
    };
    return work(tx);
  }
}
