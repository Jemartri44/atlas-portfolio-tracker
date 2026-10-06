// The frame (docs/design/system.md §4.2): one header, one navigation inside it,
// the permanent band of a ledger with problems, and the content. The <nav>
// comes **before** <main> in the document, as the eye and the keyboard expect,
// and there is never a second navigation anywhere.
//
// While the gate stands in for the application (no session, no connection) there
// is no navigation at all: every destination needs data. An open ledger, even an
// empty one, shows it, because the first steps lead to Registrar and to Ajustes.

import { A, useLocation } from "@solidjs/router";
import { createEffect, createMemo, ErrorBoundary, type JSX, lazy, onCleanup, Show } from "solid-js";
import { Icon } from "../components/Icon.jsx";
// Imported straight from their modules, not through the barrel: the shell is
// on the boot path, and a barrel drags everything it re-exports with it — the
// shared table, the chart layer and the date picker would all be downloaded
// before the first screen paints.
import { Notice } from "../components/Notice.jsx";
import { countOf } from "../format/number.js";
import { blocksTheApp, store } from "../ledger/state.js";
import { decodeFragment, historyGate, scrollToFragment } from "./anchor.js";
import { LedgerChip } from "./LedgerChip.jsx";
import { inSection, Nav } from "./Nav.jsx";
import { PrivacyToggle } from "./PrivacyToggle.jsx";

const DegradedBand = (): JSX.Element => (
  <Show when={store.invalidCount() > 0}>
    <aside class="band" role="status">
      <Icon name="danger" class="icon-sm" />
      <span>
        {countOf(store.invalidCount(), "movimiento inválido", "movimientos inválidos")} en tus
        datos: se puede consultar, no registrar.
      </span>
      <A href="/ajustes/verificacion">Verificar</A>
    </aside>
  </Show>
);

/**
 * The last line: a screen that throws leaves the shell standing and says so.
 *
 * Without this, `<main>` came out **empty** — nothing, no message, no way back —
 * whenever a lazily loaded screen could not be fetched, which is what happens
 * to an installed PWA that lost the network before its chunk was cached
 * (measured in the review of 2026-09-18: 0 characters inside `<main>`). The
 * navigation is outside the boundary on purpose: whatever broke, the other
 * destinations still work.
 */
const ScreenFailed = (props: { failure: unknown; retry: () => void }): JSX.Element => (
  <Notice
    severity="danger"
    title="Esta pantalla no ha podido abrirse"
    action={
      <div class="button-row">
        <button type="button" onClick={() => props.retry()}>
          Reintentar
        </button>
        <button type="button" class="secondary" onClick={() => window.location.reload()}>
          Recargar la aplicación
        </button>
      </div>
    }
  >
    Tus datos no se han tocado: esto es un fallo de la propia pantalla. Si acabas de perder la
    conexión, recarga cuando vuelvas a tenerla.
    <Show when={props.failure instanceof Error}>
      <p class="meta">{(props.failure as Error).message}</p>
    </Show>
  </Notice>
);

/** The cloud mode screen that stands in for the application (sign-in, offline, failed read). */
const CloudGate = lazy(() => import("./CloudGate.jsx"));

/** Whether the cloud boot has stopped the application: no data, no navigation. */
const gated = (): boolean => blocksTheApp(store.load());

/** The notice of a write whose answer was lost (`ledger/pending.ts`): lazy, nothing on the boot path. */
const PendingWrite = lazy(() => import("./PendingWrite.jsx"));

/** Whether there is a ledger to navigate: not while the gate stands in for the application. */
const hasLedger = (): boolean => !gated();

/** Settings are current on their page and on everything under it. */
const SettingsButton = (): JSX.Element => {
  const location = useLocation();
  return (
    <a
      href="/ajustes"
      class="icon-button"
      aria-label="Ajustes"
      aria-current={inSection(location.pathname, "/ajustes") ? "page" : undefined}
    >
      <Icon name="settings" />
    </a>
  );
};

/**
 * After entering by an address with a fragment, or following a link of the
 * application to one, the target under the bar once it exists
 * (`shell/anchor.ts`); never on the way back through the history, where the
 * browser restores the place. One of the few effects of the frame (ADR-0017).
 */
const FollowFragment = (): JSX.Element => {
  const location = useLocation();
  // `popstate` is the back or forward button; heard in the capture phase, so
  // it is known before the router moves the location and this effect runs.
  const gate = historyGate();
  const onHistory = (): void =>
    gate.popped(window.location.pathname + window.location.search + window.location.hash);
  const onClick = (): void => gate.clicked();
  window.addEventListener("popstate", onHistory, { capture: true });
  document.addEventListener("click", onClick, { capture: true });
  let waiting: AbortController | undefined;
  onCleanup(() => {
    window.removeEventListener("popstate", onHistory, { capture: true });
    document.removeEventListener("click", onClick, { capture: true });
    waiting?.abort();
  });
  // One run per address, not per signal: the router can notify the path and
  // the fragment apart, and the same address seen twice would pass the gate
  // on its second visit. The path too: the same fragment on another page is
  // another target.
  // The query too: the back button after a filter only changes it, and a
  // gate shut by it has to see that address to open again (PR #105, round 2).
  const address = createMemo(() => location.pathname + location.search + location.hash);
  createEffect(() => {
    const here = address();
    waiting?.abort();
    const control = new AbortController();
    waiting = control;
    // Decided once the event that moved the address has been dispatched to
    // everyone: in Chromium the router hears `popstate` before the frame does
    // and moves the location at once, so deciding here, synchronously, met a
    // gate nobody had shut yet (measured, round 1 of PR #105).
    setTimeout(() => {
      if (control.signal.aborted || !gate.follows(here)) {
        return;
      }
      const hashAt = here.indexOf("#");
      const id = hashAt < 0 ? undefined : decodeFragment(here.slice(hashAt));
      if (id !== undefined) {
        void scrollToFragment(id, { signal: control.signal });
      }
    }, 0);
  });
  return null;
};

export const AppShell = (props: { children?: JSX.Element }): JSX.Element => (
  <div class="app">
    <a href="#contenido" class="skip-link">
      Ir al contenido
    </a>
    <header class="topbar">
      <div class="topbar-inner">
        {/*
          A plain link, not the router's <A>: the router would mark it as the
          current page on "/", and the summary tab is already that.
        */}
        <a href="/" class="brand" aria-label="Atlas, ir al resumen">
          <Icon name="globe" class="mark" />
          <span>Atlas</span>
        </a>
        <Show when={hasLedger()}>
          <Nav />
        </Show>
        <div class="status">
          <LedgerChip />
          <PrivacyToggle />
          <SettingsButton />
        </div>
      </div>
    </header>
    <DegradedBand />
    <main id="contenido" class={`page${hasLedger() ? "" : " is-bare"}`}>
      <ErrorBoundary
        fallback={(failure, reset) => <ScreenFailed failure={failure} retry={reset} />}
      >
        {/* Inside the boundary: a fragment it cannot follow never blanks the page. */}
        <FollowFragment />
        <Show when={store.pending() !== undefined}>
          <PendingWrite />
        </Show>
        <Show when={!gated()} fallback={<CloudGate />}>
          {props.children}
        </Show>
      </ErrorBoundary>
    </main>
  </div>
);
