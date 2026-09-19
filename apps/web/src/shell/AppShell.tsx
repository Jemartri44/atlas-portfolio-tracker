// The frame (docs/design/system.md §4.2): one header, one navigation inside it,
// the permanent band of a ledger with problems, and the content. The <nav>
// comes **before** <main> in the document, as the eye and the keyboard expect,
// and there is never a second navigation anywhere.
//
// Without any open ledger (the first run) there is no navigation at all:
// every destination needs data. An open ledger, even an empty one, shows it,
// because the first steps lead to Registrar and to Ajustes (D8).

import { A, useLocation } from "@solidjs/router";
import { ErrorBoundary, type JSX, Show } from "solid-js";
import { Icon } from "../components/Icon.jsx";
// Imported straight from their modules, not through the barrel: the shell is
// on the boot path, and a barrel drags everything it re-exports with it — the
// shared table, the chart layer and the date picker would all be downloaded
// before the first screen paints.
import { Notice } from "../components/Notice.jsx";
import { countOf } from "../format/number.js";
import { store } from "../ledger/state.js";
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

/** Whether a ledger is open or on its way: only the first run has none. */
const hasLedger = (): boolean => {
  const phase = store.load().phase;
  return phase !== "unconfigured" && phase !== "reconnect";
};

/**
 * Settings are current on their page, on everything under it, and — with data
 * open — on the page that changes their file (`/libro`), which is reached from
 * them and marked nothing at all.
 */
const SettingsButton = (): JSX.Element => {
  const location = useLocation();
  return (
    <a
      href="/ajustes"
      class="icon-button"
      aria-label="Ajustes"
      aria-current={
        inSection(location.pathname, "/ajustes") ||
        // Without data, «Abrir tus datos» already marks that page.
        (hasLedger() && inSection(location.pathname, "/libro"))
          ? "page"
          : undefined
      }
    >
      <Icon name="settings" />
    </a>
  );
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
        {props.children}
      </ErrorBoundary>
    </main>
  </div>
);
