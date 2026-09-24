// The write flows, end to end and **without a DOM** (Q8, decision (k)): open a
// ledger, project it, build a draft, preview it, write it, and check the bytes
// of the file — the previous lines untouched and exactly the new ones appended,
// which is the contract of ADR-0003 and of `docs/data-schema.md` §5.
//
// This is the part where a bug costs data, so it is tested against the real
// golden ledger instead of a toy one.

import { BlobLedgerStore } from "@atlas/adapters/blob";
import { type Draft, decodeLine, type SupportedEvent, type UseCaseDeps } from "@atlas/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootDecision, loadInto, reloadLedger, restoreLedger } from "../src/ledger/actions.js";
import { toAppError } from "../src/ledger/errors.js";
import { validateImport } from "../src/ledger/export.js";
import { messageWithLine, store } from "../src/ledger/state.js";
import {
  changeSettings,
  correct,
  previewDraft,
  recordDraft,
  reverse,
} from "../src/ledger/write.js";
import { goldenText } from "./helpers/golden.js";
import { MemoryBlob } from "./helpers/memory-blob.js";

/**
 * A fixed clock and a **varying** random source: with both fixed, two events
 * recorded in the same test would get the same ULID, which is a collision of
 * the test and not of the application.
 */
const depsOf = (blob: MemoryBlob): UseCaseDeps => {
  let counter = 0;
  return {
    store: new BlobLedgerStore(blob),
    clock: { now: () => new Date("2029-07-01T10:00:00.000Z") },
    random: (target) => {
      counter += 1;
      target.fill(counter % 251);
    },
  };
};

const open = async (blob: MemoryBlob): Promise<void> => {
  await loadInto({ deps: depsOf(blob), source: { kind: "browser", persisted: false } });
};

const lines = (blob: MemoryBlob): string[] => blob.text.split("\n").filter((l) => l.length > 0);

/** A purchase of an asset that exists in the golden ledger. */
const buy = (overrides: Record<string, unknown> = {}): Draft<SupportedEvent> =>
  ({
    type: "buy",
    account_id: "acc_mi",
    asset_id: "ast_world",
    trade_date: "2029-06-28",
    value_date: "2029-06-29",
    quantity: "1",
    unit_price: "250",
    currency: "EUR",
    fx_rate: "1",
    fx_rate_date: "2029-06-29",
    fee: "0",
    source: "manual",
    ...overrides,
  }) as unknown as Draft<SupportedEvent>;

describe("opening a ledger", () => {
  beforeEach(() => {
    store.setLoad({ phase: "unconfigured" });
    store.setDeps(undefined);
    store.clearCache();
  });

  it("loads it, projects it once and publishes the snapshot", async () => {
    const blob = new MemoryBlob(goldenText());
    await open(blob);
    const phase = store.load();
    expect(phase.phase).toBe("ready");
    const snapshot = store.snapshot();
    expect(snapshot?.events).toHaveLength(200);
    expect(snapshot?.lines).toHaveLength(200);
    expect(store.invalidCount()).toBe(0);
    // Nothing was written just by reading.
    expect(blob.writes).toBe(0);
  });

  it("reports a broken line with its number instead of dying silently", async () => {
    const blob = new MemoryBlob(`${goldenText()}{"schema_version":1,"id":"x"}\n`);
    await open(blob);
    const phase = store.load();
    expect(phase.phase).toBe("failed");
    expect(phase.phase === "failed" && phase.error.line).toBe(201);
    expect(phase.phase === "failed" && phase.error.message).toContain("no es válida");
    // Named by its label, never by the key of the schema.
    expect(phase.phase === "failed" && phase.error.message).toContain("«Identificador»");
  });

  it("refuses a ledger written by a newer schema, and says what to do", async () => {
    const newer = goldenText().replace('"schema_version":1', '"schema_version":9');
    await open(new MemoryBlob(newer));
    const phase = store.load();
    expect(phase.phase).toBe("failed");
    expect(phase.phase === "failed" && phase.error.code).toBe("schema_too_new");
    expect(phase.phase === "failed" && phase.error.message).toContain("actualiza la aplicación");
  });

  it("memoises the projection per date and drops it when the ledger changes", async () => {
    const blob = new MemoryBlob(goldenText());
    await open(blob);
    const first = store.projectionAt("2029-06-30");
    expect(store.projectionAt("2029-06-30")).toBe(first);
    expect(store.projectionAt("2028-06-30")).not.toBe(first);
    await reloadLedger();
    expect(store.projectionAt("2029-06-30")).not.toBe(first);
  });
});

