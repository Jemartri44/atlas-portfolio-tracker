// @vitest-environment happy-dom
//
// Feature 023 (ADR-0035, E2b), the screens of writing: the form that survives a
// `412` and shows its effect again, the notice of a session about to end, the
// notice of a write whose answer was lost, and the copy that is only a download.

import { BlobLedgerStore } from "@atlas/adapters/blob";
import { recordEvent } from "@atlas/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadInto } from "../../src/ledger/actions.js";
import { copyName, copyText, downloadCopy, toCsv } from "../../src/ledger/copy.js";
import { store } from "../../src/ledger/state.js";
import RegistrarForm from "../../src/routes/registrar/form.jsx";
import CloudGate from "../../src/shell/CloudGate.jsx";
import PendingWrite from "../../src/shell/PendingWrite.jsx";
import { SessionNotice } from "../../src/shell/SessionNotice.jsx";
import { goldenLines, goldenText } from "../helpers/golden.js";
import { MemoryBlob } from "../helpers/memory-blob.js";
import { choose, press, settle, show, text, type, withGoldenLedger } from "../helpers/render.jsx";

withGoldenLedger();

const NOW = "2029-07-01T10:00:00.000Z";
const deps = (blob: MemoryBlob) => {
  let counter = 0;
  return {
    store: new BlobLedgerStore(blob),
    clock: { now: () => new Date(NOW) },
    random: (target: Uint8Array) => {
      counter += 1;
      target.fill((counter * 3) % 251);
    },
  };
};

const open = async (blob: MemoryBlob, expiresAt = "2099-01-01T00:00:00.000Z") =>
  loadInto({ deps: deps(blob), source: { kind: "cloud", expiresAt } });

afterEach(() => store.setPending(undefined));

describe("a form whose write finds the ledger changed (412)", () => {
  let blob: MemoryBlob;
  beforeEach(async () => {
    blob = new MemoryBlob(goldenText());
    await open(blob);
  });

  it("keeps what was typed, shows its effect again and writes only after a second yes", async () => {
    const host = await show("/registrar/cash-in", RegistrarForm, "/registrar/:tipo");
    const start = store.snapshot()?.events.length as number;
    choose(host, "f-account_id", "acc_mi");
    type(host, "f-value_date", "2027-11-02");
    type(host, "f-amount", "100");
    await settle(30);
    await press(host, "Ver el efecto");
    // Another device records something while this form is open.
    await recordEvent(deps(blob), {
      type: "cash_deposit",
      account_id: "acc_mi",
      value_date: "2027-11-03",
      amount: "5",
      currency: "EUR",
      fx_rate: "1",
      fx_rate_date: "2027-11-03",
    } as never);
    const confirm = () =>
      [...host.querySelectorAll("section.effect button")].find(
        (button) => button.textContent?.trim() === "Registrar",
      ) as HTMLButtonElement;
    confirm().click();
    await settle(80);
    expect(text(host)).toContain("Tus datos han cambiado");
    expect((host.querySelector("#f-amount") as HTMLInputElement).value).toBe("100");
    expect(store.snapshot()?.events).toHaveLength(start + 1);
    // The effect is there again, on the new ledger, and the second yes writes.
    confirm().click();
    await settle(80);
    expect(store.snapshot()?.events).toHaveLength(start + 2);
  });
});

describe("the copy of the ledger", () => {
  it("is the bytes of the ledger in JSONL and a table in CSV, and keeps nothing", async () => {
    await open(new MemoryBlob(goldenText()));
    expect(await copyText("jsonl")).toBe(`${goldenLines().join("\n")}\n`);
    const csv = (await copyText("csv")).split("\n");
    expect(csv[0]?.startsWith("schema_version,id,recorded_at,type")).toBe(true);
    expect(csv.length - 2).toBe(goldenLines().length);
    expect(toCsv([{ a: 'x,"y"' }])).toBe('a\n"x,""y"""');
    expect(copyName("csv", "2029-07-01")).toBe("atlas-copia-2029-07-01.csv");
  });

  it("an empty ledger is an empty file, and downloading leaves nothing on the device", async () => {
    await open(new MemoryBlob(""));
    expect(await copyText("jsonl")).toBe("");
    await open(new MemoryBlob(goldenText()));
    const holder = globalThis as { indexedDB?: unknown; caches?: unknown };
    const before = { indexedDB: holder.indexedDB, caches: holder.caches };
    const touched = vi.fn();
    holder.indexedDB = { open: touched };
    holder.caches = { open: touched, keys: touched, match: touched };
    window.localStorage.clear();
    window.sessionStorage.clear();
    const url = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:copy");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockReturnValue(undefined);
    try {
      expect(await downloadCopy("jsonl", "2029-07-01")).toBe("atlas-copia-2029-07-01.jsonl");
      expect(click).toHaveBeenCalledTimes(1);
      expect(url).toHaveBeenCalledTimes(1);
      expect(window.localStorage.length).toBe(0);
      expect(window.sessionStorage.length).toBe(0);
      expect(touched).not.toHaveBeenCalled();
    } finally {
      holder.indexedDB = before.indexedDB;
      holder.caches = before.caches;
      vi.restoreAllMocks();
    }
  });
});

