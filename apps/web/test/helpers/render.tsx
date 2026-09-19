// Rendering a screen of the application in a test: the golden ledger loaded in
// the store, the router in front, and the few gestures a test needs — type,
// choose, press. The screens are rendered, not their view-models, because the
// defects this protects against lived in the wiring between the two.
//
// Only for files that declare `@vitest-environment happy-dom`.

import { BlobLedgerStore, type LedgerBlob } from "@atlas/adapters/blob";
import type { UseCaseDeps } from "@atlas/domain";
import { Route, Router } from "@solidjs/router";
import type { JSX } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, vi } from "vitest";
import { loadInto } from "../../src/ledger/actions.js";
import { store } from "../../src/ledger/state.js";
import { AppShell } from "../../src/shell/AppShell.jsx";
import { goldenText } from "./golden.js";

class MemoryBlob implements LedgerBlob {
  readonly label = "memoria";
  constructor(readonly text: string) {}
  async read(): Promise<Uint8Array> {
    return new TextEncoder().encode(this.text);
  }
  async write(): Promise<void> {
    throw new Error("estas pruebas no escriben");
  }
  async writeArchive(): Promise<void> {
    throw new Error("estas pruebas no escriben");
  }
}

const deps = (text: string): UseCaseDeps => ({
  store: new BlobLedgerStore(new MemoryBlob(text)),
  clock: { now: () => new Date("2029-07-01T10:00:00.000Z") },
  random: (target) => target.fill(7),
});

/** Opens a ledger, the golden one unless another text is given. */
export const openLedger = async (text: string = goldenText()): Promise<void> =>
  loadInto({ deps: deps(text), source: { kind: "browser", persisted: false } });

const disposers: (() => void)[] = [];

/**
 * Registers, in the calling test file, the golden ledger before each test and
 * a clean page, a real clock and the privacy mode off after it.
 */
export const withGoldenLedger = (): void => {
  beforeEach(async () => {
    store.setPrivacy(false);
    await openLedger();
  });
  afterEach(() => {
    for (const dispose of disposers.splice(0)) {
      dispose();
    }
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
    store.setPrivacy(false);
    vi.useRealTimers();
  });
};

export const settle = async (ms = 0): Promise<void> => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, ms));
};

/** Renders a component at a URL, behind the route pattern it has in the application. */
export const show = async (
  url: string,
  screen: (props: never) => JSX.Element,
  pattern = "*",
): Promise<HTMLElement> => {
  window.history.replaceState({}, "", url);
  const host = document.createElement("div");
  document.body.append(host);
  disposers.push(
    render(
      () => (
        <Router>
          <Route path={pattern} component={screen as never} />
        </Router>
      ),
      host,
    ),
  );
  await settle();
  return host;
};

/**
 * Renders the **whole application frame** — header, navigation, content — at a
 * URL, with the screens it is given behind their patterns: what the shell does
 * around a screen is only visible with the shell there.
 */
export const showInShell = async (
  url: string,
  routes: Readonly<Record<string, (props: never) => JSX.Element>>,
): Promise<HTMLElement> => {
  window.history.replaceState({}, "", url);
  const host = document.createElement("div");
  document.body.append(host);
  disposers.push(
    render(
      () => (
        <Router root={AppShell}>
          {Object.entries(routes).map(([pattern, screen]) => (
            <Route path={pattern} component={screen as never} />
          ))}
        </Router>
      ),
      host,
    ),
  );
  await settle(10);
  return host;
};

/** What a node says, with every kind of space — the non-breaking ones too — folded into one. */
export const text = (node: Element | null | undefined): string =>
  (node?.textContent ?? "").replace(/\s+/g, " ");

/** Everything but percentages, points and ECB rates, which stay visible on purpose. */
export const figuresLeft = (shown: string): string =>
  shown
    .replace(/Tipo del BCE: [\d.,]+/g, "")
    .replace(/[\d.]+,\d+\s?(%|pp)/g, "")
    .replace(/[+−-]/g, "");

/** A Spanish decimal: a quantity, a price or an amount has one; a date does not. */
export const DECIMAL = /\d,\d/;

/** An identifier of an event of the ledger. */
export const ULID = /\b[0-9A-HJKMNP-TV-Z]{26}\b/;

/** Types into a control the way a person does: the value, then the event. */
export const type = (host: HTMLElement, id: string, value: string, event = "input"): void => {
  const control = host.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | null;
  if (control === null) {
    throw new Error(`no hay ningún control ${id}`);
  }
  control.value = value;
  control.dispatchEvent(new Event(event, { bubbles: true }));
};

export const choose = (host: HTMLElement, id: string, value: string): void =>
  type(host, id, value, "change");

export const press = async (host: HTMLElement, label: string): Promise<void> => {
  const button = [...host.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (button === undefined) {
    throw new Error(`no hay ningún botón «${label}»`);
  }
  button.click();
  await settle(30);
};

export const optionsOf = (host: HTMLElement, id: string): string[] =>
  [...(host.querySelector(`#${id}`) as HTMLSelectElement).options].map((option) => option.text);

/** Moves the clock the screens read "today" from, and only that clock. */
export const today = (date: string): void => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${date}T10:00:00.000Z`));
};