describe("recording", () => {
  beforeEach(() => {
    store.setLoad({ phase: "unconfigured" });
    store.setDeps(undefined);
    store.clearCache();
  });

  it("previews the effect without writing anything", async () => {
    const blob = new MemoryBlob(goldenText());
    await open(blob);
    const before = blob.text;
    const preview = await previewDraft(buy());
    expect(preview.candidate.type).toBe("buy");
    expect(preview.after.positions.length).toBeGreaterThan(0);
    expect(blob.text).toBe(before);
    expect(blob.writes).toBe(0);
  });

  it("appends exactly one line and leaves the previous ones byte for byte", async () => {
    const blob = new MemoryBlob(goldenText());
    await open(blob);
    const original = lines(blob);
    const result = await recordDraft(buy());
    expect(result.ok).toBe(true);
    const after = lines(blob);
    expect(after).toHaveLength(original.length + 1);
    expect(after.slice(0, original.length)).toEqual(original);
    const written = decodeLine(after[after.length - 1] as string).event;
    expect(written.type).toBe("buy");
    expect(written.recorded_at).toBe("2029-07-01T10:00:00.000Z");
    // And the store reprojected once, so the screens see it.
    expect(store.snapshot()?.events).toHaveLength(201);
  });

  it("reports a repeated fingerprint and only writes when it is confirmed", async () => {
    const blob = new MemoryBlob(goldenText());
    await open(blob);
    await recordDraft(buy());
    const linesAfterFirst = lines(blob).length;
    const repeated = await recordDraft(buy());
    expect(repeated.ok).toBe(false);
    expect(repeated.ok === false && repeated.failure.kind).toBe("duplicate");
    expect(lines(blob)).toHaveLength(linesAfterFirst);
    const confirmed = await recordDraft(buy(), { confirmDuplicate: true });
    expect(confirmed.ok).toBe(true);
    expect(lines(blob)).toHaveLength(linesAfterFirst + 1);
  });

  it("never overwrites what another client wrote: the conflict is reported and the ledger reloaded", async () => {
    const blob = new MemoryBlob(goldenText());
    await open(blob);
    const loaded = store.snapshot()?.events.length ?? 0;
    // The CLI writes while the form was being filled in.
    const otherClient = lines(new MemoryBlob(goldenText()));
    blob.text = `${otherClient.join("\n")}\n${JSON.stringify({
      schema_version: 1,
      id: "01ARYZ6S41TSV4RRFFQ69ZZZZ1",
      recorded_at: "2029-06-30T10:00:00.000Z",
      type: "cash_deposit",
      account_id: "acc_mi",
      value_date: "2029-06-30",
      amount: "100",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "2029-06-29",
      fingerprint: "sha256:otro",
    })}\n`;
    const before = blob.text;
    const result = await recordDraft(buy());
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.kind).toBe("conflict");
    // Nothing written, and the snapshot now holds what the other client left.
    expect(blob.text).toBe(before);
    expect(store.snapshot()?.events.length).toBe(loaded + 1);
  });

  it("refuses a sale with no position, with the error of the domain in Spanish", async () => {
    const blob = new MemoryBlob(goldenText());
    await open(blob);
    const result = await recordDraft(buy({ type: "sell", quantity: "999999", unit_price: "250" }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.kind).toBe("error");
    if (result.ok === false && result.failure.kind === "error") {
      expect(result.failure.error.code).toBe("insufficient_position");
      expect(result.failure.error.message).toContain("no tiene suficiente");
    }
    expect(lines(blob)).toHaveLength(200);
  });
});

