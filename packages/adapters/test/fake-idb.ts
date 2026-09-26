// A small double of IndexedDB, for the tests of `BrowserLedgerBlob` in Node
// (feature 012, block 0). No dependency: it models only what the ledger needs,
// and it models the three things that decide whether a line can be lost.
//
// 1. **Transactions on the same store run one after the other**, in the order
//    they were created. Real IndexedDB lets read-only transactions overlap;
//    this double is stricter, which only makes a race easier to reproduce.
// 2. **A transaction commits by itself** as soon as a request callback returns
//    and no request is pending, and a request made after that throws
//    `TransactionInactiveError`. A read and a write separated by anything that
//    is not an IndexedDB callback land in two transactions, or fail: that is
//    the trap of the prompt (§3, block 0), and here it bites. It is stricter
//    than browsers, which also allow promise continuations during the event
//    dispatch; the code under test uses plain callbacks.
// 3. **A failed request aborts the transaction** unless its handler calls
//    `preventDefault()`, and an abort rolls back everything it wrote.
//
// `commits` keeps a copy of the store after every committed transaction, with
// the keys it wrote, so a test can ask what the ledger was at the moment a
// value was written.

type Values = Map<string, unknown>;

export interface Commit {
  store: string;
  written: string[];
  snapshot: Values;
}

class FakeRequest {
  result: unknown;
  error: DOMException | null = null;
  onsuccess: ((event: { target: FakeRequest }) => void) | null = null;
  onerror: ((event: { target: FakeRequest; preventDefault(): void }) => void) | null = null;
}

type Operation = { request: FakeRequest; run: () => unknown };

class FakeObjectStore {
  constructor(
    private readonly tx: FakeTransaction,
    private readonly values: Values,
  ) {}

  private request(run: () => unknown): FakeRequest {
    const request = new FakeRequest();
    this.tx.enqueue({ request, run });
    return request;
  }

  get(key: string): FakeRequest {
    return this.request(() => structuredClone(this.values.get(key)));
  }

  put(value: unknown, key: string): FakeRequest {
    return this.request(() => {
      this.tx.write(key, structuredClone(value));
      return key;
    });
  }

  add(value: unknown, key: string): FakeRequest {
    return this.request(() => {
      if (this.values.has(key)) {
        throw new DOMException("Key already exists in the object store.", "ConstraintError");
      }
      this.tx.write(key, structuredClone(value));
      return key;
    });
  }

  delete(key: string): FakeRequest {
    return this.request(() => {
      this.tx.remove(key);
      return undefined;
    });
  }

  /** Keys in key order, as IndexedDB returns them. */
  getAllKeys(): FakeRequest {
    return this.request(() => [...this.values.keys()].sort());
  }

  getAll(): FakeRequest {
    return this.request(() =>
      [...this.values.keys()].sort().map((key) => structuredClone(this.values.get(key))),
    );
  }
}

export class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  error: DOMException | null = null;
  private readonly queue: Operation[] = [];
  private active = true;
  private state: "waiting" | "running" | "done" = "waiting";
  private before: Values = new Map();
  private readonly written = new Set<string>();

  constructor(
    private readonly db: FakeDatabase,
    readonly storeName: string,
    readonly mode: IDBTransactionMode,
  ) {
    // Requests made synchronously after creation are allowed; after this
    // turn of the event loop the transaction is only active inside callbacks.
    setTimeout(() => {
      this.active = false;
    }, 0);
  }

  objectStore(name: string): FakeObjectStore {
    if (name !== this.storeName) {
      throw new DOMException(`store ${name} is not in this transaction`, "NotFoundError");
    }
    return new FakeObjectStore(this, this.db.store(name));
  }

  enqueue(operation: Operation): void {
    if (!this.active || this.state === "done") {
      throw new DOMException("The transaction is not active.", "TransactionInactiveError");
    }
    this.queue.push(operation);
  }

  write(key: string, value: unknown): void {
    if (this.mode !== "readwrite") {
      throw new DOMException("read-only transaction", "ReadOnlyError");
    }
    if (this.db.takeCut()) {
      // The tab dies in the middle of a write (feature 015, E3, point 7): the
      // request fails, the transaction aborts and rolls back everything.
      throw new DOMException("cut at web write", "AbortError");
    }
    this.db.store(this.storeName).set(key, value);
    this.written.add(key);
  }

  remove(key: string): void {
    if (this.mode !== "readwrite") {
      throw new DOMException("read-only transaction", "ReadOnlyError");
    }
    this.db.store(this.storeName).delete(key);
    this.written.add(key);
  }

  abort(): void {
    if (this.state === "done") {
      throw new DOMException("already finished", "InvalidStateError");
    }
    this.finish("abort");
  }

  /** Called by the database when every earlier transaction on the store is done. */
  start(): void {
    if (this.state === "done") {
      // Aborted before it ever ran: nothing to roll back, let the next one go.
      this.db.done(this);
      return;
    }
    this.before = new Map(this.db.store(this.storeName));
    this.state = "running";
    this.step();
  }

  private step(): void {
    setTimeout(() => {
      if (this.state !== "running") {
        return;
      }
      const operation = this.queue.shift();
      if (operation === undefined) {
        this.finish("commit");
        return;
      }
      const { request, run } = operation;
      this.active = true;
      let failed = false;
      let prevented = false;
      try {
        request.result = run();
      } catch (error) {
        failed = true;
        request.error = error as DOMException;
      }
      try {
        if (failed) {
          request.onerror?.({ target: request, preventDefault: () => (prevented = true) });
        } else {
          request.onsuccess?.({ target: request });
        }
      } finally {
        this.active = false;
      }
      if (this.state !== "running") {
        return;
      }
      if (failed && !prevented) {
        this.error = request.error;
        this.finish("abort");
        return;
      }
      this.step();
    }, 0);
  }

  private finish(outcome: "commit" | "abort"): void {
    const ran = this.state === "running";
    this.state = "done";
    this.queue.length = 0;
    if (outcome === "abort" && ran) {
      const values = this.db.store(this.storeName);
      values.clear();
      for (const [key, value] of this.before) {
        values.set(key, value);
      }
    } else if (this.written.size > 0) {
      this.db.commits.push({
        store: this.storeName,
        written: [...this.written],
        snapshot: structuredClone(new Map(this.db.store(this.storeName))),
      });
    }
    setTimeout(() => {
      if (outcome === "commit") {
        this.oncomplete?.();
      } else {
        this.onerror?.();
        this.onabort?.();
      }
      this.db.done(this);
    }, 0);
  }
}