describe("the notice of a session about to end", () => {
  it("shows under 15 minutes, with the way to sign in elsewhere, and nothing above", async () => {
    await open(new MemoryBlob(goldenText()), "2029-07-01T10:10:00.000Z");
    const soon = await show("/", SessionNotice);
    expect(text(soon)).toContain("Quedan 10 minutos");
    expect(text(soon)).toContain("Entrar de nuevo");
    document.body.innerHTML = "";
    await open(new MemoryBlob(goldenText()), "2029-07-01T12:00:00.000Z");
    const later = await show("/", SessionNotice);
    expect(text(later)).not.toContain("caduca");
    const opened = vi.spyOn(window, "open").mockReturnValue(null);
    document.body.innerHTML = "";
    await open(new MemoryBlob(goldenText()), "2029-07-01T10:05:00.000Z");
    const again = await show("/", SessionNotice);
    await press(again, "Entrar de nuevo");
    expect(opened).toHaveBeenCalledWith("/api/auth/login", "_blank", "noopener");
    opened.mockRestore();
  });

  it("says what is true of the form: it is kept, and the minutes are read again with time", async () => {
    let now = Date.parse(NOW);
    const timed = { ...deps(new MemoryBlob(goldenText())), clock: { now: () => new Date(now) } };
    await loadInto({
      deps: timed,
      source: { kind: "cloud", expiresAt: "2029-07-01T10:20:00.000Z" },
    });
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const host = await show("/", SessionNotice);
      expect(text(host)).not.toContain("caduca");
      now += 6 * 60_000;
      vi.advanceTimersByTime(30_000);
      await settle(10);
      expect(text(host)).toContain("Quedan 14 minutos");
      expect(text(host)).not.toContain("se pierde");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the gate while a write is unresolved", () => {
  it("warns before leaving for Google, because the pending write is only in memory", async () => {
    store.setLoad({ phase: "signed_out", reason: "expired" });
    store.setPending({ ids: ["01J00000000000000000000CH0"], state: "unknown", retry: vi.fn() });
    const assign = vi.spyOn(window.location, "assign").mockReturnValue(undefined);
    try {
      const host = await show("/", CloudGate);
      await press(host, "Entrar con Google");
      expect(assign).not.toHaveBeenCalled();
      expect(text(host)).toContain("compruébalo en Movimientos");
      await press(host, "Entrar de todos modos");
      expect(assign).toHaveBeenCalledWith("/api/auth/login");
    } finally {
      assign.mockRestore();
    }
  });
});

describe("the notice of a write whose answer was lost", () => {
  const pending = (state: "unknown" | "written" | "not_written" | "changed", retry = vi.fn()) =>
    store.setPending({ ids: ["01J00000000000000000000CH0"], state, retry });

  it("says each state in plain words and offers to send again only when nothing was written", async () => {
    pending("unknown");
    const host = await show("/", PendingWrite);
    expect(text(host)).toContain("No sabemos si se guardó");
    expect(text(host)).not.toContain("Enviar otra vez");
    pending("written");
    await settle(10);
    expect(text(host)).toContain("Ya está registrada");
    const retry = vi.fn(async () => ({ kind: "done", id: "x" }) as const);
    pending("not_written", retry);
    await settle(10);
    expect(text(host)).toContain("no se duplicará");
    await press(host, "Enviar otra vez");
    expect(retry).toHaveBeenCalledTimes(1);
    pending("changed");
    await settle(10);
    expect(text(host)).toContain("Tus datos han cambiado");
  });
});