describe("rectifying", () => {
  beforeEach(() => {
    store.setLoad({ phase: "unconfigured" });
    store.setDeps(undefined);
    store.clearCache();
  });

  it("writes two lines to correct: the reversal and the corrected event", async () => {
    const blob = new MemoryBlob(goldenText());
    await open(blob);
    const recorded = await recordDraft(buy());
    expect(recorded.ok).toBe(true);
    const id = recorded.ok ? recorded.value.event.id : "";
    const count = lines(blob).length;
    const corrected = await correct(id, buy({ quantity: "2" }), "cantidad mal anotada");
    expect(corrected.ok).toBe(true);
    const after = lines(blob);
    expect(after).toHaveLength(count + 2);
    const [reversalLine, correctedLine] = after.slice(-2);
    const reversal = decodeLine(reversalLine as string).event;
    const replacement = decodeLine(correctedLine as string).event;
    expect(reversal.type).toBe("reversal");
    expect((reversal as { reverses_id: string }).reverses_id).toBe(id);
    expect((replacement as { corrects_id?: string }).corrects_id).toBe(id);
    expect((replacement as { quantity: string }).quantity).toBe("2");
  });

  it("writes one line to reverse, and nothing is ever deleted", async () => {
    const blob = new MemoryBlob(goldenText());
    await open(blob);
    const recorded = await recordDraft(buy());
    const id = recorded.ok ? recorded.value.event.id : "";
    const count = lines(blob).length;
    const result = await reverse(id, "me equivoqué");
    expect(result.ok).toBe(true);
    expect(lines(blob)).toHaveLength(count + 1);
    expect(lines(blob).slice(0, count)).toEqual(lines(new MemoryBlob(blob.text)).slice(0, count));
  });

  it("refuses to reverse what later events consumed, and lists them", async () => {
    const blob = new MemoryBlob(goldenText());
    await open(blob);
    // `ast_alpha` was bought once and sold whole: reversing the purchase would
    // leave the sale with nothing to sell (ADR-0003).
    const events = store.snapshot()?.events ?? [];
    const consumed = events.find(
      (event) => event.type === "buy" && (event as { asset_id: string }).asset_id === "ast_alpha",
    );
    const result = await reverse(consumed?.id ?? "", "a ver");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure.kind).toBe("dependents");
    if (result.ok === false && result.failure.kind === "dependents") {
      // Whatever consumed it is named, with its reason, so it can be
      // rectified first: here a corporate action transformed those lots.
      expect(result.failure.affected.length).toBeGreaterThan(0);
      expect(result.failure.affected[0]?.error.length).toBeGreaterThan(0);
    }
    // Nothing was written: the ledger never ends up incoherent.
    expect(lines(blob)).toHaveLength(200);
  });

  it("warns when the rectified event belongs to a previous tax year", async () => {
    const blob = new MemoryBlob(goldenText());
    await open(blob);
    const events = store.snapshot()?.events ?? [];
    const old = events.find(
      (event) =>
        event.type === "cash_deposit" &&
        (event as { value_date: string }).value_date < "2028-01-01",
    );
    const result = await reverse(old?.id ?? "", "prueba de ejercicio anterior");
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.priorYear).toBe(true);
  });
});

describe("changing the configuration", () => {
  beforeEach(() => {
    store.setLoad({ phase: "unconfigured" });
    store.setDeps(undefined);
    store.clearCache();
  });

  it("writes the whole configuration as one event", async () => {
    const blob = new MemoryBlob(goldenText());
    await open(blob);
    const snapshot = store.snapshot();
    const settings = snapshot?.state.settingsHistory.at(-1)?.settings;
    const result = await changeSettings({
      ...(settings as NonNullable<typeof settings>),
      deviation_threshold_pp: "7",
    });
    expect(result.ok).toBe(true);
    const written = decodeLine(lines(blob).at(-1) as string).event;
    expect(written.type).toBe("settings_changed");
    expect(
      (written as { settings: { deviation_threshold_pp?: string } }).settings
        .deviation_threshold_pp,
    ).toBe("7");
  });
});

/*
 * The boot. It used to be a race: the store started `unconfigured`, and
 * `RequireLedger` sends that phase straight to `/libro` with a `<Navigate>`,
 * so whichever finished first — the lazy route or the asynchronous restore —
 * decided the first screen. With the ledger already chosen and stored, a reload
 * landed on the opening screen instead of the summary (review of 2026-09-18).
 */
describe("the boot", () => {
  const removed: string[] = [];
  const fakeWindow = (stored: string | undefined): void => {
    removed.length = 0;
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => (key === "atlas.source" ? (stored ?? null) : null),
        setItem: () => undefined,
        removeItem: (key: string) => removed.push(key),
      },
    };
  };

  afterEach(() => {
    (globalThis as { window?: unknown }).window = undefined;
  });

  it("starts loading, so nothing redirects before the decision is taken", async () => {
    vi.resetModules();
    const fresh = (await import(
      "../src/ledger/state.js"
    )) as typeof import("../src/ledger/state.js");
    expect(fresh.store.load().phase).toBe("loading");
  });

  it("reads the remembered choice as a rule", () => {
    // A ledger inside this browser is reopened with no gesture at all.
    expect(bootDecision("browser")).toBe("browser");
    // The web no longer writes in the console's folder (feature 012): a
    // session that did is not reopened, and the opening screen says why.
    expect(bootDecision("directory")).toBe("retired-folder");
    expect(bootDecision(undefined)).toBe("nothing");
  });

  it("ends unconfigured when nothing was remembered", async () => {
    fakeWindow(undefined);
    await restoreLedger();
    expect(store.load().phase).toBe("unconfigured");
  });

  it("tries to reopen the browser ledger when that is what was chosen", async () => {
    fakeWindow("browser");
    // There is no IndexedDB in this process, so opening it fails — and that is
    // the point: it **attempts** it instead of asking again, and a failure
    // explains itself with a way out rather than leaving a skeleton for ever.
    await restoreLedger();
    const phase = store.load();
    expect(phase.phase).toBe("failed");
    if (phase.phase === "failed") {
      expect(phase.error.code).toBe("storage_unavailable");
      expect(phase.error.action?.to).toBe("/libro");
    }
  });

  it("does not reopen a folder: says the web no longer writes there, once", async () => {
    fakeWindow("directory");
    await restoreLedger();
    expect(store.load()).toEqual({ phase: "unconfigured", retiredFolder: true });
    expect(removed).toEqual(["atlas.source"]);
  });
});