export class FakeDatabase {
  readonly commits: Commit[] = [];
  /** Every transaction ever created, with its mode: what a test counts. */
  readonly created: IDBTransactionMode[] = [];
  /** The durability each transaction asked for, in the same order (feature 014). */
  readonly durability: IDBTransactionDurability[] = [];
  private readonly stores = new Map<string, Values>();
  private readonly pending: FakeTransaction[] = [];
  private cuts = 0;

  /** The next write of a read-write transaction fails as a cut: it aborts and rolls back. */
  cutNextWrite(): void {
    this.cuts = 1;
  }

  /** Whether a write has to fail as a cut now; consumes it. */
  takeCut(): boolean {
    if (this.cuts === 0) {
      return false;
    }
    this.cuts -= 1;
    return true;
  }
  private running: FakeTransaction | undefined;

  constructor(storeNames: readonly string[]) {
    for (const name of storeNames) {
      this.stores.set(name, new Map());
    }
  }

  /** What an upgrade handler reads and calls. */
  readonly objectStoreNames = { contains: (name: string): boolean => this.stores.has(name) };

  createObjectStore(name: string): void {
    this.stores.set(name, new Map());
  }

  store(name: string): Values {
    const values = this.stores.get(name);
    if (values === undefined) {
      throw new DOMException(`no store ${name}`, "NotFoundError");
    }
    return values;
  }

  transaction(
    storeName: string,
    mode: IDBTransactionMode = "readonly",
    options?: IDBTransactionOptions,
  ): FakeTransaction {
    const tx = new FakeTransaction(this, storeName, mode);
    this.created.push(mode);
    this.durability.push(options?.durability ?? "default");
    this.pending.push(tx);
    queueMicrotask(() => this.schedule());
    return tx;
  }

  done(tx: FakeTransaction): void {
    if (this.running === tx) {
      this.running = undefined;
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.running !== undefined) {
      return;
    }
    const next = this.pending.shift();
    if (next !== undefined) {
      this.running = next;
      next.start();
    }
  }

  /** As the code under test sees it. */
  asIdb(): IDBDatabase {
    return this as unknown as IDBDatabase;
  }
}

/**
 * `indexedDB` itself, for code that opens the database by name (`openAtlasDb`):
 * the first open of a name runs the upgrade handler, as a new database does.
 */
export class FakeIdbFactory {
  readonly databases = new Map<string, FakeDatabase>();
  /** The version each database was last opened at. */
  readonly versions = new Map<string, number>();
  /** Another tab holds an older version open: the next upgrade is blocked. */
  blocked = false;

  open(name: string, version = 1): unknown {
    const request: {
      result?: unknown;
      onsuccess: (() => void) | null;
      onerror: (() => void) | null;
      onupgradeneeded: (() => void) | null;
      onblocked: (() => void) | null;
    } = { onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
    setTimeout(() => {
      let db = this.databases.get(name);
      const created = db === undefined;
      if (db === undefined) {
        db = new FakeDatabase([]);
        this.databases.set(name, db);
      }
      request.result = db;
      const upgrade = created || version > (this.versions.get(name) ?? 0);
      if (upgrade && this.blocked) {
        request.onblocked?.();
        return;
      }
      if (upgrade) {
        this.versions.set(name, version);
        request.onupgradeneeded?.();
      }
      request.onsuccess?.();
    }, 0);
    return request;
  }
}