describe("toAppError", () => {
  it("explains a denied permission and where to fix it", () => {
    const error = toAppError(new DOMException("nope", "NotAllowedError"));
    expect(error.code).toBe("permission_denied");
    expect(error.action?.to).toBe("/libro");
  });

  it("explains a browser that cannot store anything", () => {
    const failure = new Error("no idb");
    failure.name = "StorageUnavailable";
    expect(toAppError(failure).code).toBe("storage_unavailable");
  });

  it("does not swallow an unexpected failure, and frames it in Spanish", () => {
    expect(toAppError(new Error("algo raro")).message).toMatch(
      /^Algo ha fallado .*Detalle: algo raro$/,
    );
    expect(toAppError("texto suelto").message).toContain("Detalle: texto suelto");
  });
});

describe("importing a file", () => {
  /**
   * The order is the whole point (inventory V6): the screen used to open the
   * browser storage and **then** validate, so a file that was not a ledger left
   * an empty ledger open and remembered. Validation is now a step of its own,
   * and it is the first one.
   */
  it("refuses a file that is not a ledger, before anything is opened", async () => {
    await expect(validateImport("esto no es un libro\n")).rejects.toThrow();
    await expect(validateImport('{"hola": 1}\n')).rejects.toThrow();
  });

  it("says a file that is not a ledger lacks the expected format, and where", async () => {
    const said = async (text: string): Promise<string> =>
      messageWithLine(toAppError(await validateImport(text).catch((error: unknown) => error)));
    expect(await said("esto no es un libro\n")).toBe(
      "El archivo no tiene el formato esperado: la línea 1 no se puede leer como datos de Atlas.",
    );
    expect(await said("[]\n")).toBe(
      "El archivo no tiene el formato esperado: la línea 1 no es un evento.",
    );
  });

  it("refuses a ledger written by a newer schema", async () => {
    const line = JSON.stringify({
      schema_version: 99,
      id: "01ARYZ6S41TSV4RRFFQ69G5FA0",
      recorded_at: "2026-09-01T18:22:05.000Z",
      type: "account_created",
    });
    await expect(validateImport(`${line}\n`)).rejects.toThrow();
  });

  it("accepts an empty file: a ledger with no events is a ledger", async () => {
    await expect(validateImport("")).resolves.toBe(0);
  });

  it("counts the events of a good one", async () => {
    const text = goldenText();
    await expect(validateImport(text)).resolves.toBeGreaterThan(100);
  });
});

describe("toAppError: a file that cannot be read", () => {
  it("says it in Spanish, with what to do, whatever the browser called it", () => {
    for (const name of ["NotReadableError", "NotFoundError", "EncodingError"]) {
      const error = toAppError(
        new DOMException(
          "The requested file could not be read, typically due to permission problems",
          name,
        ),
      );
      expect(error.code).toBe("file_unreadable");
      expect(error.message).toContain("No se ha podido leer el archivo");
      expect(error.message).not.toMatch(/requested|permission/);
    }
  });
});

describe("toAppError: the storage that fills up", () => {
  /**
   * The worst case of a phone: the ledger lives in the browser and the write
   * does not fit. It must say that **nothing was written**, and offer the way
   * out — exporting — rather than the English text of a `DOMException`.
   */
  it("explains a full browser storage and offers the export", () => {
    const error = toAppError(new DOMException("quota", "QuotaExceededError"));

    expect(error.code).toBe("storage_full");
    expect(error.message).toContain("no se ha escrito nada");
    expect(error.action?.to).toBe("/ajustes");
  });
});
